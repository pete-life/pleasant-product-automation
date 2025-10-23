import { shopifyRequest } from './client';
import { logger } from '../logger';

interface MetafieldDefinition {
  id: string;
  namespace: string;
  key: string;
}

const CATEGORY_NAMESPACE = 'category';
const CATEGORY_DEFINITIONS: Array<{ key: string; name: string; type: string; description?: string }> = [
  { key: 'age_group', name: 'Age group', type: 'single_line_text_field' },
  { key: 'target_gender', name: 'Target gender', type: 'single_line_text_field' },
  { key: 'fabric', name: 'Fabric', type: 'single_line_text_field' },
  { key: 'sleeve_length', name: 'Sleeve length', type: 'single_line_text_field' },
  { key: 'clothing_feature', name: 'Clothing feature', type: 'single_line_text_field' },
  { key: 'color', name: 'Color', type: 'single_line_text_field' }
];

let categoryDefinitionsEnsured = false;

export async function ensureCategoryMetafieldDefinitions(): Promise<void> {
  if (categoryDefinitionsEnsured) return;

  const data = await shopifyRequest<{
    metafieldDefinitions: { edges: Array<{ node: MetafieldDefinition }> };
  }>({
    query: /* GraphQL */ `
      query metafieldDefinitions($namespace: String!) {
        metafieldDefinitions(first: 100, ownerType: PRODUCT, namespace: $namespace) {
          edges {
            node {
              namespace
              key
            }
          }
        }
      }
    `,
    variables: {
      namespace: CATEGORY_NAMESPACE
    }
  });

  const existingKeys = new Set(
    data.metafieldDefinitions.edges.map((edge) => edge.node.key)
  );

  const missing = CATEGORY_DEFINITIONS.filter((definition) => !existingKeys.has(definition.key));

  if (!missing.length) {
    categoryDefinitionsEnsured = true;
    return;
  }

  for (const definition of missing) {
    try {
      const result = await shopifyRequest<{
        metafieldDefinitionCreate: {
          createdDefinition: { id: string } | null;
          userErrors: Array<{ field?: string[] | null; message: string }>;
        };
      }>({
        query: /* GraphQL */ `
          mutation defineMetafield($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition { id }
              userErrors { field message }
            }
          }
        `,
        variables: {
          definition: {
            namespace: CATEGORY_NAMESPACE,
            key: definition.key,
            name: definition.name,
            type: definition.type,
            ownerType: 'PRODUCT',
            description: definition.description
          }
        }
      });

      const { userErrors } = result.metafieldDefinitionCreate;
      if (userErrors.length) {
        const message = userErrors.map((error) => `${error.message}${error.field ? ` (${error.field.join('.')})` : ''}`).join('; ');
        throw new Error(message);
      }
    } catch (error) {
      logger.warn(
        { error, definition },
        'Failed to create category metafield definition'
      );
    }
  }

  categoryDefinitionsEnsured = true;
}
