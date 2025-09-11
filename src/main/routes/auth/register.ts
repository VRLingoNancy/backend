import type { FastifyPluginAsync } from 'fastify';
import { RegisterUserRequestDto } from '../../dtos/RegisterUserRequestDto';
import { AuthService } from '../../services/AuthService';
import { AuthServiceError } from '../../errors/AuthServiceError';

const registerRoute: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.prisma);

  fastify.post('/register', async (request, reply) => {
    const parseResult = RegisterUserRequestDto.safeParse(request.body);

    if (!parseResult.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid data', details: parseResult.error.issues });
    }

    const { email, password, username } = parseResult.data;

    try {
      const user = await authService.registerUser(email, password, username);
      reply.code(201).send({
        id: user.id,
        email: user.email,
        username: user.username ?? null,
      });
    } catch (err) {
      if (err instanceof AuthServiceError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};

export default registerRoute;
