import fp from 'fastify-plugin';
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      _request: FastifyRequest,
      _reply: FastifyReply
    ) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      // Support token in query parameter for WebSocket connections
      // (NativeWebSocket on Android doesn't support custom headers)
      const query = request.query as { token?: string };
      if (!request.headers.authorization && query.token) {
        request.headers.authorization = `Bearer ${query.token}`;
      }

      await request.jwtVerify();
    }
  );
});
/**
 * rc/
└── main/
    └── routes/
        ├── api/
        │   ├── conversations/
        │   │   ├── index.ts         # Route: GET /api/conversations
        │   │   ├── create.ts        # Route: POST /api/conversations
        │   │   ├── [conversationId]/
        │   │   │   ├── index.ts     # Routes: GET & DELETE /api/conversations/:id
        │   │   │   └── messages.ts  # Route: POST /api/conversations/:id/messages
        │   │   │
        │   │   └── conversations.routes.ts # Fichier qui assemble tout
        │   │
        │   ├── index.ts             # Fichier principal des routes API
        │   ├── ping.ts
        │   └── test.ts
        │
        └── auth/
            └── ... (inchangé)
 */
