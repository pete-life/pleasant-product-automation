import {
  CATEGORY_METAFIELD_KEYS,
  CATEGORY_STANDARD_DEFINITIONS,
  type CategoryMetafieldKey
} from '../config/constants';
import { logger } from '../logger';
import { shopifyRequest } from './client';
import type { ShopifyMetafieldInput } from './helpers';

interface MetaobjectNode {
  id: string;
  handle?: string | null;
  fields: Array<{ key: string; value: string | null }>;
}

interface MetaobjectCatalog {
  synonymMap: Map<string, string>;
  taxonomyMap: Map<string, string>;
}

const METAOBJECT_QUERY = /* GraphQL */ `
  query categoryMetaobjects($type: String!, $after: String) {
    metaobjects(first: 100, type: $type, after: $after) {
      edges {
        cursor
        node {
          id
          handle
          fields {
            key
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const DIACRITIC_REGEX = /[\u0300-\u036f]/g;

function normalizeToken(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITIC_REGEX, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractValues(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .flatMap((entry) => {
            if (typeof entry === 'string') return entry;
            return [];
          })
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    } catch {
      // fall back to delimiter-based parsing
    }
  }

  return trimmed
    .split(/[,;/]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

const CATEGORY_VALUE_ALIASES_RAW: Partial<Record<CategoryMetafieldKey, Record<string, string[]>>> = {
  age_group: {
    adult: ['adults'],
    adults: ['adults'],
    adulthood: ['adults'],
    kid: ['kids'],
    kids: ['kids'],
    child: ['kids'],
    children: ['kids'],
    teen: ['teens'],
    teens: ['teens'],
    toddler: ['toddlers'],
    toddlers: ['toddlers'],
    baby: ['babies'],
    babies: ['babies'],
    universal: ['universal'],
    'all ages': ['all ages']
  },
  target_gender: {
    male: ['male'],
    man: ['male'],
    men: ['male'],
    mens: ['male'],
    female: ['female'],
    woman: ['female'],
    women: ['female'],
    womens: ['female'],
    unisex: ['unisex'],
    neutral: ['unisex']
  },
  color: {
    grey: ['gray'],
    gray: ['gray'],
    multicolour: ['multicolor'],
    multicolor: ['multicolor'],
    'multi color': ['multicolor'],
    multi: ['multicolor']
  },
  sleeve_length: {
    long: ['lang'],
    'long sleeve': ['lang'],
    'long-sleeve': ['lang'],
    short: ['kort'],
    'short sleeve': ['kort'],
    'short-sleeve': ['kort']
  },
  clothing_feature: {
    adjustable: ['adjustable-fit'],
    'adjustable fit': ['adjustable-fit'],
    uv: ['uv-protection'],
    'uv protection': ['uv-protection'],
    collapsible: ['collapsible'],
    versatile: ['versatile']
  }
};

const CATEGORY_VALUE_ALIASES: Partial<Record<CategoryMetafieldKey, Map<string, string[]>>> = Object.fromEntries(
  Object.entries(CATEGORY_VALUE_ALIASES_RAW).map(([key, mapping]) => {
    const aliasMap = new Map<string, string[]>();
    Object.entries(mapping).forEach(([alias, replacements]) => {
      aliasMap.set(normalizeToken(alias), replacements.map((value) => normalizeToken(value)));
    });
    return [key, aliasMap];
  })
) as Partial<Record<CategoryMetafieldKey, Map<string, string[]>>>;

const catalogCache = new Map<string, MetaobjectCatalog>();

async function loadCatalog(metaobjectType: string): Promise<MetaobjectCatalog> {
  if (catalogCache.has(metaobjectType)) {
    return catalogCache.get(metaobjectType)!;
  }

  const synonyms = new Map<string, string>();
  const taxonomyMap = new Map<string, string>();

  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await shopifyRequest<{
      metaobjects: {
        edges: Array<{ cursor: string; node: MetaobjectNode }>;
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      };
    }>({
      query: METAOBJECT_QUERY,
      variables: {
        type: metaobjectType,
        after
      }
    });

    const { edges, pageInfo } = response.metaobjects;
    edges.forEach(({ node }) => {
      const synonymSet = new Set<string>();
      const taxonomyIds = new Set<string>();

      if (node.handle) {
        synonymSet.add(normalizeToken(node.handle));
      }

      node.fields.forEach(({ key, value }) => {
        if (!value) return;
        const trimmed = value.trim();
        if (!trimmed) return;

        // Attempt to parse JSON arrays (taxonomy references are often arrays)
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              parsed.forEach((entry) => {
                if (typeof entry === 'string') {
                  const entryTrimmed = entry.trim();
                  if (entryTrimmed.startsWith('gid://shopify/TaxonomyValue/')) {
                    taxonomyIds.add(entryTrimmed);
                  } else if (entryTrimmed.startsWith('gid://shopify/Metaobject/')) {
                    synonyms.set(entryTrimmed, node.id);
                  } else {
                    synonymSet.add(normalizeToken(entryTrimmed));
                  }
                }
              });
              return;
            }
          } catch {
            // fall through to default handling
          }
        }

        if (trimmed.startsWith('gid://shopify/TaxonomyValue/')) {
          taxonomyIds.add(trimmed);
          return;
        }

        if (trimmed.startsWith('gid://shopify/Metaobject/')) {
          synonyms.set(trimmed, node.id);
          return;
        }

        // skip hex color fields or similar
        if (/^#?[0-9a-f]{3,}$/i.test(trimmed)) {
          return;
        }

        synonymSet.add(normalizeToken(trimmed));
      });

      synonymSet.forEach((token) => {
        if (!token) return;
        if (!synonyms.has(token)) {
          synonyms.set(token, node.id);
        }
      });

      taxonomyIds.forEach((taxonomyId) => {
        if (!taxonomyMap.has(taxonomyId)) {
          taxonomyMap.set(taxonomyId, node.id);
        }
      });
    });

    hasNextPage = pageInfo.hasNextPage;
    after = pageInfo.endCursor ?? undefined;
  }

  const catalog = { synonymMap: synonyms, taxonomyMap };
  catalogCache.set(metaobjectType, catalog);
  return catalog;
}

function normalizeTaxonomyValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('gid://shopify/TaxonomyValue/')) {
    return trimmed;
  }
  if (/^[0-9]+$/.test(trimmed)) {
    return `gid://shopify/TaxonomyValue/${trimmed}`;
  }
  return undefined;
}

