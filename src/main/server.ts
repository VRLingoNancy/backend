import 'dotenv/config';
import Fastify from 'fastify';
import app from './app';

const server = Fastify({ logger: true });
await server.register(app);

const port = Number(process.env.PORT ?? 3000);

try {
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`Server is running at http://localhost:${port}`);
} catch (err) {
  console.error('Error starting server:', err);
  process.exit(1);
}
