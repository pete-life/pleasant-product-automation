import type { SheetRow, ImageAsset } from '../config/schemas';
import { COLUMN_NAMES, KNOWN_IMAGE_COLUMNS } from '../config/constants';
import { listProductImageFiles } from '../google/drive';
import { assignDeterministicPositions, type RawImageFile } from './mapFilenames';
import { getDriveClient } from '../google/auth';
import { withBackoff } from '../utils/backoff';
import { logger } from '../logger';

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export async function collectRowAssets(row: SheetRow): Promise<ImageAsset[]> {
  const productKey = getString(row[COLUMN_NAMES.PRODUCT_KEY]);
  if (!productKey) return [];

  const rawFiles = await listProductImageFiles(productKey);
  const fileMap = new Map<string, RawImageFile>();
  rawFiles.forEach((file) => fileMap.set(file.driveFileId, file));

  const drive = await getDriveClient();

  await Promise.all(
    KNOWN_IMAGE_COLUMNS.map(async (column) => {
      const fileId = getString(row[column as keyof SheetRow]);
      if (!fileId || fileMap.has(fileId)) return;

      try {
        const metadata = await withBackoff(() =>
          drive.files.get({
            fileId,
            fields: 'id, name, mimeType, size, modifiedTime',
            supportsAllDrives: true
          })
        );
        const data = metadata.data;
        if (!data.id || !data.name) return;
        fileMap.set(data.id, {
          driveFileId: data.id,
          filename: data.name,
          mimeType: data.mimeType ?? undefined,
          sizeBytes: data.size ? Number(data.size) : undefined,
          modifiedTime: data.modifiedTime ?? undefined
        });
      } catch (error) {
        logger.warn({ error, fileId, column }, 'Failed to load referenced Drive image metadata');
      }
    })
  );

  return assignDeterministicPositions([...fileMap.values()]);
}
