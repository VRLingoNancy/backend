import type { FastifyPluginAsync } from 'fastify';
import pingRoutes from './ping';
import testRoutes from './test';

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(pingRoutes);
  await fastify.register(testRoutes);
};

export default apiRoutes;
