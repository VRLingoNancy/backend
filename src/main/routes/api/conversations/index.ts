import type { FastifyPluginAsync } from 'fastify';
import listConversationsRoute from './list';
import createConversationRoute from './create';
import messageRoute from './message';
import conversationIdRoutes from './conversationId';

const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(listConversationsRoute);
  await fastify.register(createConversationRoute);
  await fastify.register(messageRoute, { prefix: '/message' });
  await fastify.register(conversationIdRoutes, { prefix: '/:conversationId' });
};

export default conversationRoutes;
