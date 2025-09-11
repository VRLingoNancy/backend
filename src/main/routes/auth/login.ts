import type { FastifyPluginAsync } from 'fastify';
import { LoginUserRequestDto } from '../../dtos/LoginUserRequestDto';
import { AuthService } from '../../services/AuthService';
import { AuthServiceError } from '../../errors/AuthServiceError';

const loginRoute: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.prisma);

  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginUserRequestDto.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid data', details: parseResult.error.issues });
    }
    const { email, username, password } = parseResult.data;

    try {
      const user = await authService.loginUser(email, username, password);

      const accessToken = fastify.jwt.sign(
        { sub: user.id, role: user.role },
        { expiresIn: '15m' }
      );

      const refreshToken = fastify.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' }
      );

      await fastify.prisma.authToken.create({
        data: {
          userId: user.id,
          refreshToken,
          refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      reply.send({ accessToken, refreshToken });
    } catch (err) {
      if (err instanceof AuthServiceError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};

export default loginRoute;
