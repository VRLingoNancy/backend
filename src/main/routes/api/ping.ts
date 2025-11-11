import type { FastifyPluginAsync } from 'fastify';

const pingRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ping', async () => {
    return 'pong\n';
  });
};

export default pingRoute;
