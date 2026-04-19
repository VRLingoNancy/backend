import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { ConversationService } from '../../../../services/ConversationService';
import { ConversationServiceError } from '../../../../errors/ConversationServiceError';
import { makeIdParamsDto } from '../../../../dtos/IdParamsDto';
import { AuthorizationError } from '../../../../errors/AuthorizationError';

const scoreConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  const schema: FastifySchema = {
    summary: 'Score a conversation',
    description:
      'Scores a specific conversation by its ID and stores the AI evaluation. If a score already exists in the database, it is returned directly; otherwise, the score is computed via an AI call.',
    tags: ['conversations'],
    security: [{ bearerAuth: [] }],
    params: makeIdParamsDto('conversationId'),
    response: {
      200: z.object({
        aiScore: z.number().int().min(0).max(100),
        aiFeedback: z.string(),
        isNewScore: z.boolean(),
      }),
      400: z.object({
        error: z.string(),
      }),
      401: z.object({
        error: z.string(),
      }),
      403: z.object({
        error: z.string(),
      }),
      404: z.object({
        error: z.string(),
      }),
      500: z.object({
        error: z.string(),
      }),
    },
  };

  fastify.get(
    '/scoring',
    {
      schema,
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
        const userId = request.user?.sub;
        const { conversationId } = request.params as { conversationId: string };

        // Récupère la conversation sans filtrer par user
        const conversation = await conversationService.getById(conversationId);
        if (!conversation) {
          return reply.code(404).send({ error: 'Conversation not found' });
        }
        // Vérifie l'appartenance
        if (conversation.userId !== userId) {
          throw new AuthorizationError('Not authorized to access this conversation', 403);
        }

        const result = await conversationService.scoreConversationWithAI(conversationId);
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof ConversationServiceError || err instanceof AuthorizationError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};

export default scoreConversationRoute;
