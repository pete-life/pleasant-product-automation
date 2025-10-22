import { shopifyRequest } from './client';
import { logger } from '../logger';

interface MetaobjectsResponse {
  metaobjects: {
    nodes: Array<{
      id: string;
      handle: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
}

const cache = new Map<string, Map<string, string>>();
const pending = new Map<string, Promise<Map<string, string>>>();

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function loadMetaobjects(type: string): Promise<Map<string, string>> {
  const cached = cache.get(type);
  if (cached) return cached;

  const existingPending = pending.get(type);
  if (existingPending) return existingPending;

  const promise = (async () => {
    const map = new Map<string, string>();
    let hasNext = true;
    let cursor: string | undefined;

    while (hasNext) {
      const response = await shopifyRequest<MetaobjectsResponse>({
        query: `
          query FetchMetaobjects($type: String!, $cursor: String) {
            metaobjects(first: 100, type: $type, after: $cursor) {
              nodes { id handle }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        variables: {
          type,
          cursor
        }
      });

      response.metaobjects.nodes.forEach((node) => {
        const normalized = normalizeHandle(node.handle);
        if (normalized) {
          map.set(normalized, node.id);
        }
      });

      hasNext = response.metaobjects.pageInfo.hasNextPage;
      cursor = response.metaobjects.pageInfo.endCursor ?? undefined;
    }

    cache.set(type, map);
    pending.delete(type);
    return map;
  })();

  pending.set(type, promise);

  return promise;
}

export async function resolveMetaobjectId(type: string, value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;
  const lookup = await loadMetaobjects(type);
  const normalized = normalizeHandle(value);
  const match = lookup.get(normalized);
  if (!match) {
    logger.warn({ type, value }, 'No matching metaobject found for reference value');
  }
  return match;
}
