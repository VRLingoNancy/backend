import type { FastifyPluginAsync } from 'fastify';
import pingRoute from './ping';
import testRoute from './test';
import conversationRoutes from './conversations/index';
import usersRoutes from '../users';
import realtimeRoutes from './realtime/index';
import transcribeRoute from './transcribe';
import ttsRoute from './tts';
import conversationRoute from './conversation';

const PUBLIC_API_PATHS = new Set([
  '/api/ping',
  '/api/test',
  '/api/transcribe',
  '/api/tts',
  '/api/conversation',
  '/api/realtime/connect-info',
]);

const normalizePath = (url: string): string => url.split('?')[0];

const apiRoutes: FastifyPluginAsync = async (fastify) => {
  if (process.env.NODE_ENV !== 'test') {
    fastify.addHook('onRequest', async (request, reply) => {
      const requestPath = normalizePath(request.url);
      if (PUBLIC_API_PATHS.has(requestPath)) {
        return;
      }
      await fastify.authenticate(request, reply);
    });
  }

  await fastify.register(pingRoute);
  await fastify.register(testRoute);
  await fastify.register(transcribeRoute);
  await fastify.register(ttsRoute);
  await fastify.register(conversationRoute);
  await fastify.register(conversationRoutes, { prefix: '/conversations' });
  await fastify.register(usersRoutes, { prefix: '/users' });
  await fastify.register(realtimeRoutes, { prefix: '/realtime' });
};

export default apiRoutes;
