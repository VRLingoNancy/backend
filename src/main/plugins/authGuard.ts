import fp from 'fastify-plugin';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthGuardError } from '../errors/AuthGuardError';

export default fp(async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new AuthGuardError('Header authorization manquant', 401);
        }
        const token = authHeader.slice(7);
        await fastify.jwt.verify(token);
      } catch (err: unknown) {
        if (err instanceof AuthGuardError) {
          reply.code(err.statusCode).send({ error: err.message });
        } else if (err instanceof Error) {
          reply
            .code(401)
            .send({ error: 'Token invalide ou expiré', details: err.message });
        } else {
          reply.code(401).send({ error: 'Token invalide ou expiré' });
        }
        throw err;
      }
    }
  );
});
