import type { FastifyPluginAsync } from 'fastify';
import pingRoutes from './ping';
import testRoutes from './test';

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  if (process.env.NODE_ENV !== 'test') {
    fastify.addHook('onRequest', fastify.authenticate);
  }

  await fastify.register(pingRoutes);
  await fastify.register(testRoutes);
};

export default apiRoutes;
