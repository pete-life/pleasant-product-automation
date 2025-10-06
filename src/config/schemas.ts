import { z } from 'zod';
import { COLUMN_NAMES, METAFIELD_COLUMN_MAP, METAFIELD_KEY_WHITELIST } from './constants';

export type HeaderMap = Record<string, number>;

const optionalStringCell = z
  .preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      const str = String(value).trim();
      return str.length === 0 ? undefined : str;
    }
    return undefined;
  }, z.string())
  .optional();

export const SheetRowSchema = z
  .object({
    rowNumber: z.number().int().min(2),
    headerMap: z.record(z.number()),

    [COLUMN_NAMES.BATCH_ID]: optionalStringCell,
    [COLUMN_NAMES.STATUS]: optionalStringCell,
    [COLUMN_NAMES.ROW_ID]: optionalStringCell,
    [COLUMN_NAMES.SHOPIFY_PRODUCT_ID]: optionalStringCell,
    [COLUMN_NAMES.PRODUCT_KEY]: optionalStringCell,
    [COLUMN_NAMES.SKU]: optionalStringCell,
    [COLUMN_NAMES.TITLE]: optionalStringCell,
    [COLUMN_NAMES.DESCRIPTION]: optionalStringCell,
    [COLUMN_NAMES.META_DESCRIPTION]: optionalStringCell,
    [COLUMN_NAMES.TAGS]: optionalStringCell,
    [COLUMN_NAMES.STYLE]: optionalStringCell,
    [COLUMN_NAMES.CATEGORY]: optionalStringCell,
    [COLUMN_NAMES.COLOR]: optionalStringCell,
    [COLUMN_NAMES.PATTERN]: optionalStringCell,
    [COLUMN_NAMES.PRICE]: optionalStringCell,
    [COLUMN_NAMES.VENDOR]: optionalStringCell,
    [COLUMN_NAMES.HANDLE]: optionalStringCell,
    [COLUMN_NAMES.MAIN_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.CLOSE_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.MODEL_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.MODEL2_IMAGE_ID]: optionalStringCell,
    [COLUMN_NAMES.SIZES]: optionalStringCell,
    [COLUMN_NAMES.CREATED_AT]: optionalStringCell,
    [COLUMN_NAMES.UPDATED_AT]: optionalStringCell,
    [COLUMN_NAMES.STOCK_ONE_SIZE]: optionalStringCell,
    [COLUMN_NAMES.STOCK_XS]: optionalStringCell,
    [COLUMN_NAMES.STOCK_S]: optionalStringCell,
    [COLUMN_NAMES.STOCK_M]: optionalStringCell,
    [COLUMN_NAMES.STOCK_L]: optionalStringCell,
    [COLUMN_NAMES.STOCK_XL]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_FABRIC]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_COLOR]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_PATTERN]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_TARGET_GENDER]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_AGE_GROUP]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_SLEEVE_LENGTH]: optionalStringCell,
    [COLUMN_NAMES.METAFIELD_CLOTHING_FEATURE]: optionalStringCell,
    [COLUMN_NAMES.GPC_CODE]: optionalStringCell,
    [COLUMN_NAMES.GPC_ATTRIBUTES]: optionalStringCell,
    [COLUMN_NAMES.GOOGLE_PRODUCT_CATEGORY]: optionalStringCell,
    [COLUMN_NAMES.STRUCTURED_DATA]: optionalStringCell,
    [COLUMN_NAMES.GPC_DESCRIPTION]: optionalStringCell,
    [COLUMN_NAMES.GPC_SEGMENT]: optionalStringCell,
    [COLUMN_NAMES.GPC_SEGMENT_NAME]: optionalStringCell,
    [COLUMN_NAMES.GPC_FAMILY]: optionalStringCell,
    [COLUMN_NAMES.GPC_FAMILY_NAME]: optionalStringCell,
    [COLUMN_NAMES.GPC_CLASS]: optionalStringCell,
    [COLUMN_NAMES.GPC_CLASS_NAME]: optionalStringCell,
    [COLUMN_NAMES.GPC_BRICK]: optionalStringCell,
    [COLUMN_NAMES.GPC_BRICK_NAME]: optionalStringCell
  })
  .passthrough();

export type SheetRow = z.infer<typeof SheetRowSchema>;

const RawMetafieldsSchema = z
  .record(z.string(), z.unknown())
  .transform((value) => {
    if (!value) return undefined;
    const normalized = Object.entries(value).flatMap(([key, raw]) => {
      if (!METAFIELD_KEY_WHITELIST.includes(key)) {
        return [];
      }

      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        return trimmed.length ? [[key, trimmed]] : [];
      }

      if (typeof raw === 'number' || typeof raw === 'boolean') {
        const str = String(raw).trim();
        return str.length ? [[key, str]] : [];
      }

      return [];
    });

    if (!normalized.length) {
      return undefined;
    }

    return Object.fromEntries(normalized);
  })
  .optional();

export const AIContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  meta_description: z.string(),
  tags: z.array(z.string()).min(1),
  category: z.string(),
  style: z.string(),
  color: z.string(),
  pattern: z.string(),
  vendor: z.string().optional(),
  metafields: RawMetafieldsSchema
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
  price: optionalStringCell,
  inventoryQuantity: z
    .preprocess((value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) {
          return Math.max(0, Math.floor(parsed));
        }
      }
      return undefined;
    }, z.number().int().nonnegative().optional())
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
