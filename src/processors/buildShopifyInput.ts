import type { SheetRow, AIContent, VariantSpec } from '../config/schemas';
import { COLUMN_NAMES, SIZE_OPTIONS, SIZE_STOCK_COLUMNS, CATEGORY_METAFIELD_KEYS } from '../config/constants';
import {
  parseSizes,
  buildVariants,
  mergeTags,
  buildHandle,
  metafieldsFromRow,
  resolvedTitle,
  resolvedDescription,
  resolvedMetaDescription,
  type ShopifyMetafieldInput
} from '../shopify/helpers';
import { determinePrice, determineGpc } from '../utils/merchandising';
import { logger } from '../logger';
import { mapPatternToHandle } from '../utils/patterns';

export interface BuildShopifyInputResult {
  productInput: Record<string, unknown>;
  variants: VariantSpec[];
  metafields: ShopifyMetafieldInput[];
  variantMetafields: ShopifyMetafieldInput[][];
  sheetUpdates: Record<string, string>;
  tags: string[];
  price: string;
  hasProductOptions: boolean;
}

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function buildShopifyInput(row: SheetRow, aiContent?: AIContent): BuildShopifyInputResult {
  const title = resolvedTitle(row, aiContent) ?? 'Untitled Product';
  const descriptionHtml = resolvedDescription(row, aiContent) ?? '';
  const metaDescription = resolvedMetaDescription(row, aiContent);

  const extraTags = [
    getString(row[COLUMN_NAMES.STYLE]),
    getString(row[COLUMN_NAMES.COLOR]),
    getString(row[COLUMN_NAMES.PATTERN])
  ].filter(Boolean) as string[];

  const tags = mergeTags(getString(row[COLUMN_NAMES.TAGS]), aiContent?.tags, extraTags);
  const style = getString(row[COLUMN_NAMES.STYLE]) ?? aiContent?.style;
  const category = getString(row[COLUMN_NAMES.CATEGORY]) ?? aiContent?.category;
  logger.debug({ productKey: getString(row[COLUMN_NAMES.PRODUCT_KEY]), style, category }, 'buildShopifyInput: resolved merchandising context');
  const inventoryBySize: Record<string, number | undefined> = {};
  SIZE_OPTIONS.forEach((size) => {
    const column = SIZE_STOCK_COLUMNS[size];
    const raw = row[column as keyof SheetRow];
    let numeric: number | undefined;
    if (typeof raw === 'number') {
      numeric = raw;
    } else if (typeof raw === 'string' && raw.trim().length) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        numeric = parsed;
      }
    }
    if (numeric !== undefined) {
      inventoryBySize[size] = Math.max(0, Math.floor(numeric));
    }
  });

  const explicitSizes = parseSizes(getString(row[COLUMN_NAMES.SIZES]));
  const derivedSizes = explicitSizes.length
    ? explicitSizes
    : SIZE_OPTIONS.filter((size) => (inventoryBySize[size] ?? 0) > 0);
  const sizes = derivedSizes.length ? derivedSizes : ['One-size'];
  const baseSku = getString(row[COLUMN_NAMES.SKU]) ?? getString(row[COLUMN_NAMES.PRODUCT_KEY]) ?? `SKU-${Date.now()}`;
  let price = getString(row[COLUMN_NAMES.PRICE]);
  if (!price || !Number.parseFloat(price)) {
    price = determinePrice(style);
    logger.debug({ productKey: getString(row[COLUMN_NAMES.PRODUCT_KEY]), price, style }, 'buildShopifyInput: computed price');
  }

  const variants = buildVariants(sizes, baseSku, price, inventoryBySize);

  const sheetUpdates: Record<string, string> = {
    [COLUMN_NAMES.TITLE]: title,
    [COLUMN_NAMES.DESCRIPTION]: descriptionHtml,
    [COLUMN_NAMES.TAGS]: tags.join(', ')
  };

  sheetUpdates[COLUMN_NAMES.PRICE] = price;
  sheetUpdates[COLUMN_NAMES.SIZES] = sizes.join(', ');

  if (metaDescription) {
    sheetUpdates[COLUMN_NAMES.META_DESCRIPTION] = metaDescription;
  }

  const gpc = determineGpc(style, category);
  logger.debug({ productKey: getString(row[COLUMN_NAMES.PRODUCT_KEY]), gpc }, 'buildShopifyInput: computed GPC mapping');
  sheetUpdates[COLUMN_NAMES.GPC_CODE] = gpc.code;
  sheetUpdates[COLUMN_NAMES.GPC_DESCRIPTION] = gpc.description;
  sheetUpdates[COLUMN_NAMES.GPC_SEGMENT] = gpc.segment;
  sheetUpdates[COLUMN_NAMES.GPC_SEGMENT_NAME] = gpc.segmentName;
  sheetUpdates[COLUMN_NAMES.GPC_FAMILY] = gpc.family;
  sheetUpdates[COLUMN_NAMES.GPC_FAMILY_NAME] = gpc.familyName;
  sheetUpdates[COLUMN_NAMES.GPC_CLASS] = gpc.class;
  sheetUpdates[COLUMN_NAMES.GPC_CLASS_NAME] = gpc.className;
  sheetUpdates[COLUMN_NAMES.GPC_BRICK] = gpc.brick;
  sheetUpdates[COLUMN_NAMES.GPC_BRICK_NAME] = gpc.brickName;

  const metafields = metafieldsFromRow(row, aiContent);
  const categoryKeySet = new Set<string>(CATEGORY_METAFIELD_KEYS);
  for (let index = metafields.length - 1; index >= 0; index -= 1) {
    const entry = metafields[index];
    if (entry.namespace === 'custom' && categoryKeySet.has(entry.key)) {
      metafields.splice(index, 1);
    }
  }

  const ensureMetafield = (
    namespace: string,
    key: string,
    value: string | undefined,
    type: ShopifyMetafieldInput['type']
  ) => {
    if (!value) return;
    const existing = metafields.find((entry) => entry.key === key && entry.namespace === namespace);
    if (existing) {
      existing.value = value;
      existing.type = type;
    } else {
      metafields.push({ namespace, key, type, value });
    }
  };

  const ensureCustomMetafield = (key: string, value: string | undefined) =>
    ensureMetafield('custom', key, value, 'single_line_text_field');
  const ensureCategoryMetafield = (key: string, value: string | undefined) =>
    ensureMetafield('category', key, value, 'single_line_text_field');

  ensureCustomMetafield('gpc_code', gpc.code);
  ensureCustomMetafield('gpc_description', gpc.description);
  ensureCustomMetafield('gpc_segment', gpc.segment);
  ensureCustomMetafield('gpc_segment_name', gpc.segmentName);
  ensureCustomMetafield('gpc_family', gpc.family);
  ensureCustomMetafield('gpc_family_name', gpc.familyName);
  ensureCustomMetafield('gpc_class', gpc.class);
  ensureCustomMetafield('gpc_class_name', gpc.className);
  ensureCustomMetafield('gpc_brick', gpc.brick);
  ensureCustomMetafield('gpc_brick_name', gpc.brickName);
  const taxonomyCategoryId = gpc.taxonomyCategoryId?.trim();

  const googleAgeGroup = aiContent?.metafields?.age_group ?? getString(row[COLUMN_NAMES.METAFIELD_AGE_GROUP]) ?? 'Adults';
  const googleGender = aiContent?.metafields?.target_gender ?? getString(row[COLUMN_NAMES.METAFIELD_TARGET_GENDER]) ?? 'Unisex';
  const googleCondition = aiContent?.metafields?.condition ?? 'new';
  const googleMpn = getString(row[COLUMN_NAMES.SKU]) ?? getString(row[COLUMN_NAMES.PRODUCT_KEY]);

  ensureCategoryMetafield('age_group', googleAgeGroup);
  ensureCategoryMetafield('target_gender', googleGender);

  const patternHandle =
    mapPatternToHandle(aiContent?.metafields?.pattern) ??
    mapPatternToHandle(aiContent?.pattern) ??
    mapPatternToHandle(getString(row[COLUMN_NAMES.METAFIELD_PATTERN])) ??
    mapPatternToHandle(getString(row[COLUMN_NAMES.PATTERN]));

  if (patternHandle) {
    ensureMetafield('custom', 'pattern', patternHandle, 'metaobject_reference');
  }

  const variantMetafields = variants.map(() => {
    const entries: ShopifyMetafieldInput[] = [];
    const add = (key: string, value: string | undefined) => {
      if (!value) return;
      entries.push({
        namespace: 'mm-google-shopping',
        key,
        type: 'single_line_text_field',
        value
      });
    };

    add('condition', googleCondition);
    add('mpn', googleMpn);

    return entries;
  });

  const productInput: Record<string, unknown> = {
    title,
    descriptionHtml,
    status: 'DRAFT',
    vendor: getString(row[COLUMN_NAMES.VENDOR]),
    productType: getString(row[COLUMN_NAMES.PRODUCT_TYPE]),
    tags,
    handle: buildHandle({
      Handle: row[COLUMN_NAMES.HANDLE],
      ProductKey: row[COLUMN_NAMES.PRODUCT_KEY],
      SKU: row[COLUMN_NAMES.SKU],
      Title: row[COLUMN_NAMES.TITLE]
    })
  };
  if (taxonomyCategoryId) {
    productInput.category = taxonomyCategoryId;
  } else {
    logger.warn(
      { productKey: getString(row[COLUMN_NAMES.PRODUCT_KEY]), gpc },
      'buildShopifyInput: missing taxonomy category id; skipping category assignment'
    );
  }

  let hasProductOptions = false;
  if (sizes.length > 1) {
    hasProductOptions = true;
    productInput.productOptions = [
      {
        name: 'Size',
        values: sizes
      }
    ];
  }

  return {
    productInput,
    variants,
    metafields,
    variantMetafields,
    sheetUpdates,
    tags,
    price,
    hasProductOptions
  };
}
