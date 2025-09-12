import { test } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import app from '../../../main/app';

test('GET /api/ping should return pong', async () => {
  const server = Fastify();
  await server.register(app);

  const res = await server.inject({ method: 'GET', url: '/api/ping' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body, 'pong\n');
});