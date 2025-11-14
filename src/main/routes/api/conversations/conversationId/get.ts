import type { FastifyPluginAsync } from 'fastify';
import { ConversationService } from '../../../../services/ConversationService';
import { ConversationServiceError } from '../../../../errors/ConversationServiceError';
import { makeIdParamsDto } from '../../../../dtos/IdParamsDto';

const getConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  fastify.get('/', async (request, reply) => {
    try {
      // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
      const userId = request.user?.sub;

      const paramsSchema = makeIdParamsDto('conversationId');
      const parsed = paramsSchema.safeParse(request.params);

      if (!userId) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized: User ID not found in token' });
      }

      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid params', details: parsed.error.format() });
      }

      const { conversationId } = parsed.data;

      const conversation = await conversationService.getById(
        conversationId,
        userId
      );

      return reply.code(200).send(conversation);
    } catch (err) {
      if (err instanceof ConversationServiceError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }

      // Propagate unexpected errors to let Fastify handle them
      throw err;
    }
  });
};

export default getConversationRoute;
