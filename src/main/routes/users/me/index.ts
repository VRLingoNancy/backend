import type { FastifyPluginAsync } from 'fastify';
import settingsRoutes from './settings';

const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(settingsRoutes, { prefix: '/settings' });
};

export default meRoutes;
