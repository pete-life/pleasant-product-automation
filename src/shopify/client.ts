import { config } from '../env';
import { withBackoff } from '../utils/backoff';
import { logger } from '../logger';

interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

const endpoint = `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;

export async function shopifyRequest<T>(request: GraphQLRequest): Promise<T> {
  return withBackoff(async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.shopify.adminToken
      },
      body: JSON.stringify(request)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Shopify API ${response.status} ${response.statusText}: ${text}`);
    }

    const payload = JSON.parse(text) as GraphQLResponse<T>;
    if (payload.errors?.length) {
      const message = payload.errors.map((err) => err.message).join('; ');
      throw new Error(`Shopify GraphQL errors: ${message}`);
    }

    if (!payload.data) {
      throw new Error('Shopify GraphQL response missing data');
    }

    return payload.data;
  }, {
    retries: 3,
    onRetry: (error, attempt) => {
      logger.warn({ error, attempt }, 'Retrying Shopify GraphQL request');
    }
  });
}
