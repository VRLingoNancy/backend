import type { FastifyPluginAsync } from 'fastify';
import pingRoute from './ping';
import testRoute from './test';
import conversationRoutes from './conversations/index';
import usersRoutes from '../users';
import realtimeRoutes from './realtime/index';

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  if (process.env.NODE_ENV !== 'test') {
    fastify.addHook('onRequest', async (request, reply) => {
      // The realtime WS session uses a ticket-based auth handled by its own preHandler.
      if (request.url.startsWith('/api/realtime/session')) return;
      await fastify.authenticate(request, reply);
    });
  }

  await fastify.register(pingRoute);
  await fastify.register(testRoute);
  await fastify.register(conversationRoutes, { prefix: '/conversations' });
  await fastify.register(usersRoutes, { prefix: '/users' });
  await fastify.register(realtimeRoutes, { prefix: '/realtime' });
};

export default apiRoutes;
