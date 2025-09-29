import { SIZE_OPTIONS, COLUMN_NAMES, METAFIELD_KEYS } from '../config/constants';
import type { SheetRow, AIContent, VariantSpec } from '../config/schemas';

function getString(row: SheetRow, key: string): string | undefined {
  const value = (row as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function slugify(s: string) {
  return s.toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildHandle(row: Pick<SheetRow, 'Handle' | 'ProductKey' | 'SKU' | 'Title'>) {
  const candidates = [row.Handle, row.ProductKey, row.SKU, row.Title]
    .map(v => (v ?? '').toString().trim())
    .filter(Boolean);
  const base = candidates[0] ?? 'untitled';
  const handle = slugify(base) + '-' + Date.now();
  return handle;
}

export function parseSizes(raw: string | undefined): string[] {
  if (!raw) return ['One-size'];
  const parts = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const normalized = parts.filter((value) => SIZE_OPTIONS.includes(value as (typeof SIZE_OPTIONS)[number]));
  if (!normalized.length) {
    return ['One-size'];
  }
  return normalized;
}

export function buildVariants(
  sizes: string[],
  baseSku: string,
  price?: string
): VariantSpec[] {
  const normalizedSku = baseSku?.trim() ?? 'SKU';
  return sizes.map((size) => ({
    title: size,
    sku: `${normalizedSku}-${size}`,
    optionValues: [
      {
        name: 'Size',
        value: size
      }
    ],
    price
  }));
}

export function mergeTags(sheetTags?: string, aiTags?: string[]): string[] {
  const explicitTags = (sheetTags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const generatedTags = (aiTags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const set = new Set<string>();
  explicitTags.forEach((tag) => set.add(tag));
  generatedTags.forEach((tag) => set.add(tag));
  return Array.from(set);
}

export function metafieldsFromRow(row: SheetRow, aiContent?: AIContent) {
  const sources: Record<string, string> = {};
  METAFIELD_KEYS.forEach((key) => {
    const sheetValue = getString(row, key);
    if (sheetValue) {
      sources[key] = sheetValue;
    }
  });

  if (aiContent?.metafields) {
    Object.entries(aiContent.metafields).forEach(([key, value]) => {
      if (!sources[key] && typeof value === 'string' && value.trim().length > 0) {
        sources[key] = value;
      }
    });
  }

  return Object.entries(sources).map(([key, value]) => ({
    namespace: 'custom',
    key,
    type: 'single_line_text_field',
    value
  }));
}

export function resolvedTitle(row: SheetRow, aiContent?: AIContent): string | undefined {
  return getString(row, COLUMN_NAMES.TITLE) ?? aiContent?.title;
}

export function resolvedDescription(row: SheetRow, aiContent?: AIContent): string | undefined {
  return getString(row, COLUMN_NAMES.DESCRIPTION) ?? aiContent?.descriptionHtml;
}

export function resolvedMetaDescription(row: SheetRow, aiContent?: AIContent): string | undefined {
  return getString(row, COLUMN_NAMES.META_DESCRIPTION) ?? aiContent?.metaDescription;
}
