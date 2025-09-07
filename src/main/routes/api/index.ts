import type { FastifyPluginAsync } from 'fastify';
import testItemRoutes from './test-item';

const indexRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(testItemRoutes);

  fastify.get('/', async () => {
    return { message: 'Welcome to the API!' };
  });

  fastify.get('/ping', async () => {
    return 'pong\n';
  });
};

export default indexRoute;
