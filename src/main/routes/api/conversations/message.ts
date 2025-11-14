import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { ConversationService } from '../../../services/ConversationService';
import { ConversationServiceError } from '../../../errors/ConversationServiceError';
import SendMessageRequestDto, {
  SendMessageRequestDtoType,
} from '../../../dtos/SendMessageRequestDto';

const schema: FastifySchema = {
  body: SendMessageRequestDto,
};

const messageRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  fastify.post<{ Body: SendMessageRequestDtoType }>(
    '/',
    { schema },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
        const userId = request.user?.sub;

        if (!userId) {
          return reply
            .code(401)
            .send({ error: 'Unauthorized: User ID not found in token' });
        }

        const { conversationId, content } = request.body;

        const message = await conversationService.addMessage(
          conversationId,
          userId,
          content
        );

        return reply.code(201).send(message);
      } catch (err) {
        if (err instanceof ConversationServiceError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};

export default messageRoute;
