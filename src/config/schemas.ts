import { z } from 'zod';
import { COLUMN_NAMES, METAFIELD_KEYS } from './constants';

export type HeaderMap = Record<string, number>;

const booleanCell = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(normalized);
  }
  return false;
}, z.boolean());

const optionalStringCell = z
  .preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      const str = String(value);
      return str.length === 0 ? undefined : str;
    }
    return undefined;
  }, z.string())
  .optional();

export const SheetRowSchema = z
  .object({
    rowNumber: z.number().int().min(2),
    headerMap: z.record(z.number()),

    [COLUMN_NAMES.ROW_NUMBER]: optionalStringCell,
    [COLUMN_NAMES.BATCH_ID]: optionalStringCell,
    [COLUMN_NAMES.STATUS]: optionalStringCell,
    [COLUMN_NAMES.SHOPIFY_PRODUCT_ID]: optionalStringCell,
    [COLUMN_NAMES.PRODUCT_KEY]: optionalStringCell,
    [COLUMN_NAMES.SKU]: optionalStringCell,
    [COLUMN_NAMES.TITLE]: optionalStringCell,
    [COLUMN_NAMES.DESCRIPTION]: optionalStringCell,
    [COLUMN_NAMES.META_DESCRIPTION]: optionalStringCell,
    [COLUMN_NAMES.PRICE]: optionalStringCell,
    [COLUMN_NAMES.VENDOR]: optionalStringCell,
    [COLUMN_NAMES.PRODUCT_TYPE]: optionalStringCell,
    [COLUMN_NAMES.TAGS]: optionalStringCell,
    [COLUMN_NAMES.HANDLE]: optionalStringCell,
    [COLUMN_NAMES.MAIN_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.CLOSE_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.MODEL_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.MODEL2_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.SIZES]: optionalStringCell,
    [COLUMN_NAMES.CREATED_AT]: optionalStringCell,
    [COLUMN_NAMES.UPDATED_AT]: optionalStringCell,
    [COLUMN_NAMES.REGENERATE]: booleanCell,
    [COLUMN_NAMES.FABRIC]: optionalStringCell,
    [COLUMN_NAMES.COLOR]: optionalStringCell,
    [COLUMN_NAMES.PATTERN]: optionalStringCell,
    [COLUMN_NAMES.TARGET_GENDER]: optionalStringCell,
    [COLUMN_NAMES.AGE_GROUP]: optionalStringCell,
    [COLUMN_NAMES.SLEEVE_LENGTH]: optionalStringCell,
    [COLUMN_NAMES.CLOTHING_FEATURE]: optionalStringCell
  })
  .passthrough();

export type SheetRow = z.infer<typeof SheetRowSchema>;

export const AIContentSchema = z.object({
  title: z.string(),
  descriptionHtml: z.string(),
  metaDescription: z.string(),
  tags: z.array(z.string()).default([]),
  metafields: z
    .record(z.string())
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const filteredEntries = Object.entries(value).filter(([key, val]) =>
        Boolean(val) && METAFIELD_KEYS.includes(key as (typeof METAFIELD_KEYS)[number])
      );
      return filteredEntries.length ? Object.fromEntries(filteredEntries) : undefined;
    })
});

export type AIContent = z.infer<typeof AIContentSchema>;

export const VariantSpecSchema = z.object({
  title: z.string(),
  sku: z.string(),
  optionValues: z.array(
    z.object({
      name: z.string(),
      value: z.string()
    })
  ),
  price: optionalStringCell
});

export type VariantSpec = z.infer<typeof VariantSpecSchema>;

export const ImageAssetSchema = z.object({
  driveFileId: z.string(),
  filename: z.string(),
  role: z.string(),
  position: z.number().int().positive(),
  mimeType: optionalStringCell,
  sizeBytes: z.number().nonnegative().optional(),
  modifiedTime: optionalStringCell
});

export type ImageAsset = z.infer<typeof ImageAssetSchema>;

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  action: z.string(),
  productKey: optionalStringCell,
  message: z.string()
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

export const ErrorEntrySchema = z.object({
  timestamp: z.string(),
  productKey: optionalStringCell,
  step: z.string(),
  message: z.string(),
  hint: optionalStringCell,
  payloadSnippet: optionalStringCell
});

export type ErrorEntry = z.infer<typeof ErrorEntrySchema>;
