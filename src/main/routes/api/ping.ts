import type { FastifyPluginAsync } from 'fastify';

const pingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ping', async () => {
    return 'pong\n';
  });
};

export default pingRoutes;
