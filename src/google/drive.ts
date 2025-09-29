import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { config } from '../env';
import { logger } from '../logger';
import { getDriveClient } from './auth';
import { withBackoff } from '../utils/backoff';
import { nowIso } from '../utils/dates';
import { setConfigKey, getConfigKey } from './sheets';
import { assignDeterministicPositions, parseFilename, type RawImageFile } from '../processors/mapFilenames';
import type { ImageAsset } from '../config/schemas';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function renewFolderWatch(): Promise<void> {
  const drive = await getDriveClient();
  const previousChannelId = await getConfigKey('DRIVE_CHANNEL_ID');
  const previousResourceId = await getConfigKey('DRIVE_RESOURCE_ID');

  if (previousChannelId && previousResourceId) {
    try {
      await withBackoff(() =>
        drive.channels.stop({
          requestBody: {
            id: previousChannelId,
            resourceId: previousResourceId
          }
        })
      );
      logger.info({ previousChannelId }, 'Stopped previous Drive channel');
    } catch (error) {
      logger.warn({ error }, 'Failed to stop previous Drive channel');
    }
  }

  const startPageTokenResponse = await withBackoff(() =>
    drive.changes.getStartPageToken({ supportsAllDrives: true })
  );
  const startPageToken = startPageTokenResponse.data.startPageToken;
  if (!startPageToken) {
    throw new Error('Unable to retrieve Drive start page token');
  }

  const channelId = randomUUID();
  const address = new URL('/webhooks/drive', config.appBaseUrl).toString();
  const watchResponse = await withBackoff(() =>
    drive.changes.watch({
      pageToken: startPageToken,
      includeRemoved: false,
      supportsAllDrives: true,
      restrictToMyDrive: true,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address,
        token: config.google.driveFolderId
      }
    })
  );

  const resourceId = watchResponse.data.resourceId;
  const expiration = watchResponse.data.expiration ?? '';

  await Promise.all([
    setConfigKey('DRIVE_CHANNEL_ID', channelId),
    resourceId ? setConfigKey('DRIVE_RESOURCE_ID', resourceId) : Promise.resolve(),
    setConfigKey('DRIVE_CHANNEL_EXPIRATION', expiration),
    setConfigKey('DRIVE_START_PAGE_TOKEN', startPageToken),
    setConfigKey('DRIVE_LATEST_PAGE_TOKEN', startPageToken)
  ]);

  logger.info({ channelId, resourceId, startPageToken }, 'Drive folder watch renewed');
}

export async function listProductImageFiles(productKey: string): Promise<RawImageFile[]> {
  const drive = await getDriveClient();
  const sanitizedKey = productKey.trim();
  if (!sanitizedKey) return [];

  const files: RawImageFile[] = [];
  let pageToken: string | undefined;

  const folderId = config.google.driveFolderId;
  const query = `('${folderId}' in parents) and trashed = false`;
  const matchKey = sanitizedKey.toLowerCase();

  do {
    const response = await withBackoff(() =>
      drive.files.list({
        q: query,
        pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
        spaces: 'drive',
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      })
    );

    const pageFiles = response.data.files ?? [];
    pageFiles.forEach((file) => {
      if (!file.id || !file.name) return;
      const parsed = parseFilename(file.name);
      if (!parsed || parsed.productKey.toLowerCase() !== matchKey) return;
      files.push({
        driveFileId: file.id,
        filename: file.name,
        mimeType: file.mimeType ?? undefined,
        sizeBytes: file.size ? Number(file.size) : undefined,
        modifiedTime: file.modifiedTime ?? undefined
      });
    });

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function listProductImages(productKey: string): Promise<ImageAsset[]> {
  const files = await listProductImageFiles(productKey);
  return assignDeterministicPositions(files);
}

export async function readFileAsBase64(fileId: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  const drive = await getDriveClient();
  const response = await withBackoff(() =>
    drive.files.get({
      fileId,
      alt: 'media'
    }, { responseType: 'stream' })
  );

  const mimeType = (response.headers?.['content-type'] ?? 'application/octet-stream') as string;
  const buffer = await streamToBuffer(response.data as Readable);
  return { base64: buffer.toString('base64'), mimeType };
}

export async function moveToArchive(fileId: string): Promise<void> {
  const drive = await getDriveClient();

  const metadata = await withBackoff(() =>
    drive.files.get({
      fileId,
      fields: 'parents',
      supportsAllDrives: true
    })
  );
  const parents = metadata.data.parents ?? [];
  if (!parents.length) {
    logger.warn({ fileId }, 'Drive file has no parents; skipping archive move');
    return;
  }

  await withBackoff(() =>
    drive.files.update({
      fileId,
      addParents: config.google.driveArchiveFolderId,
      removeParents: parents.join(','),
      fields: 'id, parents',
      supportsAllDrives: true
    })
  );

  logger.info({ fileId }, 'Moved Drive file to archive');
}

export async function markLatestPageToken(pageToken: string): Promise<void> {
  await setConfigKey('DRIVE_LATEST_PAGE_TOKEN', pageToken);
}

export async function refreshLatestPageToken(): Promise<string | undefined> {
  return getConfigKey('DRIVE_LATEST_PAGE_TOKEN');
}

export function buildDriveNotificationLog(headers: Record<string, string | string[] | undefined>) {
  return {
    channelId: headers['x-goog-channel-id'],
    messageNumber: headers['x-goog-message-number'],
    resourceState: headers['x-goog-resource-state'],
    resourceId: headers['x-goog-resource-id'],
    resourceUri: headers['x-goog-resource-uri'],
    receivedAt: nowIso()
  };
}
