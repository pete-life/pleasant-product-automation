import type { FastifyInstance } from 'fastify';
import packageJson from '../../package.json';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true, version: packageJson.version ?? '0.0.0' }));
}
