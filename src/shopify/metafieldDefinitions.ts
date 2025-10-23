import { CATEGORY_STANDARD_DEFINITIONS } from '../config/constants';
import { logger } from '../logger';
import { shopifyRequest } from './client';

type StandardMetafieldDefinitionEnableResponse = {
  standardMetafieldDefinitionEnable: {
    createdDefinition: { id: string } | null;
    userErrors: Array<{ field?: string[] | null; message: string }>;
  };
};

let ensured = false;

export async function ensureCategoryMetafieldDefinitions(): Promise<void> {
  if (ensured) return;

  const entries = Object.values(CATEGORY_STANDARD_DEFINITIONS);

  for (const { namespace, key } of entries) {
    try {
      const result = await shopifyRequest<StandardMetafieldDefinitionEnableResponse>({
        query: /* GraphQL */ `
          mutation enableStandardDefinition($ownerType: MetafieldOwnerType!, $namespace: String!, $key: String!) {
            standardMetafieldDefinitionEnable(ownerType: $ownerType, namespace: $namespace, key: $key) {
              createdDefinition { id }
              userErrors { field message }
            }
          }
        `,
        variables: {
          ownerType: 'PRODUCT',
          namespace,
          key
        }
      });

      const { userErrors } = result.standardMetafieldDefinitionEnable;
      if (userErrors.length) {
        const message = userErrors
          .map((error) => `${error.message}${error.field ? ` (${error.field.join('.')})` : ''}`)
          .join('; ');
        logger.warn({ namespace, key, message }, 'Unable to enable standard metafield definition');
      }
    } catch (error) {
      logger.warn({ error, namespace, key }, 'Failed to enable standard metafield definition');
    }
  }

  ensured = true;
}
