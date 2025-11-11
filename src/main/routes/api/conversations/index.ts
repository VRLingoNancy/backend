import type { FastifyPluginAsync } from 'fastify';
import listConversationsRoute from './list';

const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(listConversationsRoute);

  // Enregistrera ici les autres routes...
};

export default conversationRoutes;
