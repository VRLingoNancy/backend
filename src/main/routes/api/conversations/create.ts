import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { ConversationService } from '../../../services/ConversationService';
import { ConversationServiceError } from '../../../errors/ConversationServiceError';
import {
  StartConversationRequestDto,
  StartConversationRequestDtoType,
} from '../../../dtos/StartConversationRequestDto';

const schema: FastifySchema = {
  body: StartConversationRequestDto,
};

const createConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  fastify.post<{ Body: StartConversationRequestDtoType }>(
    '/',
    { schema },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
        const userId = request.user.sub;
        const { content } = request.body;

        if (!userId) {
          return reply
            .code(401)
            .send({ error: 'Unauthorized: User ID not found in token' });
        }

        const result = await conversationService.startConversation(
          userId,
          content
        );

        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof ConversationServiceError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};

export default createConversationRoute;
