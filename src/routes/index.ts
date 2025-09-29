import type { FastifyInstance } from 'fastify';
import healthRoutes from './health';
import tasksRoutes from './tasks';
import driveWebhookRoutes from './driveWebhook';
import adminlessRoutes from './adminless';

export default async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(tasksRoutes);
  await app.register(driveWebhookRoutes);
  await app.register(adminlessRoutes);
}
