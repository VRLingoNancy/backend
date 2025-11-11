import type { FastifyPluginAsync } from 'fastify';
import pingRoute from './ping';
import testRoute from './test';
import conversationRoutes from './conversations/index';

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  if (process.env.NODE_ENV !== 'test') {
    fastify.addHook('onRequest', fastify.authenticate);
  }

  await fastify.register(pingRoute);
  await fastify.register(testRoute);
  await fastify.register(conversationRoutes, { prefix: '/conversations' });
};

export default apiRoutes;
