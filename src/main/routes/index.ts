import type { FastifyPluginAsync } from 'fastify';
import authRoutes from './auth/index';
import apiRoutes from './api/index';

const mainRoutes: FastifyPluginAsync = async (fastify) => {
  // Enregistre toutes les routes d'authentification sous le préfixe /auth
  await fastify.register(authRoutes, { prefix: '/auth' });

  // Enregistre toutes les routes de l'API sous le préfixe /api
  await fastify.register(apiRoutes, { prefix: '/api' });
};

export default mainRoutes;
