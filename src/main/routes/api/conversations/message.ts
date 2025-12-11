import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { ConversationService } from '../../../services/ConversationService';
import { ConversationServiceError } from '../../../errors/ConversationServiceError';
import SendMessageRequestDto, {
  SendMessageRequestDtoType,
} from '../../../dtos/SendMessageRequestDto';

const messageRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  const schema: FastifySchema = {
    summary: 'Send a message in a conversation',
    description:
      'Sends a message from the user to a specific conversation and gets a response from the AI.',
    tags: ['conversations'],
    security: [{ bearerAuth: [] }],
    body: SendMessageRequestDto,
    response: {
      201: z.object({
        userMessage: z.object({
          id: z.string().uuid(),
          conversationId: z.string().uuid(),
          sender: z.enum(['USER', 'AI']),
          content: z.string(),
          createdAt: z.string().datetime(),
        }),
        aiResponse: z.object({
          id: z.string().uuid(),
          content: z.string(),
          createdAt: z.string().datetime(),
        }),
      }),
      401: z.object({
        error: z.string(),
      }),
      404: z.object({
        error: z.string(),
      }),
    },
  };

  fastify.post<{ Body: SendMessageRequestDtoType }>(
    '/',
    {
      schema,
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
        const userId = request.user?.sub;
        const { conversationId, content } = request.body;

        const result = await conversationService.addMessage(
          conversationId,
          userId,
          content
        );

        return reply.code(201).send({
          userMessage: {
            ...result.userMessage,
            createdAt: result.userMessage.createdAt.toISOString(),
          },
          aiResponse: {
            ...result.aiResponse,
            createdAt: result.aiResponse.createdAt.toISOString(),
          },
        });
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
