import type { FastifyInstance } from 'fastify';
import { buildDriveNotificationLog } from '../google/drive';

export default async function driveWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/drive', async (request, reply) => {
    const headers = request.headers;
    const channelId = headers['x-goog-channel-id'];
    const resourceId = headers['x-goog-resource-id'];

    if (!channelId || !resourceId) {
      app.log.warn({ headers }, 'Rejecting Drive webhook without identifiers');
      return reply.status(400).send({ ok: false, reason: 'Missing Drive webhook headers' });
    }

    const logPayload = buildDriveNotificationLog(request.headers as Record<string, string | string[] | undefined>);
    app.log.info(logPayload, 'Drive webhook received');

    try {
      await app.inject({ method: 'POST', url: '/tasks/stage-drafts' });
    } catch (error) {
      app.log.error({ error }, 'Failed to trigger stage-drafts from webhook');
    }

    void app
      .inject({ method: 'POST', url: '/tasks/process-approved' })
      .catch((error) => app.log.error({ error }, 'Failed to trigger process-approved from webhook'));

    return reply.status(200).send({ ok: true });
  });
}
