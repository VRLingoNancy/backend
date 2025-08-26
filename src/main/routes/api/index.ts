import type { FastifyPluginAsync } from "fastify";

const indexRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_request, _reply) => {
    return { message: "Welcome to the API!" };
  });

  fastify.get("/ping", async (_request, _reply) => {
    return "pong\n";
  });
};

export default indexRoute;
