import {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { ConversationService } from '../../../services/ConversationService';

import type { RealtimeConversationContext } from './realtime.types';
import { RealtimeSessionService } from '../../../services/RealtimeSessionService';

const realtimeRoutes: FastifyPluginAsync = async (fastify) => {
  // Prompts (instructions système / bootstrap) et logique de langue extraits dans des modules dédiés.

  const conversationService = new ConversationService(fastify.prisma);
  const realtimeTicketTtlSeconds = 60;
  type RealtimeTicketPayload = {
    sub: string;
    role?: string;
    type?: 'refresh' | 'ws-ticket';
    iat?: number;
    exp?: number;
  };

  const authenticateRealtimeSession = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const query = request.query as { ticket?: string };
    let ticket = query.ticket;

    if (!ticket && request.url) {
      const qIdx = request.url.indexOf('?');
      if (qIdx >= 0) {
        ticket =
          new URLSearchParams(request.url.slice(qIdx + 1)).get('ticket') ||
          undefined;
      }
    }

    if (ticket) {
      let payload: RealtimeTicketPayload;

      try {
        payload = await fastify.jwt.verify<RealtimeTicketPayload>(ticket);
      } catch {
        return reply.code(401).send({ error: 'Invalid realtime ticket' });
      }

      if (payload.type !== 'ws-ticket') {
        return reply.code(401).send({ error: 'Invalid realtime ticket type' });
      }

      request.user = payload;
      return;
    }

    await fastify.authenticate(request, reply);
  };

  fastify.get('/connect-info', {
    schema: {
      summary: 'ℹ️ WebSocket Connection Info',
      description: `
### 🔌 Realtime Audio WebSocket

To start a conversation, connect via WebSocket to:
\`ws://{host}/api/realtime/session?lang={code}&context={context}\`

**Parameters:**
- \`lang\` (Optional): Target language code (must be one of: 'fr', 'en', 'it', 'de'). Defaults to 'en'.
- \`context\` (Optional): Conversation style context. For now: 'medieval'
- \`ticket\` (Required for WebSocket): Short-lived ticket returned by \`POST /api/realtime/ws-ticket\`. Use your JWT Bearer token to call that endpoint first.

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
        .enum(['medieval', 'classic'])
        .optional()
        .describe(
          'Optional style context. "medieval" uses medieval phrasing; "classic" (or omitted) uses the modern style.'
        ),
      ticket: z
        .string()
        .optional()
        .describe(
          'Short-lived realtime WebSocket ticket. Use POST /api/realtime/ws-ticket before opening the socket.'
        ),
    }),
    response: {
      101: z
        .null()
        .describe('Switching Protocols - WebSocket connection established'),
    },
  };

  fastify.post(
    '/ws-ticket',
    {
      preHandler: [fastify.authenticate],
      schema: {
        summary: 'Create realtime WebSocket ticket',
        description:
          'Returns a short-lived JWT ticket dedicated to the realtime WebSocket handshake.',
        tags: ['realtime', 'ai'],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            ticket: z.string(),
            expiresInSec: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const ticket = fastify.jwt.sign(
        {
          sub: request.user.sub,
          role: request.user.role,
          type: 'ws-ticket',
        },
        { expiresIn: `${realtimeTicketTtlSeconds}s` }
      );

      fastify.log.info(
        { userId: request.user.sub, requestId: request.id },
        'Realtime WebSocket ticket issued'
      );

      return {
        ticket,
        expiresInSec: realtimeTicketTtlSeconds,
      };
    }
  );

  fastify.get(
    '/session',
    { websocket: true, preHandler: [authenticateRealtimeSession], schema },
    async (connection: WebSocket.WebSocket, request) => {
      const socket = connection;
      // @ts-ignore
      const userId = request.user.sub as string;

      const query = request.query as {
        lang?: string;
        context?: RealtimeConversationContext;
      };
      const targetLang = query.lang || 'en';
      const conversationContext = query.context;
      const realtimeSessionService = new RealtimeSessionService(
        fastify,
        conversationService
      );

      realtimeSessionService.handleSession(
        socket,
        userId,
        targetLang,
        conversationContext
      );
    }
  );
};

export default realtimeRoutes;
