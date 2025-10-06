import type { FastifyInstance } from 'fastify';
import { getApprovedRowsNeedingCreate, getRowByProductKey } from '../google/sheets';
import { publishProduct } from '../processors/publishProduct';
import { stageDrafts } from '../processors/stageDrafts';
import { COLUMN_NAMES, APPROVED_VALUES } from '../config/constants';

interface ReprocessQuery {
  key?: string;
}

export default async function tasksRoutes(app: FastifyInstance) {
  app.post('/tasks/stage-drafts', async () => {
    const result = await stageDrafts();
    return result;
  });

  app.post('/tasks/process-approved', async () => {
    const draftSummary = await stageDrafts();
    const rows = await getApprovedRowsNeedingCreate();
    let processed = 0;
    let created = 0;
    const failures: string[] = [];

    for (const row of rows) {
      processed += 1;
      const result = await publishProduct(row);
      if (result.success) {
        created += 1;
      } else {
        const key = (row[COLUMN_NAMES.PRODUCT_KEY] as string | undefined) ?? 'unknown';
        failures.push(key);
      }
    }

    return {
      stagedDrafts: draftSummary,
      processed,
      created,
      errors: failures.length,
      failedKeys: failures
    };
  });

  app.post('/tasks/reprocess', async (request, reply) => {
    const { key } = request.query as ReprocessQuery;
    if (!key) {
      return reply.status(400).send({ error: 'Missing key query parameter' });
    }

    const row = await getRowByProductKey(key);
    if (!row) {
      return reply.status(404).send({ error: 'No matching row for product key' });
    }

    if (row[COLUMN_NAMES.SHOPIFY_PRODUCT_ID]) {
      return reply.status(409).send({ error: 'Row already has ShopifyProductId' });
    }

    const status = (row[COLUMN_NAMES.STATUS] ?? '').toString().toUpperCase();
    if (!APPROVED_VALUES.includes(status as (typeof APPROVED_VALUES)[number])) {
      return reply.status(409).send({ error: 'Row is not approved' });
    }

    const result = await publishProduct(row);
    if (!result.success) {
      return reply.status(500).send({ error: result.error ?? 'Unknown failure' });
    }

    return { success: true, productId: result.productId };
  });
}
