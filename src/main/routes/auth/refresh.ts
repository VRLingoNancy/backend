import type { FastifyPluginAsync } from 'fastify';
import { AuthService } from '../../services/AuthService';
import { AuthServiceError } from '../../errors/AuthServiceError';

const refreshRoute: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.prisma);

  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    try {
      const user = await authService.verifyAndRefreshToken(refreshToken, fastify);

      const accessToken = fastify.jwt.sign(
        { sub: user.id, role: user.role },
        { expiresIn: '15m' }
      );

      reply.send({ accessToken });
    } catch (err) {
      if (err instanceof AuthServiceError) {
        return reply.code(err.statusCode).send({ error: err.message });
      } else {
        console.error('Erreur inconnue lors du rafraîchissement du token', err);
        return reply.code(500).send({ error: 'Impossible de rafraîchir le token' });
      }
    }
  });
};

export default refreshRoute;