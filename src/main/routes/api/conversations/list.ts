import type { FastifyPluginAsync } from 'fastify';
import { ConversationService } from '../../../services/ConversationService';
import { ConversationServiceError } from '../../../errors/ConversationServiceError';

const listConversationsRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  fastify.get('/', async (request, reply) => {
    try {
      // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
      const userId = request.user.sub;

      if (!userId) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized: User ID not found in token' });
      }

      const conversations = await conversationService.listForUser(userId);

      return reply.code(200).send(conversations);
    } catch (err) {
      if (err instanceof ConversationServiceError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      // Pour toute autre erreur inattendue, laisser Fastify gérer.
      throw err;
    }
  });
};

export default listConversationsRoute;
