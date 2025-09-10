import type { FastifyPluginAsync } from 'fastify';
import loginRoute from './login';
import registerRoute from './register';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(loginRoute);
  await fastify.register(registerRoute);
};

export default authRoutes;
