import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';

/**
 * This plugin attaches support for WebSockets to Fastify.
 *
 * @see https://github.com/fastify/fastify-websocket
 */
export default fp(async (fastify) => {
  await fastify.register(websocket);
});
