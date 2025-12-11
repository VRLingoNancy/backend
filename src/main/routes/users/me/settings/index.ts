import type { FastifyPluginAsync } from 'fastify';
import getSettingsRoute from './get';
import patchSettingsRoute from './patch';

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(getSettingsRoute);
  fastify.register(patchSettingsRoute);
};

export default settingsRoutes;
