import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { ConversationService } from '../../../services/ConversationService';
import { ConversationServiceError } from '../../../errors/ConversationServiceError';

const listConversationsRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  const schema: FastifySchema = {
    summary: 'List user conversations',
    description:
      'Retrieves a list of conversations for the authenticated user.',
    tags: ['conversations'],
    security: [{ bearerAuth: [] }],
    response: {
      200: z.array(
        z.object({
          id: z.string().uuid(),
          title: z.string(),
          createdAt: z.string().datetime(),
          updatedAt: z.string().datetime(),
        })
      ),
      401: z.object({
        error: z.string(),
      }),
    },
  };

  fastify.get(
    '/',
    {
      schema,
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user is added by the decorator @fastify/jwt
        const userId = request.user.sub;

        const conversations = await conversationService.listForUser(userId);

        return reply.code(200).send(
          conversations.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          }))
        );
      } catch (err) {
        if (err instanceof ConversationServiceError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        // Pour toute autre erreur inattendue, laisser Fastify gérer.
        throw err;
      }
    }
  );
};

export default listConversationsRoute;