function getAliasCandidates(key: CategoryMetafieldKey, normalizedValue: string): string[] {
  const aliasMap = CATEGORY_VALUE_ALIASES[key];
  if (!aliasMap) return [normalizedValue];
  const replacements = aliasMap.get(normalizedValue);
  if (!replacements || !replacements.length) {
    return [normalizedValue];
  }
  return Array.from(new Set([normalizedValue, ...replacements]));
}

async function resolveCategoryMetaobjectIds(
  key: CategoryMetafieldKey,
  values: string[]
): Promise<{ resolved: string[]; unresolved: string[] }> {
  if (!values.length) {
    return { resolved: [], unresolved: [] };
  }

  const definition = CATEGORY_STANDARD_DEFINITIONS[key];
  if (!definition) {
    return { resolved: [], unresolved: values };
  }

  const catalog = await loadCatalog(definition.metaobjectType);
  if (!catalog.synonymMap.size && !catalog.taxonomyMap.size) {
    logger.warn({ key, values }, 'No Shopify metaobjects available for category attribute');
    return { resolved: [], unresolved: values };
  }

  const resolved: string[] = [];
  const unresolved: string[] = [];

  values.forEach((raw) => {
    const value = raw.trim();
    if (!value) return;

    if (value.startsWith('gid://shopify/Metaobject/')) {
      resolved.push(value);
      return;
    }

    const normalizedTaxonomy = normalizeTaxonomyValue(value);
    if (normalizedTaxonomy && catalog.taxonomyMap.has(normalizedTaxonomy)) {
      resolved.push(catalog.taxonomyMap.get(normalizedTaxonomy)!);
      return;
    }

    const normalizedValue = normalizeToken(value);
    if (!normalizedValue) {
      unresolved.push(value);
      return;
    }

    const candidates = getAliasCandidates(key, normalizedValue);
    const matchedId = candidates
      .map((candidate) => catalog.synonymMap.get(candidate))
      .find((candidateId): candidateId is string => Boolean(candidateId));

    if (matchedId) {
      resolved.push(matchedId);
    } else {
      unresolved.push(value);
    }
  });

  return { resolved: Array.from(new Set(resolved)), unresolved };
}

export async function convertCategoryMetafields(
  metafields: ShopifyMetafieldInput[]
): Promise<ShopifyMetafieldInput[]> {
  const transformed: ShopifyMetafieldInput[] = [];

  for (const entry of metafields) {
    if (entry.namespace !== 'category' || !CATEGORY_METAFIELD_KEYS.includes(entry.key as CategoryMetafieldKey)) {
      transformed.push(entry);
      continue;
    }

    const key = entry.key as CategoryMetafieldKey;
    const definition = CATEGORY_STANDARD_DEFINITIONS[key];
    const values = extractValues(entry.value);

    const { resolved, unresolved } = await resolveCategoryMetaobjectIds(key, values.length ? values : [entry.value]);

    if (resolved.length) {
      transformed.push({
        namespace: definition.namespace,
        key: definition.key,
        type: 'list.metaobject_reference',
        value: JSON.stringify(resolved)
      });
      if (unresolved.length) {
        logger.warn({ key, unresolved }, 'Unable to resolve some category metafield values to Shopify metaobjects');
      }
    } else {
      transformed.push(entry);
      if (unresolved.length) {
        logger.warn({ key, unresolved }, 'Unable to resolve category metafield values; leaving custom metafield unchanged');
      }
    }
  }

  return transformed;
}
