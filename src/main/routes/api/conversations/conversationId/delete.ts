import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { ConversationService } from '../../../../services/ConversationService';
import { ConversationServiceError } from '../../../../errors/ConversationServiceError';
import { makeIdParamsDto } from '../../../../dtos/IdParamsDto';

const deleteConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  const schema: FastifySchema = {
    summary: 'Delete a conversation',
    description: 'Deletes a specific conversation by its ID.',
    tags: ['conversations'],
    security: [{ bearerAuth: [] }],
    params: makeIdParamsDto('conversationId'),
    response: {
      204: z.null(),
      401: z.object({
        error: z.string(),
      }),
      404: z.object({
        error: z.string(),
      }),
    },
  };

  fastify.delete(
    '/',
    {
      schema,
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user comes from fastify-jwt decorator
        const userId = request.user?.sub;
        const { conversationId } = request.params as { conversationId: string };

        await conversationService.deleteById(conversationId, userId);

        return reply.code(204).send();
      } catch (err) {
        if (err instanceof ConversationServiceError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};

export default deleteConversationRoute;
