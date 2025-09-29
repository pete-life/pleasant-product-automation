import type { SheetRow, AIContent, VariantSpec } from '../config/schemas';
import { COLUMN_NAMES } from '../config/constants';
import {
  parseSizes,
  buildVariants,
  mergeTags,
  buildHandle,
  metafieldsFromRow,
  resolvedTitle,
  resolvedDescription,
  resolvedMetaDescription
} from '../shopify/helpers';

export interface BuildShopifyInputResult {
  productInput: Record<string, unknown>;
  variants: VariantSpec[];
  metafields: Array<Record<string, unknown>>;
  sheetUpdates: Record<string, string>;
  tags: string[];
  price: string;
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

  const tags = mergeTags(getString(row[COLUMN_NAMES.TAGS]), aiContent?.tags);
  const sizes = parseSizes(getString(row[COLUMN_NAMES.SIZES]));
  const baseSku = getString(row[COLUMN_NAMES.SKU]) ?? getString(row[COLUMN_NAMES.PRODUCT_KEY]) ?? `SKU-${Date.now()}`;
  const price = getString(row[COLUMN_NAMES.PRICE]) ?? '0';

  const variants = buildVariants(sizes, baseSku, price);

  const sheetUpdates: Record<string, string> = {
    [COLUMN_NAMES.TITLE]: title,
    [COLUMN_NAMES.DESCRIPTION]: descriptionHtml,
    [COLUMN_NAMES.TAGS]: tags.join(', ')
  };

  if (metaDescription) {
    sheetUpdates[COLUMN_NAMES.META_DESCRIPTION] = metaDescription;
  }

  const metafields = metafieldsFromRow(row, aiContent);

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

  if (sizes.length > 1) {
    productInput.options = [{ name: 'Size' }];
  }

  return {
    productInput,
    variants,
    metafields,
    sheetUpdates,
    tags,
    price
  };
}
