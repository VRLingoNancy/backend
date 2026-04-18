import { FastifyPluginAsync, FastifySchema } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { REALTIME_LIMITS, SessionGuard } from '../../../config/realtime-limits';
import { ConversationService } from '../../../services/ConversationService';

type RealtimeContentPart = {
  type?: string;
  text?: string;
  transcript?: string;
};

type RealtimeUserItem = {
  id?: string;
  role?: string;
  content?: RealtimeContentPart[];
};

type RealtimeEvent = {
  type: string;
  item_id?: string;
  previous_item_id?: string;
  delta?: string;
  transcript?: string;
  item?: RealtimeUserItem;
  response?: {
    id?: string;
    status?: string;
    output?: Array<{
      id?: string;
      role?: string;
      content?: RealtimeContentPart[];
    }>;
    usage?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      input_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
      };
      output_token_details?: {
        text_tokens?: number;
        audio_tokens?: number;
      };
    };
  };
};

const realtimeRoutes: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  fastify.get('/connect-info', {
    schema: {
      summary: 'ℹ️ WebSocket Connection Info',
      description: `
### 🔌 Realtime Audio WebSocket

To start a conversation, connect via WebSocket to:
\`ws://{host}/api/realtime/session?lang={code}\`

**Parameters:**
- \`lang\` (Required): Target language code (e.g. 'it-IT', 'en-US')
- \`Authorization\`: Bearer Token (JWT)

**Protocol:**
- **Client sends:** JSON events (audio buffer append / commit / response.create)
- **Server sends:** JSON events (audio delta, transcript, lifecycle)
      `,
      tags: ['realtime', 'ai'],
      response: {
        200: z.object({
          url: z.string().describe('The WebSocket URL to connect to'),
          status: z.string(),
        }),
      },
    },
    handler: async (req) => ({
      url: `ws://${req.hostname}/api/realtime/session`,
      status: 'See documentation description for protocol details',
    }),
  });

  const schema: FastifySchema = {
    summary: 'Realtime AI Conversation Session',
    description:
      'Establishes a WebSocket connection for realtime audio/text conversation with OpenAI. Requires `ws://` or `wss://` protocol. The connection uses the OpenAI Realtime API.',
    tags: ['realtime', 'ai'],
    security: [{ bearerAuth: [] }],
    querystring: z.object({
      lang: z
        .string()
        .optional()
        .describe(
          'Target language code (e.g., "it-IT", "en-US"). Defaults to "en-US".'
        ),
    }),
    response: {
      101: z
        .null()
        .describe('Switching Protocols - WebSocket connection established'),
    },
  };

  fastify.get(
    '/session',
    { websocket: true, preHandler: [fastify.authenticate], schema },
    async (connection: WebSocket.WebSocket, request) => {
      const socket = connection;
      // @ts-ignore
      const userId = request.user.sub as string;

      const query = request.query as { lang?: string };
      const targetLang = query.lang || 'en-US';

      fastify.log.info(
        { userId, targetLang, model: REALTIME_LIMITS.MODEL },
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

      /**
       * Why these maps?
       * - Realtime events are asynchronous and may arrive slightly out of order.
       * - input_audio_transcription is separate from the model's native audio understanding.
       * - We persist only the completed transcription event, never the user item text fallback.
       */
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

      openAIWs.on('open', () => {
        fastify.log.info('✅ Connected to OpenAI Realtime API');
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
                instructions: `Tu es VRLingo, un professeur de langues expert.
L'utilisateur souhaite pratiquer la langue suivante : ${targetLang}.
Détecte automatiquement si l'utilisateur parle cette langue ou sa langue maternelle, puis adapte ta réponse.
Si l'utilisateur s'exprime dans sa langue maternelle, aide-le à reformuler dans la langue cible (${targetLang}).
Corrige les erreurs importantes de manière bienveillante.
Réponds principalement dans la langue cible (${targetLang}), sauf si une explication courte dans une autre langue est nécessaire.`,
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
            isSessionActive = true;
            fastify.log.info(
              { targetLang, transcriptionModel: 'gpt-4o-mini-transcribe' },
              '✨ Session initialized and configured'
            );
          }

          // Relay everything to the VR client so the frontend stays fully event-driven.
          // For response.done, we skip raw relay and send an enriched event later.
          if (socket.readyState === WebSocket.OPEN && !isResponseDone) {
            socket.send(data.toString());
          }

          // Track user audio commits so we can associate later transcript events with a turn.
          if (event.type === 'input_audio_buffer.committed' && event.item_id) {
            rememberCommittedUserItem(event.item_id);
            if (!pendingTranscriptByItemId.has(event.item_id)) {
              pendingTranscriptByItemId.set(event.item_id, '');
            }
          }

          // Incremental user transcript stream.
          if (
            event.type === 'conversation.item.input_audio_transcription.delta' &&
            event.item_id &&
            typeof event.delta === 'string'
          ) {
            const previous = pendingTranscriptByItemId.get(event.item_id) || '';
            pendingTranscriptByItemId.set(event.item_id, previous + event.delta);
          }

          // Final user transcript. This is the only transcript we persist.
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

            fastify.log.debug(
              {
                itemId: event.item_id,
                transcript: event.transcript,
              },
              'Completed user input transcription received'
            );
          }

          if (
            event.type ===
              'conversation.item.input_audio_transcription.failed' &&
            event.item_id
          ) {
            fastify.log.warn(
              { itemId: event.item_id, event },
              'User input transcription failed'
            );
          }

          // Keep this only for observability. We do NOT use item.content text as transcript fallback.
          if (
            event.type === 'conversation.item.created' &&
            event.item?.role === 'user'
          ) {
            fastify.log.debug(
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
            sessionGuard.incrementTurn();
            const response = event.response;
            const { itemId: persistedUserItemId, transcript: userTranscript } =
              getTranscriptForPersistence();
            const transcriptForTurn =
              userTranscript.trim() || getMostRecentNonEmptyTranscript();

            // Always send an enriched response.done to the client, even for interrupted/cancelled turns.
            if (socket.readyState === WebSocket.OPEN) {
              const enrichedEvent = {
                ...event,
                user_transcript: transcriptForTurn,
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

              fastify.log.info(
                {
                  usage,
                  persistedUserItemId,
                  userTranscriptLength: transcriptForTurn.length,
                  aiContentLength: aiContent.length,
                },
                'OpenAI Realtime response completed'
              );

              // --- Ajout de la question utilisateur dans la réponse envoyée au client ---
              if (socket.readyState === WebSocket.OPEN) {
                const enrichedEvent = {
                  ...event,
                  user_transcript: transcriptForTurn,
                };
                socket.send(JSON.stringify(enrichedEvent));
              }

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
                    completionTextTokens: Number(
                      outputDetails.text_tokens || 0
                    ),
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
        } catch (err) {
          fastify.log.error({ err }, 'Error processing OpenAI message');
        }
      });

      socket.on('message', (data: WebSocket.RawData) => {
        if (!isSessionActive) return;

        try {
          sessionGuard.checkLimits();

          /**
           * Expected payload from VR client:
           * {
           *   "type": "input_audio_buffer.append",
           *   "audio": "<BASE64_PCM16>"
           * }
           *
           * The client may also send:
           * - input_audio_buffer.commit
           * - response.create
           * - other valid Realtime JSON events
           *
           * The client must not send raw binary blobs directly to this server.
           */
          const messageString = data.toString();

          try {
            JSON.parse(messageString);
          } catch {
            fastify.log.warn('Ignoring non-JSON WebSocket payload from client');
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
        fastify.log.info({ userId }, 'Client VR disconnected');
        if (openAIWs.readyState === WebSocket.OPEN) openAIWs.close();
      });

      openAIWs.on('close', (code, reason) => {
        fastify.log.info(
          { code, reason: reason.toString() },
          'OpenAI connection closed'
        );
        if (socket.readyState === WebSocket.OPEN) socket.close();
      });

      openAIWs.on('error', (error) => {
        fastify.log.error({ err: error }, 'OpenAI WebSocket error');
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1011, 'Upstream error');
        }
      });
    }
  );
};

export default realtimeRoutes;