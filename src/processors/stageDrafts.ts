import { assignDeterministicPositions, type RawImageFile } from './mapFilenames';
import { listAllProductImageGroups, readFileAsBase64 } from '../google/drive';
import {
  ensureDraftRow,
  updateRowValues,
  writeLogs,
  writeError,
  getRowByProductKey,
  fetchProductsSheet
} from '../google/sheets';
import { generateContentForRow } from '../ai/generateContent';
import {
  COLUMN_NAMES,
  ROLE_COLUMN_MAP,
  SIZE_OPTIONS,
  SIZE_STOCK_COLUMNS,
  STATUS,
  METAFIELD_COLUMN_MAP
} from '../config/constants';
import type { SheetRow, LogEntry, ImageAsset } from '../config/schemas';
import { nowIso } from '../utils/dates';
import { logger } from '../logger';
import {
  deriveGpcProfile,
  gpcProfileToColumnUpdates,
  gpcProfileToMetafields
} from '../utils/gpc';

export interface StageDraftSummary {
  processed: number;
  staged: number;
  imageUpdates: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ productKey: string; message: string }>;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function isRowLocked(row: SheetRow): boolean {
  const status = stringValue(row[COLUMN_NAMES.STATUS])?.toUpperCase();
  return status === STATUS.APPROVED || status === STATUS.COMPLETE;
}

function shouldGenerateCopy(row: SheetRow): boolean {
  if (isRowLocked(row)) return false;
  const fields = [
    COLUMN_NAMES.TITLE,
    COLUMN_NAMES.DESCRIPTION,
    COLUMN_NAMES.META_DESCRIPTION,
    COLUMN_NAMES.TAGS
  ];
  return fields.some((column) => !stringValue(row[column as keyof SheetRow]));
}

function buildInventorySizes(row: SheetRow): string {
  const populatedSizes = SIZE_OPTIONS.filter((size) => {
    const column = SIZE_STOCK_COLUMNS[size];
    const value = row[column as keyof SheetRow];
    if (typeof value === 'number') {
      return value > 0;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }
    return false;
  });

  if (populatedSizes.length) {
    return populatedSizes.join(', ');
  }
  return 'One-size';
}

function buildImageUpdates(assets: ImageAsset[]): Record<string, string | undefined> {
  const updates: Record<string, string | undefined> = {};
  assets.forEach((asset) => {
    const column = ROLE_COLUMN_MAP[asset.role];
    if (!column) return;
    if (!updates[column]) {
      updates[column] = asset.driveFileId;
    }
  });
  return updates;
}

function buildMetafieldUpdates(metafields: Record<string, string | undefined> | undefined) {
  const updates: Record<string, string | undefined> = {};
  if (!metafields) return updates;
  Object.entries(METAFIELD_COLUMN_MAP).forEach(([column, key]) => {
    const next = metafields[key];
    if (!next) return;
    updates[column] = next;
  });
  return updates;
}

