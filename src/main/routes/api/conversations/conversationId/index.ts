import type { FastifyPluginAsync } from 'fastify';
import getConversationRoute from './get';
import deleteConversationRoute from './delete';

const conversationIdRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(getConversationRoute);
  await fastify.register(deleteConversationRoute);
};

export default conversationIdRoutes;
