import fp from 'fastify-plugin';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthGuardError } from '../errors/AuthGuardError';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      _request: FastifyRequest,
      _reply: FastifyReply
    ) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // La fonction jwtVerify fait :
        // 1. Trouve le token dans le header
        // 2. Le vérifie
        // 3. Attache le payload à request.user
        // 4. Envoie une erreur 401 si ça échoue
        await request.jwtVerify();
      } catch (err) {
        throw err;
      }
    },
  );
});