async function stageSingleProduct(
  productKey: string,
  files: RawImageFile[],
  existingRow?: SheetRow
): Promise<{ staged: boolean; imageUpdated: boolean }> {
  if (!files.length) {
    return { staged: false, imageUpdated: false };
  }

  const imageAssets = assignDeterministicPositions(files);
  const baseRow = existingRow ?? (await ensureDraftRow(productKey));
  const imageUpdates = buildImageUpdates(imageAssets);
  const updates: Record<string, string | undefined> = { ...imageUpdates };

  if (!stringValue(baseRow[COLUMN_NAMES.STATUS])) {
    updates[COLUMN_NAMES.STATUS] = STATUS.PENDING;
  }

  if (!stringValue(baseRow[COLUMN_NAMES.ROW_ID])) {
    updates[COLUMN_NAMES.ROW_ID] = productKey;
  }

  if (!stringValue(baseRow[COLUMN_NAMES.CREATED_AT])) {
    updates[COLUMN_NAMES.CREATED_AT] = nowIso();
  }

  updates[COLUMN_NAMES.UPDATED_AT] = nowIso();

  const derivedSizes = buildInventorySizes(baseRow);
  if (stringValue(baseRow[COLUMN_NAMES.SIZES]) !== derivedSizes) {
    updates[COLUMN_NAMES.SIZES] = derivedSizes;
  }

  const hasImageUpdates = Object.keys(imageUpdates).length > 0;

  if (Object.keys(updates).length > 0) {
    await updateRowValues(baseRow, updates);
  }

  const refreshedRow = await getRowByProductKey(productKey);
  if (!refreshedRow) {
    throw new Error(`Unable to reload sheet row for product ${productKey}`);
  }

  const shouldGenerate = shouldGenerateCopy(refreshedRow);
  if (!shouldGenerate) {
    if (hasImageUpdates) {
      const logEntry: LogEntry = {
        timestamp: nowIso(),
        action: 'draft:images-synced',
        productKey,
        message: `Updated image references for draft (${files.length} asset${files.length === 1 ? '' : 's'})`
      };
      await writeLogs([logEntry]);
    }
    return { staged: false, imageUpdated: hasImageUpdates };
  }

  let primaryImageData: { base64: string; mimeType: string } | undefined;
  const primaryAsset = imageAssets.find((asset) => asset.role === 'main') ?? imageAssets[0];
  if (primaryAsset) {
    try {
      primaryImageData = await readFileAsBase64(primaryAsset.driveFileId);
    } catch (error) {
      logger.warn({ error, fileId: primaryAsset.driveFileId }, 'Failed to load primary image for AI generation');
    }
  }

  const aiContent = await generateContentForRow(refreshedRow, { primaryImage: primaryImageData });

  const copyUpdates: Record<string, string | undefined> = {
    [COLUMN_NAMES.TITLE]: aiContent.title,
    [COLUMN_NAMES.DESCRIPTION]: aiContent.description,
    [COLUMN_NAMES.META_DESCRIPTION]: aiContent.meta_description,
    [COLUMN_NAMES.TAGS]: aiContent.tags.join(', '),
    [COLUMN_NAMES.STYLE]: aiContent.style,
    [COLUMN_NAMES.CATEGORY]: aiContent.category,
    [COLUMN_NAMES.COLOR]: aiContent.color,
    [COLUMN_NAMES.PATTERN]: aiContent.pattern,
    [COLUMN_NAMES.VENDOR]: aiContent.vendor ?? 'Pleasant',
    [COLUMN_NAMES.SIZES]: buildInventorySizes(refreshedRow),
    [COLUMN_NAMES.UPDATED_AT]: nowIso()
  };

  const metafieldsPayload: Record<string, string | undefined> = {
    fabric: aiContent.metafields?.fabric ?? 'Upcycled',
    color: aiContent.metafields?.color ?? aiContent.color,
    pattern: aiContent.metafields?.pattern ?? aiContent.pattern,
    target_gender: aiContent.metafields?.target_gender ?? 'Unisex',
    age_group: aiContent.metafields?.age_group ?? 'Adults',
    sleeve_length: aiContent.metafields?.sleeve_length,
    clothing_feature: aiContent.metafields?.clothing_feature
  };

  const gpcProfile = aiContent.style
    ? deriveGpcProfile({
        style: aiContent.style,
        targetGender: metafieldsPayload.target_gender,
        ageGroup: metafieldsPayload.age_group,
        sleeveLength: metafieldsPayload.sleeve_length,
        clothingFeature: metafieldsPayload.clothing_feature
      })
    : undefined;

  if (gpcProfile) {
    Object.assign(copyUpdates, gpcProfileToColumnUpdates(gpcProfile));
    Object.assign(metafieldsPayload, gpcProfileToMetafields(gpcProfile));
  }

  Object.assign(copyUpdates, buildMetafieldUpdates(metafieldsPayload));

  await updateRowValues(refreshedRow, copyUpdates);

  const logEntry: LogEntry = {
    timestamp: nowIso(),
    action: 'draft:generated',
    productKey,
    message: `Generated AI draft with ${imageAssets.length} image${imageAssets.length === 1 ? '' : 's'}`
  };
  await writeLogs([logEntry]);

  return { staged: true, imageUpdated: hasImageUpdates };
}

export async function stageDrafts(): Promise<StageDraftSummary> {
  const summary: StageDraftSummary = {
    processed: 0,
    staged: 0,
    imageUpdates: 0,
    skipped: 0,
    errors: 0,
    errorDetails: []
  };

  const groups = await listAllProductImageGroups();
  if (!groups.size) {
    return summary;
  }

  const snapshot = await fetchProductsSheet();
  const rowLookup = new Map<string, SheetRow>();
  snapshot.rows.forEach((row) => {
    const key = stringValue(row[COLUMN_NAMES.PRODUCT_KEY]);
    if (key) {
      rowLookup.set(key.toLowerCase(), row);
    }
  });

  for (const [productKey, files] of groups.entries()) {
    summary.processed += 1;
    try {
      const existing = rowLookup.get(productKey.toLowerCase());
      const result = await stageSingleProduct(productKey, files, existing);
      if (result.staged) {
        summary.staged += 1;
      } else if (result.imageUpdated) {
        summary.imageUpdates += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error, productKey }, 'Failed to stage draft');
      summary.errorDetails.push({ productKey, message });
      await writeError({
        timestamp: nowIso(),
        productKey,
        step: 'stageDrafts',
        message,
        hint: 'Ensure Drive filenames follow <productKey>_<role>.jpg and sheet permissions are set',
        payloadSnippet: JSON.stringify({ productKey }).slice(0, 500)
      });
    }
  }

  return summary;
}
