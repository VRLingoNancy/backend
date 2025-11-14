import type { FastifyPluginAsync } from 'fastify';
import getConversationRoute from './get';

const conversationIdRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(getConversationRoute);
};

export default conversationIdRoutes;