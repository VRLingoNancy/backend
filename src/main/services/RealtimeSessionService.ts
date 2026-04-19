import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';
import { REALTIME_LIMITS, SessionGuard } from '../config/realtime-limits';
import { ConversationService } from './ConversationService';
import {
  isSupportedLang,
  normalizeLangCode,
} from '../routes/api/realtime/realtime.languages';
import {
  getSessionInstructions,
  buildBootstrapPrompt,
} from '../routes/api/realtime/realtime.prompts';
import type {
  RealtimeConversationContext,
  RealtimeEvent,
} from '../routes/api/realtime/realtime.types';

export class RealtimeSessionService {
  private fastify: FastifyInstance;
  private conversationService: ConversationService;
  // State variables moved to instance properties
  private isSessionActive = false;
  private currentConversationId: string | null = null;
  private hasSentBootstrapResponse = false;
  private hasInitialTurnStarted = false;
  private bootstrapRetryCount = 0;
  private bootstrapFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    fastify: FastifyInstance,
    conversationService: ConversationService
  ) {
    this.fastify = fastify;
    this.conversationService = conversationService;
  }

  public handleSession(
    socket: WebSocket,
    userId: string,
    targetLang: string,
    conversationContext?: RealtimeConversationContext
  ) {
    const normLang = normalizeLangCode(targetLang);
    if (!isSupportedLang(normLang)) {
      socket.close(4000, `Langue non supportée: ${targetLang}`);
      this.fastify.log.warn(
        { userId, targetLang, normLang },
        'Langue non supportée, connexion refusée'
      );
      return;
    }
    const effectiveLang = normLang;
    const isMedievalContext = conversationContext === 'medieval';

    this.fastify.log.info(
      {
        userId,
        targetLang,
        conversationContext: conversationContext || 'classic',
        model: REALTIME_LIMITS.MODEL,
      },
      'Realtime session initiating...'
    );

    const apiKey = process.env.CHATGPT_API_KEY;
    if (!apiKey) {
      socket.close(1011, 'Server configuration error');
      return;
    }

    const sessionGuard = new SessionGuard();
    const url = `wss://api.openai.com/v1/realtime?model=${REALTIME_LIMITS.MODEL}`;
    const openAIWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });


    // Reset state for each session
    this.isSessionActive = false;
    this.currentConversationId = null;
    this.hasSentBootstrapResponse = false;
    this.hasInitialTurnStarted = false;
    this.bootstrapRetryCount = 0;
    this.bootstrapFallbackTimer = null;
    this.bootstrapRetryTimer = null;

    const pendingTranscriptByItemId = new Map<string, string>();
    const recentCommittedUserItemIds: string[] = [];

    const rememberCommittedUserItem = (itemId: string) => {
      recentCommittedUserItemIds.push(itemId);
      if (recentCommittedUserItemIds.length > 20) {
        recentCommittedUserItemIds.shift();
      }
    };

    const getLatestCommittedUserItemId = (): string | null => {
      return recentCommittedUserItemIds.length
        ? recentCommittedUserItemIds[recentCommittedUserItemIds.length - 1]
        : null;
    };

    const getTranscriptForPersistence = (): {
      itemId: string | null;
      transcript: string;
    } => {
      const latestItemId = getLatestCommittedUserItemId();
      if (!latestItemId) {
        return { itemId: null, transcript: '' };
      }
      return {
        itemId: latestItemId,
        transcript: pendingTranscriptByItemId.get(latestItemId) || '',
      };
    };

    const getMostRecentNonEmptyTranscript = (): string => {
      for (let i = recentCommittedUserItemIds.length - 1; i >= 0; i -= 1) {
        const itemId = recentCommittedUserItemIds[i];
        const transcript = (pendingTranscriptByItemId.get(itemId) || '').trim();
        if (transcript) {
          return transcript;
        }
      }
      return '';
    };

    const clearPersistedTranscript = (itemId: string | null) => {
      if (!itemId) return;
      pendingTranscriptByItemId.delete(itemId);
      const idx = recentCommittedUserItemIds.lastIndexOf(itemId);
      if (idx >= 0) {
        recentCommittedUserItemIds.splice(idx, 1);
      }
    };

    const buildSessionInstructions = (): string => {
      return getSessionInstructions(effectiveLang, isMedievalContext);
    };

    const buildBootstrapPromptText = (): string => {
      this.fastify.log.info(
        {
          targetLang,
          effectiveLang,
          context: isMedievalContext ? 'medieval' : 'classic',
        },
        '[BOOTSTRAP] Prompt language'
      );
      return buildBootstrapPrompt(effectiveLang, isMedievalContext);
    };


    const clearBootstrapTimers = () => {
      if (this.bootstrapFallbackTimer) {
        clearTimeout(this.bootstrapFallbackTimer);
        this.bootstrapFallbackTimer = null;
      }
      if (this.bootstrapRetryTimer) {
        clearTimeout(this.bootstrapRetryTimer);
        this.bootstrapRetryTimer = null;
      }
    };

    const sendBootstrapResponse = (force = false) => {
      if (this.hasInitialTurnStarted) {
        clearBootstrapTimers();
        return;
      }
      if (!force && this.hasSentBootstrapResponse) return;
      this.hasSentBootstrapResponse = true;
      const bootstrapResponse = {
        type: 'response.create',
        response: {
          conversation: 'none',
          modalities: ['text', 'audio'],
          instructions: buildBootstrapPromptText(),
          max_output_tokens: 512,
          temperature: 0.6,
        },
      };
      openAIWs.send(JSON.stringify(bootstrapResponse));
      this.fastify.log.info(
        {
          targetLang,
          conversationContext: conversationContext || 'classic',
          forcedRetry: force,
          retryCount: this.bootstrapRetryCount,
        },
        'Bootstrap response requested (assistant should speak first)'
      );
    };

    const scheduleBootstrapRetry = () => {
      if (this.bootstrapRetryTimer) {
        clearTimeout(this.bootstrapRetryTimer);
      }
      this.bootstrapRetryTimer = setTimeout(() => {
        if (this.hasInitialTurnStarted) {
          clearBootstrapTimers();
          return;
        }
        if (this.bootstrapRetryCount >= 2) {
          this.fastify.log.warn(
            {
              targetLang,
              conversationContext: conversationContext || 'classic',
            },
            'No initial assistant turn detected after bootstrap retries'
          );
          clearBootstrapTimers();
          return;
        }
        this.bootstrapRetryCount += 1;
        sendBootstrapResponse(true);
        scheduleBootstrapRetry();
      }, 5000);
    };

    const scheduleBootstrapFallback = () => {
      if (this.bootstrapFallbackTimer) {
        clearTimeout(this.bootstrapFallbackTimer);
      }
      this.bootstrapFallbackTimer = setTimeout(() => {
        sendBootstrapResponse();
        scheduleBootstrapRetry();
      }, 600);
    };


    // All event handlers must be inside the method, not at class scope
    // All event handlers must be inside the method, not at class scope
    openAIWs.on('open', () => {
      this.fastify.log.info('✅ Connected to OpenAI Realtime API');
    });

    openAIWs.on('message', async (data: WebSocket.RawData) => {
      try {
        const event = JSON.parse(data.toString()) as RealtimeEvent;
        const isResponseDone = event.type === 'response.done';

        this.handleSessionCreated(event, openAIWs, buildSessionInstructions, scheduleBootstrapFallback, conversationContext, targetLang);
        this.handleSessionUpdated(event, sendBootstrapResponse);
        this.forwardNonDoneEventsToClient(event, socket, data, isResponseDone);
        this.handleInputAudioBufferCommitted(event, clearBootstrapTimers, rememberCommittedUserItem, pendingTranscriptByItemId);
        this.handleAudioDeltaEvents(event, clearBootstrapTimers);
        this.handleTranscriptionDelta(event, pendingTranscriptByItemId);
        this.handleTranscriptionCompleted(event, rememberCommittedUserItem, recentCommittedUserItemIds, pendingTranscriptByItemId);
        this.handleTranscriptionFailed(event);
        this.handleUserItemCreated(event);
        await this.handleResponseDoneEvent(event, sessionGuard, getTranscriptForPersistence, getMostRecentNonEmptyTranscript, socket, this.currentConversationId, this.conversationService, userId, targetLang, REALTIME_LIMITS.MODEL, clearPersistedTranscript, this.fastify);
      } catch (err) {
        this.fastify.log.error({ err }, 'Error processing OpenAI message');
      }
    });

    socket.on('message', (data: WebSocket.RawData) => {
      if (!this.isSessionActive) return;
      try {
        sessionGuard.checkLimits();
        const messageString = data.toString();
        try {
          JSON.parse(messageString);
        } catch {
          this.fastify.log.warn(
            'Ignoring non-JSON WebSocket payload from client'
          );
          return;
        }
        if (openAIWs.readyState === WebSocket.OPEN) {
          openAIWs.send(messageString);
        }
      } catch (error) {
        if (error instanceof Error) {
          socket.close(1000, error.message);
          openAIWs.close();
        }
      }
    });

    socket.on('close', () => {
      this.fastify.log.info({ userId }, 'Client VR disconnected');
      clearBootstrapTimers();
      if (openAIWs.readyState === WebSocket.OPEN) openAIWs.close();
    });

    openAIWs.on('close', (code: any, reason: any) => {
      clearBootstrapTimers();
      this.fastify.log.info(
        { code, reason: reason?.toString() },
        'OpenAI connection closed'
      );
      if (socket.readyState === WebSocket.OPEN) socket.close();
    });

    openAIWs.on('error', (error: any) => {
      this.fastify.log.error({ err: error }, 'OpenAI WebSocket error');
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1011, 'Upstream error');
      }
    });
  }

  // --- Helper methods for complexity reduction ---
  private handleSessionCreated(event: any, openAIWs: any, buildSessionInstructions: any, scheduleBootstrapFallback: any, conversationContext: any, targetLang: any) {
    if (event.type === 'session.created') {
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildSessionInstructions(),
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          turn_detection: {
            type: 'server_vad',
          },
          input_audio_transcription: {
            model: 'gpt-4o-mini-transcribe',
          },
        },
      };
      openAIWs.send(JSON.stringify(sessionConfig));
      scheduleBootstrapFallback();
      this.isSessionActive = true;
      this.fastify.log.info(
        {
          targetLang,
          conversationContext: conversationContext || 'classic',
          transcriptionModel: 'gpt-4o-mini-transcribe',
        },
        '✨ Session initialized and configured'
      );
    }
  }

  private handleSessionUpdated(event: any, sendBootstrapResponse: any) {
    if (event.type === 'session.updated') {
      sendBootstrapResponse();
    }
  }

  private forwardNonDoneEventsToClient(event: any, socket: any, data: any, isResponseDone: boolean) {
    if (socket.readyState === WebSocket.OPEN && !isResponseDone) {
      socket.send(data.toString());
    }
  }

  private handleInputAudioBufferCommitted(event: any, clearBootstrapTimers: any, rememberCommittedUserItem: any, pendingTranscriptByItemId: any) {
    if (event.type === 'input_audio_buffer.committed' && event.item_id) {
      this.hasInitialTurnStarted = true;
      clearBootstrapTimers();
      rememberCommittedUserItem(event.item_id);
      if (!pendingTranscriptByItemId.has(event.item_id)) {
        pendingTranscriptByItemId.set(event.item_id, '');
      }
    }
  }

  private handleAudioDeltaEvents(event: any, clearBootstrapTimers: any) {
    if (
      event.type === 'response.audio.delta' ||
      event.type === 'response.audio_transcript.delta'
    ) {
      this.hasInitialTurnStarted = true;
      clearBootstrapTimers();
    }
  }

  private handleTranscriptionDelta(event: any, pendingTranscriptByItemId: any) {
    if (
      event.type === 'conversation.item.input_audio_transcription.delta' &&
      event.item_id &&
      typeof event.delta === 'string'
    ) {
      const previous = pendingTranscriptByItemId.get(event.item_id) || '';
      pendingTranscriptByItemId.set(event.item_id, previous + event.delta);
    }
  }

  private handleTranscriptionCompleted(event: any, rememberCommittedUserItem: any, recentCommittedUserItemIds: any, pendingTranscriptByItemId: any) {
    if (
      event.type ===
        'conversation.item.input_audio_transcription.completed' &&
      event.item_id &&
      typeof event.transcript === 'string'
    ) {
      if (!recentCommittedUserItemIds.includes(event.item_id)) {
        rememberCommittedUserItem(event.item_id);
      }
      pendingTranscriptByItemId.set(event.item_id, event.transcript.trim());
      this.fastify.log.debug(
        {
          itemId: event.item_id,
          transcript: event.transcript,
        },
        'Completed user input transcription received'
      );
    }
  }

  private handleTranscriptionFailed(event: any) {
    if (
      event.type === 'conversation.item.input_audio_transcription.failed' &&
      event.item_id
    ) {
      this.fastify.log.warn(
        { itemId: event.item_id, event },
        'User input transcription failed'
      );
    }
  }

  private handleUserItemCreated(event: any) {
    if (
      event.type === 'conversation.item.created' &&
      event.item?.role === 'user'
    ) {
      this.fastify.log.debug(
        {
          itemId: event.item.id,
          contentTypes:
            event.item.content?.map((part: any) => part.type).filter(Boolean) ||
            [],
        },
        'User conversation item created'
      );
    }
  }

  private async handleResponseDoneEvent(
    event: any,
    sessionGuard: any,
    getTranscriptForPersistence: any,
    getMostRecentNonEmptyTranscript: any,
    socket: any,
    currentConversationId: any,
    conversationService: any,
    userId: any,
    targetLang: any,
    model: any,
    clearPersistedTranscript: any,
    fastify: any
  ) {
    if (event.type === 'response.done') {
      this.hasInitialTurnStarted = true;
      clearPersistedTranscript = clearPersistedTranscript || (() => {});
      sessionGuard.incrementTurn();
      const response = event.response;
      const { itemId: persistedUserItemId, transcript: userTranscript } =
        getTranscriptForPersistence();
      const transcriptForTurn =
        userTranscript.trim() || getMostRecentNonEmptyTranscript();

      if (socket.readyState === WebSocket.OPEN) {
        const enrichedEvent = {
          ...event,
          user_transcript: transcriptForTurn,
          conversation_id: currentConversationId,
        };
        socket.send(JSON.stringify(enrichedEvent));
      }

      if (response && response.status === 'completed') {
        let aiContent = '';
        if (response.output) {
          response.output.forEach((item: any) => {
            item.content?.forEach((contentPart: any) => {
              if (typeof contentPart.transcript === 'string') {
                aiContent += contentPart.transcript;
              } else if (typeof contentPart.text === 'string') {
                aiContent += contentPart.text;
              }
            });
          });
        }
        const usage = response.usage || {
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
        };
        const inputDetails = usage.input_token_details || {};
        const outputDetails = usage.output_token_details || {};
        fastify.log.info(
          {
            usage,
            persistedUserItemId,
            userTranscriptLength: transcriptForTurn.length,
            aiContentLength: aiContent.length,
          },
          'OpenAI Realtime response completed'
        );
        try {
          const result = await conversationService.logRealtimeTurn(
            userId,
            currentConversationId,
            transcriptForTurn,
            aiContent,
            {
              promptTokens: Number(
                usage.input_tokens || usage.prompt_tokens || 0
              ),
              completionTokens: Number(
                usage.output_tokens || usage.completion_tokens || 0
              ),
              totalTokens: Number(usage.total_tokens || 0),
              promptTextTokens: Number(inputDetails.text_tokens || 0),
              promptAudioTokens: Number(inputDetails.audio_tokens || 0),
              completionTextTokens: Number(outputDetails.text_tokens || 0),
              completionAudioTokens: Number(
                outputDetails.audio_tokens || 0
              ),
            },
            model,
            targetLang
          );
          this.currentConversationId = result.conversationId;
          clearPersistedTranscript(persistedUserItemId);
        } catch (dbError) {
          fastify.log.error(
            {
              err: dbError,
              persistedUserItemId,
            },
            'Failed to persist Realtime turn'
          );
        }
      }
    }
  }
}
