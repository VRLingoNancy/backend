import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { ConversationService } from '../../../services/ConversationService';
import { ConversationServiceError } from '../../../errors/ConversationServiceError';
import {
  StartConversationRequestDto,
  StartConversationRequestDtoType,
} from '../../../dtos/StartConversationRequestDto';

const createConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  const schema: FastifySchema = {
    summary: 'Start a new conversation',
    description: 'Starts a new conversation with an initial message.',
    tags: ['conversations'],
    security: [{ bearerAuth: [] }],
    body: StartConversationRequestDto,
    response: {
      201: z.object({
        conversationId: z.string().uuid(),
        aiResponse: z.object({
          id: z.string().uuid(),
          content: z.string(),
          createdAt: z.string().datetime(),
        }),
      }),
      401: z.object({
        error: z.string(),
      }),
      '4xx': z.object({
        error: z.string(),
      }),
    },
  };

  fastify.post<{ Body: StartConversationRequestDtoType }>(
    '/',
    {
      schema,
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        // @ts-ignore - request.user is added by the decorator @fastify/jwt
        const userId = request.user.sub;
        const { content } = request.body;

        const result = await conversationService.startConversation(
          userId,
          content
        );

        return reply.code(201).send({
          ...result,
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

export default createConversationRoute;
