import type { FastifyPluginAsync, FastifySchema } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../../../services/AuthService';
import { AuthServiceError } from '../../../../errors/AuthServiceError';

const getSettingsRoute: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.prisma);

  const schema: FastifySchema = {
    summary: "Get user's settings",
    description:
      "Retrieves the settings for the authenticated user. If settings don't exist, they will be created with default values.",
    tags: ['users', 'settings'],
    security: [{ bearerAuth: [] }],
    response: {
      200: z.object({
        userId: z.string().uuid(),
        nativeLanguageCode: z.string(),
        interfaceLanguageCode: z.string(),
        preferredStudyLanguage: z.string().nullable(),
        defaultIaModel: z.string().nullable(),
      }),
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
        // @ts-ignore - request.user is added by the auth decorator
        const userId = request.user.sub;

        const settings = await authService.getUserSettings(userId);

        return reply.code(200).send(settings);
      } catch (err) {
        if (err instanceof AuthServiceError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};

export default getSettingsRoute;
