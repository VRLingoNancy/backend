import type { FastifyPluginAsync } from 'fastify';
import getSettingsRoute from './get';

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(getSettingsRoute);
  // On enregistrera ici les autres routes (PATCH, etc.)
};

export default settingsRoutes;
