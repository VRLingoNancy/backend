import fp from 'fastify-plugin';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthGuardError } from '../errors/AuthGuardError';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthGuardError('Header authorization manquant', 401);
      }
      const token = authHeader.slice(7);
      await fastify.jwt.verify(token);
    } catch (err: any) {
      if (err instanceof AuthGuardError) {
        reply.code(err.statusCode).send({ error: err.message });
      } else {
        reply.code(401).send({ error: 'Token invalide ou expiré' });
      }
      throw err;
    }
  });
});