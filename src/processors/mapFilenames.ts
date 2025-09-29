import { ROLE_ORDER } from '../config/constants';
import { ImageAssetSchema, type ImageAsset } from '../config/schemas';

export interface RawImageFile {
  driveFileId: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  modifiedTime?: string;
}

export interface ParsedFilename {
  productKey: string;
  role: string;
}

export function parseFilename(filename: string): ParsedFilename | null {
  const base = filename.trim();
  const underscoreIndex = base.indexOf('_');
  if (underscoreIndex <= 0) return null;

  const productKey = base.slice(0, underscoreIndex).trim();
  if (!productKey) return null;

  const remainder = base.slice(underscoreIndex + 1);
  const dotIndex = remainder.lastIndexOf('.');
  const roleSegment = (dotIndex > 0 ? remainder.slice(0, dotIndex) : remainder).trim();
  if (!roleSegment) return null;

  const normalizedRole = roleSegment.toLowerCase();
  return {
    productKey,
    role: normalizedRole === 'model2' || normalizedRole === 'model' ? normalizedRole : normalizedRole.replace(/[^a-z0-9]/g, '') || 'misc'
  };
}

export function assignDeterministicPositions(files: RawImageFile[]): ImageAsset[] {
  const grouped = new Map<string, RawImageFile[]>();

  files.forEach((file) => {
    const parsed = parseFilename(file.filename);
    const role = parsed?.role ?? 'misc';
    if (!grouped.has(role)) {
      grouped.set(role, []);
    }
    grouped.get(role)!.push(file);
  });

  const canonicalRoles = [...ROLE_ORDER] as string[];
  const remaining = [...grouped.keys()].filter((role) => !canonicalRoles.includes(role));
  remaining.sort();
  const orderedRoles = [...canonicalRoles, ...remaining];

  const output: ImageAsset[] = [];
  let position = 1;

  orderedRoles.forEach((role) => {
    const bucket = grouped.get(role);
    if (!bucket) return;

    bucket.sort((a, b) => {
      if (a.modifiedTime && b.modifiedTime && a.modifiedTime !== b.modifiedTime) {
        return a.modifiedTime.localeCompare(b.modifiedTime);
      }
      return a.filename.localeCompare(b.filename);
    });

    bucket.forEach((file) => {
      output.push(
        ImageAssetSchema.parse({
          driveFileId: file.driveFileId,
          filename: file.filename,
          role,
          position: position++,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          modifiedTime: file.modifiedTime
        })
      );
    });
  });

  return output;
}
