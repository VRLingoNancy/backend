import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AutoLoad from '@fastify/autoload';
import type { FastifyPluginAsync } from 'fastify';

// Optionnel : exposé pour fastify-cli (équivalent de module.exports.options)
export const options = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app: FastifyPluginAsync = async (fastify, opts) => {
  // Plugins réutilisables
  try {
    await fastify.register(AutoLoad, {
      dir: path.join(__dirname, 'plugins'),
      options: { ...opts },
    });
  } catch (err) {
    console.log('Impossible de charger les plugins:', err);
  }

  // Routes
  try {
    await fastify.register(AutoLoad, {
      dir: path.join(__dirname, 'routes'),
      options: { ...opts },
    });
  } catch (err) {
    console.log('Impossible de charger les routes:', err);
  }
};

export default app;
