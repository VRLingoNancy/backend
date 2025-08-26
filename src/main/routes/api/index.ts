import type { FastifyPluginAsync } from 'fastify';

const indexRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return { message: 'Welcome to the API!' };
  });

  fastify.get('/ping', async () => {
    return 'pong\n';
  });
};

export default indexRoute;
