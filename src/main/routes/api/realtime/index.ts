import { FastifyPluginAsync } from 'fastify';
import WebSocket from 'ws';
import { REALTIME_LIMITS, SessionGuard } from '../../../config/realtime-limits';
import { ConversationService } from '../../../services/ConversationService';

const realtimeRoutes: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  // NOTE IMPORTANTE: Cette route nécessite une connexion WebSocket (ws:// ou wss://)
  // Le client ne doit pas utiliser HTTP GET standard ici.
  fastify.get('/session', { websocket: true, preHandler: [fastify.authenticate] }, async (connection: WebSocket.WebSocket, request) => {
    const socket = connection;
    // @ts-ignore
    const userId = request.user.sub;
    
    fastify.log.info({ userId }, 'Realtime session initiating...');

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
      fastify.log.info('✅ Connected to OpenAI Realtime API');
    });

    openAIWs.on('message', async (data: WebSocket.RawData) => {
        try {
            const event = JSON.parse(data.toString());

            // Initialisation de la session
            if (event.type === 'session.created') {
                const sessionConfig = {
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        instructions: 'Tu es VRLingo, un assistant linguistique en réalité virtuelle. Tu es amical et patient. Tes réponses doivent être concises.',
                        voice: 'alloy',
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        turn_detection: { type: 'server_vad' }
                    },
                };
                openAIWs.send(JSON.stringify(sessionConfig));
                isSessionActive = true;
                fastify.log.info('✨ Session initialized and configured');
            }
            
            // Relayer l'événement au client VR
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(data.toString());
            }

            // --- Logique Métier & BDD ---
            
            if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
                pendingUserTranscript = event.transcript;
            }
            
            if (event.type === 'conversation.item.created' && event.item?.role === 'user') {
                 const content = event.item.content?.find((c: any) => c.type === 'input_text' || c.type === 'text');
                 if (content?.text) pendingUserTranscript = content.text;
            }

            if (event.type === 'response.done') {
                sessionGuard.incrementTurn();
                const response = event.response;
                
                if (response && response.status === 'completed') {
                    let aiContent = '';
                    if (response.output) {
                       response.output.forEach((item: any) => {
                           if (item.content) {
                               item.content.forEach((c: any) => {
                                   if (c.transcript) aiContent += c.transcript;
                                   else if (c.text) aiContent += c.text;
                               });
                           }
                       });
                    }
    
                    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    
                    try {
                        const result = await conversationService.logRealtimeTurn(
                            userId,
                            currentConversationId,
                            pendingUserTranscript,
                            aiContent,
                            {
                                promptTokens: usage.prompt_tokens || 0,
                                completionTokens: usage.completion_tokens || 0,
                                totalTokens: usage.total_tokens || 0
                            },
                            REALTIME_LIMITS.MODEL
                        );
                        
                        currentConversationId = result.conversationId;
                        pendingUserTranscript = '';
                        
                    } catch (dbError) {
                        fastify.log.error({ err: dbError }, 'Failed to persist Realtime turn');
                    }
                }
            }
        } catch (err) {
            fastify.log.error({ err }, 'Error processing OpenAI message');
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
        try {
           JSON.parse(messageString);
        } catch (e) {
           return; // Ignore les données non-JSON (ex: audio binaire mal formaté)
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
      fastify.log.info({ code, reason: reason.toString() }, 'OpenAI connection closed');
      if (socket.readyState === WebSocket.OPEN) socket.close();
    });

    openAIWs.on('error', (error) => {
      fastify.log.error({ err: error }, 'OpenAI WebSocket error');
      if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'Upstream error');
    });
  });
};

export default realtimeRoutes;
