import type { FastifyInstance } from 'fastify';
import { renewFolderWatch } from '../google/drive';

export default async function adminlessRoutes(app: FastifyInstance) {
  app.post('/tasks/renew-drive-watch', async (request, reply) => {
    await renewFolderWatch();
    return reply.status(200).send({ ok: true });
  });
}
