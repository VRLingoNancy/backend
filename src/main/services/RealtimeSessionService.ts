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

    let isSessionActive = false;
    let currentConversationId: string | null = null;
    let hasSentBootstrapResponse = false;
    let hasInitialTurnStarted = false;
    let bootstrapRetryCount = 0;
    let bootstrapFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (bootstrapFallbackTimer) {
        clearTimeout(bootstrapFallbackTimer);
        bootstrapFallbackTimer = null;
      }
      if (bootstrapRetryTimer) {
        clearTimeout(bootstrapRetryTimer);
        bootstrapRetryTimer = null;
      }
    };

    const sendBootstrapResponse = (force = false) => {
      if (hasInitialTurnStarted) {
        clearBootstrapTimers();
        return;
      }
      if (!force && hasSentBootstrapResponse) return;
      hasSentBootstrapResponse = true;
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
          retryCount: bootstrapRetryCount,
        },
        'Bootstrap response requested (assistant should speak first)'
      );
    };

    const scheduleBootstrapRetry = () => {
      if (bootstrapRetryTimer) {
        clearTimeout(bootstrapRetryTimer);
      }
      bootstrapRetryTimer = setTimeout(() => {
        if (hasInitialTurnStarted) {
          clearBootstrapTimers();
          return;
        }
        if (bootstrapRetryCount >= 2) {
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
        bootstrapRetryCount += 1;
        sendBootstrapResponse(true);
        scheduleBootstrapRetry();
      }, 5000);
    };

    const scheduleBootstrapFallback = () => {
      if (bootstrapFallbackTimer) {
        clearTimeout(bootstrapFallbackTimer);
      }
      bootstrapFallbackTimer = setTimeout(() => {
        sendBootstrapResponse();
        scheduleBootstrapRetry();
      }, 600);
    };

    openAIWs.on('open', () => {
      this.fastify.log.info('✅ Connected to OpenAI Realtime API');
    });

    openAIWs.on('message', async (data: WebSocket.RawData) => {
      try {
        const event = JSON.parse(data.toString()) as RealtimeEvent;
        const isResponseDone = event.type === 'response.done';

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
          isSessionActive = true;
          this.fastify.log.info(
            {
              targetLang,
              conversationContext: conversationContext || 'classic',
              transcriptionModel: 'gpt-4o-mini-transcribe',
            },
            '✨ Session initialized and configured'
          );
        }

        if (event.type === 'session.updated') {
          sendBootstrapResponse();
        }

        if (socket.readyState === WebSocket.OPEN && !isResponseDone) {
          socket.send(data.toString());
        }

        if (event.type === 'input_audio_buffer.committed' && event.item_id) {
          hasInitialTurnStarted = true;
          clearBootstrapTimers();
          rememberCommittedUserItem(event.item_id);
          if (!pendingTranscriptByItemId.has(event.item_id)) {
            pendingTranscriptByItemId.set(event.item_id, '');
          }
        }

        if (
          event.type === 'response.audio.delta' ||
          event.type === 'response.audio_transcript.delta'
        ) {
          hasInitialTurnStarted = true;
          clearBootstrapTimers();
        }

        if (
          event.type === 'conversation.item.input_audio_transcription.delta' &&
          event.item_id &&
          typeof event.delta === 'string'
        ) {
          const previous = pendingTranscriptByItemId.get(event.item_id) || '';
          pendingTranscriptByItemId.set(event.item_id, previous + event.delta);
        }

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

        if (
          event.type === 'conversation.item.input_audio_transcription.failed' &&
          event.item_id
        ) {
          this.fastify.log.warn(
            { itemId: event.item_id, event },
            'User input transcription failed'
          );
        }

        if (
          event.type === 'conversation.item.created' &&
          event.item?.role === 'user'
        ) {
          this.fastify.log.debug(
            {
              itemId: event.item.id,
              contentTypes:
                event.item.content?.map((part) => part.type).filter(Boolean) ||
                [],
            },
            'User conversation item created'
          );
        }

        if (event.type === 'response.done') {
          hasInitialTurnStarted = true;
          clearBootstrapTimers();
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
              response.output.forEach((item) => {
                item.content?.forEach((contentPart) => {
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
            this.fastify.log.info(
              {
                usage,
                persistedUserItemId,
                userTranscriptLength: transcriptForTurn.length,
                aiContentLength: aiContent.length,
              },
              'OpenAI Realtime response completed'
            );
            try {
              const result = await this.conversationService.logRealtimeTurn(
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
                REALTIME_LIMITS.MODEL,
                targetLang
              );
              currentConversationId = result.conversationId;
              clearPersistedTranscript(persistedUserItemId);
            } catch (dbError) {
              this.fastify.log.error(
                {
                  err: dbError,
                  persistedUserItemId,
                },
                'Failed to persist Realtime turn'
              );
            }
          }
        }
      } catch (err) {
        this.fastify.log.error({ err }, 'Error processing OpenAI message');
      }
    });

    socket.on('message', (data: WebSocket.RawData) => {
      if (!isSessionActive) return;
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

    openAIWs.on('close', (code, reason) => {
      clearBootstrapTimers();
      this.fastify.log.info(
        { code, reason: reason.toString() },
        'OpenAI connection closed'
      );
      if (socket.readyState === WebSocket.OPEN) socket.close();
    });

    openAIWs.on('error', (error) => {
      this.fastify.log.error({ err: error }, 'OpenAI WebSocket error');
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1011, 'Upstream error');
      }
    });
  }
}
