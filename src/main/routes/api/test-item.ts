import type { FastifyPluginAsync } from 'fastify';

const testItemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/testitem', async (request, reply) => {
    const { name } = request.body as { name: string };
    const item = await fastify.prisma.testItem.create({ data: { name } });
    reply.code(201).send(item);
  });

  fastify.get('/testitem/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await fastify.prisma.testItem.findUnique({
      where: { id: Number(id) },
    });
    if (!item) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.send(item);
    }
  });
};

export default testItemRoutes;
