import type { FastifyPluginAsync } from 'fastify';
import { ConversationService } from '../../../../services/ConversationService';
import { ConversationServiceError } from '../../../../errors/ConversationServiceError';
import { makeIdParamsDto } from '../../../../dtos/IdParamsDto';

const deleteConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  fastify.delete('/', async (request, reply) => {
    try {
      // @ts-ignore - request.user comes from fastify-jwt decorator
      const userId = request.user?.sub;

      if (!userId) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized: User ID not found in token' });
      }

      const paramsSchema = makeIdParamsDto('conversationId');
      const parsed = paramsSchema.safeParse(request.params);

      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid params', details: parsed.error.format() });
      }

      const { conversationId } = parsed.data;

      await conversationService.deleteById(conversationId, userId);

      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ConversationServiceError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};

export default deleteConversationRoute;
