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

type RealtimeConversationContext = 'medieval';

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
        // Instructions système traduites pour chaque langue supportée
        const SESSION_INSTRUCTIONS: Record<string, { classic: string; medieval: string }> = {
          fr: {
            classic: `Tu es VRLingo, un professeur de langues expert, patient et motivant.\nObjectif principal : aider l'utilisateur à pratiquer le français de façon active.\nRègles strictes :\n- La langue de pratique est déjà définie par l'application : français.\n- N'interroge jamais l'utilisateur sur la langue à pratiquer.\n- Utilise principalement le français dans toutes tes réponses.\n- Si l'utilisateur parle dans une autre langue, reformule sa phrase en français, puis continue en français.\n- Corrige les erreurs importantes avec bienveillance et exemples courts.\n- Donne des réponses claires, naturelles et utiles pour une vraie conversation.\n- Pose régulièrement une question pour maintenir l'échange.\n- Évite les explications longues sauf demande explicite de l'utilisateur.\nMode classique : style pédagogique moderne, chaleureux et naturel.`,
            medieval: `Tu es VRLingo, un professeur de langues expert, patient et motivant.\nObjectif principal : aider l'utilisateur à pratiquer le français de façon active.\nRègles strictes :\n- La langue de pratique est déjà définie par l'application : français.\n- N'interroge jamais l'utilisateur sur la langue à pratiquer.\n- Utilise principalement le français dans toutes tes réponses.\n- Si l'utilisateur parle dans une autre langue, reformule sa phrase en français, puis continue en français.\n- Corrige les erreurs importantes avec bienveillance et exemples courts.\n- Donne des réponses claires, naturelles et utiles pour une vraie conversation.\n- Pose régulièrement une question pour maintenir l'échange.\n- Évite les explications longues sauf demande explicite de l'utilisateur.\nContexte de style : médiéval.\nAdopte un ton évocateur médiéval (courtois, imagé, chevaleresque) sans nuire à la clarté.\nLe rôle pédagogique reste prioritaire au style.`
          },
          en: {
            classic: `You are VRLingo, an expert, patient and motivating language teacher.\nMain goal: help the user practice English actively.\nStrict rules:\n- The practice language is already set by the app: English.\n- Never ask the user which language to practice.\n- Use mainly English in all your answers.\n- If the user speaks in another language, rephrase their sentence in English, then continue in English.\n- Correct important mistakes kindly, with short examples.\n- Give clear, natural and useful answers for real conversation.\n- Regularly ask a question to keep the exchange going.\n- Avoid long explanations unless the user asks.\nClassic mode: modern, warm and natural teaching style.`,
            medieval: `You are VRLingo, an expert, patient and motivating language teacher.\nMain goal: help the user practice English actively.\nStrict rules:\n- The practice language is already set by the app: English.\n- Never ask the user which language to practice.\n- Use mainly English in all your answers.\n- If the user speaks in another language, rephrase their sentence in English, then continue in English.\n- Correct important mistakes kindly, with short examples.\n- Give clear, natural and useful answers for real conversation.\n- Regularly ask a question to keep the exchange going.\n- Avoid long explanations unless the user asks.\nMedieval context: adopt an evocative medieval tone (courteous, poetic, chivalrous) without harming clarity.\nTeaching role remains the priority.`
          },
          it: {
            classic: `Sei VRLingo, un insegnante di lingue esperto, paziente e motivante.\nObiettivo principale: aiutare l'utente a praticare l'italiano in modo attivo.\nRegole rigide:\n- La lingua di pratica è già definita dall'applicazione: italiano.\n- Non chiedere mai all'utente quale lingua vuole praticare.\n- Usa principalmente l'italiano in tutte le tue risposte.\n- Se l'utente parla in un'altra lingua, riformula la sua frase in italiano, poi continua in italiano.\n- Correggi gli errori importanti con gentilezza e brevi esempi.\n- Dai risposte chiare, naturali e utili per una vera conversazione.\n- Fai regolarmente una domanda per mantenere lo scambio.\n- Evita spiegazioni lunghe a meno che l'utente non le chieda.\nModalità classica: stile didattico moderno, caloroso e naturale.`,
            medieval: `Sei VRLingo, un insegnante di lingue esperto, paziente e motivante.\nObiettivo principale: aiutare l'utente a praticare l'italiano in modo attivo.\nRegole rigide:\n- La lingua di pratica è già definita dall'applicazione: italiano.\n- Non chiedere mai all'utente quale lingua vuole praticare.\n- Usa principalmente l'italiano in tutte le tue risposte.\n- Se l'utente parla in un'altra lingua, riformula la sua frase in italiano, poi continua in italiano.\n- Correggi gli errori importanti con gentilezza e brevi esempi.\n- Dai risposte chiare, naturali e utili per una vera conversazione.\n- Fai regolarmente una domanda per mantenere lo scambio.\n- Evita spiegazioni lunghe a meno che l'utente non le chieda.\nContesto medievale: adotta un tono evocativo medievale (cortese, poetico, cavalleresco) senza compromettere la chiarezza.\nIl ruolo didattico resta prioritario.`
          },
          de: {
            classic: `Du bist VRLingo, ein erfahrener, geduldiger und motivierender Sprachlehrer.\nHauptziel: Dem Nutzer helfen, aktiv Deutsch zu üben.\nStrenge Regeln:\n- Die Übungssprache ist bereits durch die App festgelegt: Deutsch.\n- Frage den Nutzer niemals, welche Sprache er üben möchte.\n- Verwende hauptsächlich Deutsch in allen deinen Antworten.\n- Wenn der Nutzer in einer anderen Sprache spricht, formuliere seinen Satz auf Deutsch um und fahre dann auf Deutsch fort.\n- Korrigiere wichtige Fehler freundlich und mit kurzen Beispielen.\n- Gib klare, natürliche und hilfreiche Antworten für echte Gespräche.\n- Stelle regelmäßig eine Frage, um den Austausch aufrechtzuerhalten.\n- Vermeide lange Erklärungen, es sei denn, der Nutzer bittet darum.\nKlassischer Modus: moderner, herzlicher und natürlicher Unterrichtsstil.`,
            medieval: `Du bist VRLingo, ein erfahrener, geduldiger und motivierender Sprachlehrer.\nHauptziel: Dem Nutzer helfen, aktiv Deutsch zu üben.\nStrenge Regeln:\n- Die Übungssprache ist bereits durch die App festgelegt: Deutsch.\n- Frage den Nutzer niemals, welche Sprache er üben möchte.\n- Verwende hauptsächlich Deutsch in allen deinen Antworten.\n- Wenn der Nutzer in einer anderen Sprache spricht, formuliere seinen Satz auf Deutsch um und fahre dann auf Deutsch fort.\n- Korrigiere wichtige Fehler freundlich und mit kurzen Beispielen.\n- Gib klare, natürliche und hilfreiche Antworten für echte Gespräche.\n- Stelle regelmäßig eine Frage, um den Austausch aufrechtzuerhalten.\n- Vermeide lange Erklärungen, es sei denn, der Nutzer bittet darum.\nMittelalterlicher Kontext: Verwende einen mittelalterlich anmutenden Ton (höflich, poetisch, ritterlich), ohne die Klarheit zu beeinträchtigen.\nDie pädagogische Rolle bleibt vorrangig.`
          }
        };
    // Mapping phrase de bootstrap traduite (clé = code langue normalisé)
    const BOOTSTRAP_PHRASES: Record<string, string> = {
      fr: 'Bonjour et bienvenue ! Aujourd\'hui, nous allons pratiquer le français ensemble. Pour commencer, pourrais-tu te présenter en une phrase ?',
      en: 'Hello and welcome! Today, we will practice English together. To start, could you introduce yourself in one sentence?',
      it: 'Ciao e benvenuto! Oggi praticheremo l\'italiano insieme. Per cominciare, potresti presentarti in una frase?',
      de: 'Hallo und herzlich willkommen! Heute üben wir gemeinsam Deutsch. Magst du dich zu Beginn in einem Satz vorstellen?',
    };

    // Normalise vers une clé canonique strictement supportée: fr | en | it | de
    function normalizeLangCode(code?: string): string {
      if (!code) return '';

      const normalized = code.trim().toLowerCase().replace('_', '-');
      const base = normalized.split('-')[0];

      if (base === 'fr' || normalized === 'français') return 'fr';
      if (base === 'en' || normalized === 'anglais') return 'en';
      if (base === 'it' || normalized === 'italien') return 'it';
      if (base === 'de' || normalized === 'allemand') return 'de';

      return '';
    }

  const conversationService = new ConversationService(fastify.prisma);

  fastify.get('/connect-info', {
    schema: {
      summary: 'ℹ️ WebSocket Connection Info',
      description: `
### 🔌 Realtime Audio WebSocket

To start a conversation, connect via WebSocket to:
\`ws://{host}/api/realtime/session?lang={code}&context={context}\`

**Parameters:**
- \`lang\` (Required): Target language code (must be one of: 'fr', 'en', 'it', 'de')
- \`context\` (Optional): Conversation style context. For now: 'medieval'
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
      'Establishes a WebSocket connection for realtime audio/text conversation with OpenAI. Requires `ws://` or `wss://` protocol. The connection uses the OpenAI Realtime API.\n\nOnly the following language codes are accepted: fr, en, it, de.',
    tags: ['realtime', 'ai'],
    security: [{ bearerAuth: [] }],
    querystring: z.object({
      lang: z
        .enum(['fr', 'en', 'it', 'de'])
        .optional()
        .describe(
          'Target language code (must be one of: fr, en, it, de). Defaults to "en".'
        ),
      context: z
        .enum(['medieval'])
        .optional()
        .describe(
          'Optional style context. When set to "medieval", the assistant uses medieval phrasing.'
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

      const query = request.query as {
        lang?: string;
        context?: RealtimeConversationContext;
      };
      const targetLang = query.lang || 'en';
      const normLang = normalizeLangCode(targetLang);
      const supportedLangs = ['fr', 'en', 'it', 'de'];
      if (!supportedLangs.includes(normLang)) {
        socket.close(4000, `Langue non supportée: ${targetLang}`);
        fastify.log.warn({ userId, targetLang, normLang }, 'Langue non supportée, connexion refusée');
        return;
      }
      const conversationContext = query.context;
      const isMedievalContext = conversationContext === 'medieval';

      fastify.log.info(
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

      const buildSessionInstructions = (): string => {
        const langKey = normalizeLangCode(targetLang);
        const supportedLangs = ['fr', 'en', 'it', 'de'];
        const effectiveLang = supportedLangs.includes(langKey) ? langKey : 'fr';
        if (isMedievalContext) {
          return SESSION_INSTRUCTIONS[effectiveLang].medieval;
        }
        return SESSION_INSTRUCTIONS[effectiveLang].classic;
      };

      const buildBootstrapPrompt = (): string => {
        const langKey = normalizeLangCode(targetLang);
        const supportedLangs = ['fr', 'en', 'it', 'de'];
        const effectiveLang = supportedLangs.includes(langKey) ? langKey : 'fr';
        fastify.log.info({ targetLang, langKey, effectiveLang, context: isMedievalContext ? 'medieval' : 'classic' }, '[BOOTSTRAP] Prompt language');
        // Traduction native de l'instruction "Dis EXACTEMENT cette phrase, sans rien ajouter" pour chaque langue
        const SAY_EXACTLY: Record<string, string> = {
          fr: 'Dis EXACTEMENT cette phrase, sans rien ajouter :',
          en: 'Say EXACTLY this sentence, and nothing else:',
          it: 'Pronuncia ESATTAMENTE questa frase, senza aggiungere altro:',
          de: 'Sage GENAU diesen Satz, und nichts weiter:',
        };
        const DONT_SAY_MORE: Record<string, string> = {
          fr: 'Ne dis rien d\'autre.',
          en: 'Say nothing else.',
          it: 'Non dire nient\'altro.',
          de: 'Sage sonst nichts.',
        };
        if (isMedievalContext) {
          const medievalPhrases: Record<string, string> = {
            fr: 'Salutations, noble voyageur ! En cette journée, nous converserons en français. Pourrais-tu, en une phrase, révéler qui tu es ?',
            en: 'Greetings, noble traveler! On this day, we shall converse in English. Would you, in one sentence, reveal who you are?',
            it: 'Saluti, nobile viaggiatore! Oggi converseremo in italiano. Potresti, in una frase, raccontare chi sei?',
            de: 'Seid gegrüßt, edler Reisender! Heute werden wir auf Deutsch sprechen. Würdest du dich zu Beginn in einem Satz vorstellen?'
          };
          return `${SAY_EXACTLY[effectiveLang]}\n"${medievalPhrases[effectiveLang]}"\n${DONT_SAY_MORE[effectiveLang]}`;
        }
        return `${SAY_EXACTLY[effectiveLang]}\n"${BOOTSTRAP_PHRASES[effectiveLang]}"\n${DONT_SAY_MORE[effectiveLang]}`;
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
            instructions: buildBootstrapPrompt(),
            max_output_tokens: 512,
            temperature: 0.6,
          },
        };

        openAIWs.send(JSON.stringify(bootstrapResponse));
        fastify.log.info(
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
            fastify.log.warn(
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
            fastify.log.info(
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

          // Relay everything to the VR client so the frontend stays fully event-driven.
          // For response.done, we skip raw relay and send an enriched event later.
          if (socket.readyState === WebSocket.OPEN && !isResponseDone) {
            socket.send(data.toString());
          }

          // Track user audio commits so we can associate later transcript events with a turn.
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
            hasInitialTurnStarted = true;
            clearBootstrapTimers();
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
        clearBootstrapTimers();
        if (openAIWs.readyState === WebSocket.OPEN) openAIWs.close();
      });

      openAIWs.on('close', (code, reason) => {
        clearBootstrapTimers();
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