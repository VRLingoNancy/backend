import { FastifyPluginAsync } from 'fastify';

const testRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return { message: 'Welcome to the API!' };
  });
};

export default testRoute;
