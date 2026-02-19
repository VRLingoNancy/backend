import { FastifyPluginAsync, FastifySchema } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { REALTIME_LIMITS, SessionGuard } from '../../../config/realtime-limits';
import { ConversationService } from '../../../services/ConversationService';

const realtimeRoutes: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);
  const realtimeDebug = process.env.REALTIME_DEBUG === 'true';

  // --- ROUTE DE DOCUMENTATION (DUMMY) ---
  // Cette route sert uniquement à documenter le WebSocket dans Swagger UI
  // car certains générateurs ignorent les routes { websocket: true }
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
- **Client sends:** JSON events (audio buffer append)
- **Server sends:** JSON events (audio delta, transcript)
        `,
      tags: ['realtime', 'ai'],
      response: {
        200: z.object({
          url: z.string().describe('The WebSocket URL to connect to'),
          status: z.string(),
        }),
      },
    },
    handler: async (req) => {
      return {
        url: `ws://${req.hostname}/api/realtime/session`,
        status: 'See documentation description for protocol details',
      };
    },
  });
  // --- FIN ROUTE DOCUMENTATION ---

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
      traceId: z
        .string()
        .optional()
        .describe(
          'Optional client trace identifier for correlating Unity and backend logs.'
        ),
    }),
    response: {
      101: z
        .null()
        .describe('Switching Protocols - WebSocket connection established'),
    },
  };

  // NOTE IMPORTANTE: Cette route nécessite une connexion WebSocket (ws:// ou wss://)
  // Le client ne doit pas utiliser HTTP GET standard ici.
  fastify.get(
    '/session',
    { websocket: true, preHandler: [fastify.authenticate], schema },
    async (connection: WebSocket.WebSocket, request) => {
      const socket = connection;
      const userId = request.user.sub;

      // Récupération de la langue cible passée en paramètre (ex: ?lang=it-IT)
      const query = request.query as { lang?: string; traceId?: string };
      const targetLang = query.lang || 'en-US'; // Par défaut anglais si non spécifié
      const traceId = query.traceId || request.id;
      let currentTurnTraceId = '';
      let currentTurnStartedAt = 0;

      fastify.log.info(
        { traceId, userId, targetLang, requestIp: request.ip },
        'Realtime session initiating...'
      );

      const apiKey = process.env.CHATGPT_API_KEY;
      if (!apiKey) {
        socket.close(1011, 'Server configuration error');
        return;
      }

      const sessionGuard = new SessionGuard();

      // Utilisation du modèle défini dans la configuration (ex: gpt-4o-mini-realtime-preview)
      const url = `wss://api.openai.com/v1/realtime?model=${REALTIME_LIMITS.MODEL}`;

      const openAIWs = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      let isSessionActive = false;
      let currentConversationId: string | null = null;
      let pendingUserTranscript: string = '';

      openAIWs.on('open', () => {
        fastify.log.info({ traceId }, 'Connected to OpenAI Realtime API');
      });

      openAIWs.on('message', async (data: WebSocket.RawData) => {
        try {
          const event = JSON.parse(data.toString());
          if (
            realtimeDebug ||
            event.type === 'response.done' ||
            event.type === 'error'
          ) {
            fastify.log.info(
              {
                traceId,
                turnTraceId: currentTurnTraceId || undefined,
                openAiEventType: event.type,
              },
              'OpenAI -> backend event'
            );
          }

          // Initialisation de la session
          if (event.type === 'session.created') {
            const sessionConfig = {
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                instructions: `Tu es VRLingo, un professeur de langues expert.
                             L'utilisateur souhaite pratiquer la langue suivante : ${targetLang}.
                             Détecte automatiquement si l'utilisateur parle cette langue ou sa langue maternelle, et adapte-toi.
                             Si l'audio est ambiguë, privilégie la langue cible (${targetLang}) pour la transcription.
                             Sois encourageant et corrige les erreurs importantes de manière bienveillante.`,
                voice: 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                turn_detection: { type: 'server_vad' },
                // AJOUT CRUCIAL: On demande explicitement la transcription de l'audio utilisateur
                // pour pouvoir le stocker en base de données.
                input_audio_transcription: {
                  model: 'whisper-1',
                },
              },
            };
            openAIWs.send(JSON.stringify(sessionConfig));
            isSessionActive = true;
            fastify.log.info({ traceId }, 'Realtime session configured');
          }

          // Relayer l'événement au client VR
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(data.toString());
          }

          // --- Logique Métier & BDD ---

          if (
            event.type ===
              'conversation.item.input_audio_transcription.completed' &&
            event.transcript
          ) {
            pendingUserTranscript = event.transcript;
            fastify.log.info(
              {
                traceId,
                turnTraceId: currentTurnTraceId || undefined,
                transcriptLength: String(event.transcript).length,
              },
              'Realtime transcript received'
            );
          }

          if (
            event.type === 'conversation.item.created' &&
            event.item?.role === 'user'
          ) {
            const content = event.item.content?.find(
              (c: { type: string; text?: string }) =>
                c.type === 'input_text' || c.type === 'text'
            );
            if (content?.text) pendingUserTranscript = content.text;
          }

          if (event.type === 'response.done') {
            sessionGuard.incrementTurn();
            const response = event.response;

            if (response && response.status === 'completed') {
              let aiContent = '';
              if (response.output) {
                response.output.forEach(
                  (item: {
                    content?: Array<{ transcript?: string; text?: string }>;
                  }) => {
                    if (item.content) {
                      item.content.forEach((c) => {
                        if (c.transcript) aiContent += c.transcript;
                        else if (c.text) aiContent += c.text;
                      });
                    }
                  }
                );
              }

              const usage = response.usage || {
                total_tokens: 0,
                input_tokens: 0,
                output_tokens: 0,
              };

              // Compatibilité avec la structure renvoyée par OpenAI Realtime
              // Note: les champs s'appellent input_token_details et output_token_details
              const inputDetails = usage.input_token_details || {};
              const outputDetails = usage.output_token_details || {};

              fastify.log.info({ usage }, 'Usage des tokens OpenAI :');
              fastify.log.info(
                {
                  traceId,
                  turnTraceId: currentTurnTraceId || undefined,
                  durationMs:
                    currentTurnStartedAt > 0
                      ? Date.now() - currentTurnStartedAt
                      : undefined,
                  aiResponseLength: aiContent.length,
                },
                'Realtime response completed'
              );

              try {
                const result = await conversationService.logRealtimeTurn(
                  userId,
                  currentConversationId,
                  pendingUserTranscript,
                  aiContent,
                  {
                    promptTokens: Number(
                      usage.input_tokens || usage.prompt_tokens || 0
                    ),
                    completionTokens: Number(
                      usage.output_tokens || usage.completion_tokens || 0
                    ),
                    totalTokens: Number(usage.total_tokens || 0),
                    // Mapping des détails audio/texte
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
                  targetLang // Passage de la langue
                );

                currentConversationId = result.conversationId;
                pendingUserTranscript = '';
                currentTurnTraceId = '';
                currentTurnStartedAt = 0;
              } catch (dbError) {
                fastify.log.error(
                  {
                    traceId,
                    turnTraceId: currentTurnTraceId || undefined,
                    err: dbError,
                  },
                  'Failed to persist Realtime turn'
                );
              }
            }
          }
        } catch (err) {
          fastify.log.error(
            { traceId, turnTraceId: currentTurnTraceId || undefined, err },
            'Error processing OpenAI message'
          );
        }
      });

      // Relayer les messages du Client VR vers OpenAI
      socket.on('message', (data: WebSocket.RawData) => {
        // Protection : on ignore les messages tant que la session n'est pas prête
        if (!isSessionActive) return;

        try {
          sessionGuard.checkLimits();

          // Validation : OpenAI attend des événements JSON, pas de flux binaire brut.
          // --- FORMAT ATTENDU DU CLIENT VR ---
          // Pour l'audio, le client doit envoyer :
          // {
          //   "type": "input_audio_buffer.append",
          //   "audio": "<BASE64_STRING_OF_PCM16_AUDIO>"
          // }
          // Le client NE DOIT PAS faire de STT (Speech-to-Text) localement.
          // Le client NE DOIT PAS envoyer de binaire brut (Blob/ArrayBuffer).
          // -----------------------------------
          const messageString = data.toString();
          let clientEvent:
            | { type?: string; event_id?: string; audio?: string }
            | undefined;
          try {
            clientEvent = JSON.parse(messageString) as {
              type?: string;
              event_id?: string;
              audio?: string;
            };
          } catch {
            fastify.log.warn(
              { traceId },
              'Dropped non-JSON WebSocket client payload'
            );
            return; // Ignore les données non-JSON (ex: audio binaire mal formaté)
          }

          if (clientEvent.type === 'response.create') {
            currentTurnTraceId = clientEvent.event_id || '';
            currentTurnStartedAt = Date.now();
          }

          if (
            realtimeDebug ||
            clientEvent.type !== 'input_audio_buffer.append'
          ) {
            fastify.log.info(
              {
                traceId,
                turnTraceId: currentTurnTraceId || undefined,
                clientEventType: clientEvent.type,
                clientEventId: clientEvent.event_id,
                audioChunkBase64Length: clientEvent.audio?.length,
              },
              'Client -> backend realtime event'
            );
          }

          if (openAIWs.readyState === WebSocket.OPEN) {
            openAIWs.send(messageString);
          }
        } catch (error) {
          if (error instanceof Error) {
            fastify.log.error(
              {
                traceId,
                turnTraceId: currentTurnTraceId || undefined,
                err: error,
              },
              'Realtime session guard triggered'
            );
            socket.close(1000, error.message);
            openAIWs.close();
          }
        }
      });

      socket.on('close', () => {
        fastify.log.info({ traceId, userId }, 'Client VR disconnected');
        if (openAIWs.readyState === WebSocket.OPEN) openAIWs.close();
      });

      openAIWs.on('close', (code, reason) => {
        fastify.log.info(
          { traceId, code, reason: reason.toString() },
          'OpenAI connection closed'
        );
        if (socket.readyState === WebSocket.OPEN) socket.close();
      });

      openAIWs.on('error', (error) => {
        fastify.log.error({ traceId, err: error }, 'OpenAI WebSocket error');
        if (socket.readyState === WebSocket.OPEN)
          socket.close(1011, 'Upstream error');
      });
    }
  );
};

export default realtimeRoutes;
