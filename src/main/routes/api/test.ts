import { FastifyPluginAsync } from 'fastify';

const testRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return { message: 'Welcome to the API!' };
  });
};

export default testRoutes;
