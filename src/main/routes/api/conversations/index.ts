import type { FastifyPluginAsync } from 'fastify';
import listConversationsRoute from './list';
import createConversationRoute from './create';

const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(listConversationsRoute);
  await fastify.register(createConversationRoute);
};

export default conversationRoutes;
