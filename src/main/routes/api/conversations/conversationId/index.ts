import type { FastifyPluginAsync } from 'fastify';
import getConversationRoute from './get';
import deleteConversationRoute from './delete';
import scoreConversationRoute from './scoring';

const conversationIdRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(getConversationRoute);
  await fastify.register(deleteConversationRoute);
  await fastify.register(scoreConversationRoute);
};

export default conversationIdRoutes;
