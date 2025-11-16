import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { ConversationService } from '../../../../services/ConversationService';
import { ConversationServiceError } from '../../../../errors/ConversationServiceError';
import { makeIdParamsDto } from '../../../../dtos/IdParamsDto';

const getConversationRoute: FastifyPluginAsync = async (fastify) => {
  const conversationService = new ConversationService(fastify.prisma);

  const schema: FastifySchema = {
    summary: 'Get a conversation',
    description:
      'Retrieves a specific conversation by its ID, including all its messages.',
    tags: ['conversations'],
    security: [{ bearerAuth: [] }],
    params: makeIdParamsDto('conversationId'),
    response: {
      200: z.object({
        id: z.string().uuid(),
        userId: z.string().uuid(),
        title: z.string().nullable(),
        languageCode: z.string().nullable(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        messages: z.array(
          z.object({
            id: z.string().uuid(),
            conversationId: z.string().uuid(),
            sender: z.enum(['USER', 'AI']),
            content: z.string(),
            createdAt: z.string().datetime(),
          })
        ),
      }),
      401: z.object({
        error: z.string(),
      }),
      404: z.object({
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
        // @ts-ignore - request.user est ajouté par le décorateur @fastify/jwt
        const userId = request.user?.sub;
        const { conversationId } = request.params as { conversationId: string };

        const conversation = await conversationService.getById(
          conversationId,
          userId
        );

        return reply.code(200).send({
          ...conversation,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
          messages: conversation.messages.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
            // updatedAt: m.updatedAt.toISOString(),
          })),
        });
      } catch (err) {
        if (err instanceof ConversationServiceError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }

        // Propagate unexpected errors to let Fastify handle them
        throw err;
      }
    }
  );
};

export default getConversationRoute;
