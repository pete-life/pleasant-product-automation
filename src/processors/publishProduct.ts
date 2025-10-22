import type { SheetRow, AIContent, ImageAsset } from '../config/schemas';
import { COLUMN_NAMES, STATUS } from '../config/constants';
import { generateContentForRow } from '../ai/generateContent';
import { buildShopifyInput } from './buildShopifyInput';
import { collectRowAssets } from './collectRowAssets';
import { shopifyRequest } from '../shopify/client';
import { PRODUCT_CREATE, VARIANTS_BULK_CREATE, METAFIELDS_SET, STAGED_UPLOADS_CREATE, PRODUCT_CREATE_MEDIA } from '../shopify/mutations';
import { readFileAsBase64, moveToArchive } from '../google/drive';
import { updateRowWithProductId, writeLogs, writeError } from '../google/sheets';
import { nowIso } from '../utils/dates';
import { logger } from '../logger';
import { config } from '../env';
import { resolveMetaobjectId } from '../shopify/metaobjects';
import type { ShopifyMetafieldInput } from '../shopify/helpers';
import { FormData, File, fetch } from 'undici';

interface ProductCreateResponse {
  productCreate: {
    product?: {
      id: string;
      legacyResourceId?: string;
      handle?: string;
      options?: Array<{ id: string; name: string }>;
      variants?: {
        nodes: Array<{
          id: string;
          title: string;
        }>;
      };
    };
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface VariantsBulkCreateResponse {
  productVariantsBulkCreate: {
    productVariants?: Array<{ id: string; title: string; sku?: string }>;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface MetafieldsSetResponse {
  metafieldsSet: {
    metafields?: Array<{ key: string; namespace: string; value: string }>;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface StagedUploadsCreateResponse {
  stagedUploadsCreate: {
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface ProductCreateMediaResponse {
  productCreateMedia: {
    media?: Array<{ id: string; alt?: string | null; status?: string | null }>;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

export interface PublishResult {
  success: boolean;
  productId?: string;
  error?: string;
}

function needsContentRegeneration(): boolean {
  return true;
}

function ensureNoUserErrors(operation: string, userErrors?: Array<{ message: string; field?: string[] | null }>) {
  if (!userErrors || userErrors.length === 0) return;
  const message = userErrors.map((error) => `${error.message}${error.field ? ` (${error.field.join('.')})` : ''}`).join('; ');
  throw new Error(`${operation} failed: ${message}`);
}

async function uploadImages(productId: string, assets: ImageAsset[], altText: string | undefined) {
  if (!assets.length) return;

  const files = await Promise.all(
    assets.map(async (asset, index) => {
      const { base64, mimeType } = await readFileAsBase64(asset.driveFileId);
      const buffer = Buffer.from(base64, 'base64');
      const filename = asset.filename ?? `image-${index + 1}.jpg`;
      return { asset, buffer, mimeType, filename };
    })
  );

  const stagedResponse = await shopifyRequest<StagedUploadsCreateResponse>({
    query: STAGED_UPLOADS_CREATE,
    variables: {
      input: files.map((file) => ({
        resource: 'IMAGE',
        filename: file.filename,
        mimeType: file.mimeType,
        httpMethod: 'POST',
        fileSize: file.buffer.byteLength.toString()
      }))
    }
  });

  ensureNoUserErrors('stagedUploadsCreate', stagedResponse.stagedUploadsCreate.userErrors);

  const targets = stagedResponse.stagedUploadsCreate.stagedTargets;
  if (targets.length !== files.length) {
    throw new Error(`Expected ${files.length} staged upload targets but received ${targets.length}`);
  }

  await Promise.all(
    files.map(async (file, index) => {
      const target = targets[index];
      if (!target) {
        throw new Error(`Missing staged upload target for file ${file.filename}`);
      }

      const form = new FormData();
      target.parameters.forEach((param) => form.append(param.name, param.value));
      const uploadFile = new File([file.buffer], file.filename, { type: file.mimeType });
      form.append('file', uploadFile);

      const uploadResponse = await fetch(target.url, {
        method: 'POST',
        body: form
      });

      if (!uploadResponse.ok) {
        const body = await uploadResponse.text().catch(() => '');
        throw new Error(
          `Failed to upload ${file.filename} to staged target: ${uploadResponse.status} ${uploadResponse.statusText}${body ? ` - ${body}` : ''}`
        );
      }
    })
  );

  const mediaInput = targets.map((target, index) => ({
    originalSource: target.resourceUrl,
    mediaContentType: 'IMAGE' as const,
    alt: altText ?? files[index].filename
  }));

    const mediaResult = await shopifyRequest<ProductCreateMediaResponse>({
      query: PRODUCT_CREATE_MEDIA,
      variables: {
        productId,
        media: mediaInput
    }
  });

  ensureNoUserErrors('productCreateMedia', mediaResult.productCreateMedia.userErrors);
}

async function setMetafields(productId: string, metafields: ShopifyMetafieldInput[]) {
  if (!metafields.length) return;
  const payload = metafields.map((metafield) => ({
    ownerId: productId,
    ...metafield
  }));

  const result = await shopifyRequest<MetafieldsSetResponse>({
    query: METAFIELDS_SET,
    variables: {
      metafields: payload
    }
  });

  ensureNoUserErrors('metafieldsSet', result.metafieldsSet.userErrors);
}

async function setVariantMetafields(entries: Array<ShopifyMetafieldInput & { ownerId: string }>) {
  if (!entries.length) return;
  const result = await shopifyRequest<MetafieldsSetResponse>({
    query: METAFIELDS_SET,
    variables: {
      metafields: entries
    }
  });

  ensureNoUserErrors('variant metafieldsSet', result.metafieldsSet.userErrors);
}

export async function publishProduct(row: SheetRow): Promise<PublishResult> {
  const productKey = (row[COLUMN_NAMES.PRODUCT_KEY] as string | undefined)?.trim();
  if (!productKey) {
    return { success: false, error: 'Missing ProductKey; cannot publish' };
  }

  const logEntries = [{
    timestamp: nowIso(),
    action: 'publish:start',
    productKey,
    message: 'Beginning Shopify publish'
  }];

  let aiContent: AIContent | undefined;

  try {
    if (needsContentRegeneration()) {
      logger.info({ productKey }, 'Generating AI content for row');
      aiContent = await generateContentForRow(row);
    }

    const build = buildShopifyInput(row, aiContent);
    const metafieldsResolved = await Promise.all(
      build.metafields.map(async (entry) => {
        if (entry.key === 'pattern' && entry.value && !entry.value.startsWith('gid://')) {
          const resolved = await resolveMetaobjectId('pattern', entry.value);
          if (resolved) {
            return { ...entry, value: resolved, type: 'metaobject_reference' };
          }
          logger.warn({ value: entry.value }, 'Unable to resolve pattern metaobject; skipping');
          return undefined;
        }
        return entry;
      })
    ).then((entries) => entries.filter((entry): entry is typeof build.metafields[number] => Boolean(entry)));

    build.metafields.splice(0, build.metafields.length, ...metafieldsResolved);
    const assets = await collectRowAssets(row);

    logEntries.push({
      timestamp: nowIso(),
      action: 'publish:shopify:create',
      productKey,
      message: `Sending productCreate with ${build.variants.length} variants`
    });

    const productCreateResult = await shopifyRequest<ProductCreateResponse>({
      query: PRODUCT_CREATE,
      variables: {
        input: build.productInput
      }
    });

    ensureNoUserErrors('productCreate', productCreateResult.productCreate.userErrors);

    const productId = productCreateResult.productCreate.product?.id;
    if (!productId) {
      throw new Error('Shopify productCreate did not return a product id');
    }

    if (build.variants.length) {
      logEntries.push({
        timestamp: nowIso(),
        action: 'publish:shopify:variants',
        productKey,
        message: `Creating ${build.variants.length} variants`
      });

      const expectsOptions = build.hasProductOptions;
      const optionIdByName = new Map<string, string>();
      if (expectsOptions) {
        productCreateResult.productCreate.product?.options?.forEach((option) => {
          if (option.name && option.id) {
            optionIdByName.set(option.name, option.id);
          }
        });
      }

      const variantsInput = build.variants.map((variant) => {
        const payload: Record<string, unknown> = {
          price: variant.price ?? build.price
        };

        if (expectsOptions) {
          payload.optionValues = variant.optionValues.map((option) => {
            const optionPayload: Record<string, unknown> = {
              name: option.value
            };
            const optionId = optionIdByName.get(option.name);
            if (optionId) {
              optionPayload.optionId = optionId;
            } else {
              optionPayload.optionName = option.name;
            }
            return optionPayload;
          });
        }

        if (variant.sku) {
          payload.inventoryItem = {
            sku: variant.sku
          };
        }

        if (typeof variant.inventoryQuantity === 'number') {
          payload.inventoryPolicy = 'DENY';
          payload.inventoryQuantities = [
            {
              locationId: config.shopify.locationId,
              availableQuantity: variant.inventoryQuantity
            }
          ];

          const inventoryItem = (payload.inventoryItem ??= {});
          (inventoryItem as Record<string, unknown>).tracked = true;
        }

        return payload;
      });

      const variantResult = await shopifyRequest<VariantsBulkCreateResponse>({
        query: VARIANTS_BULK_CREATE,
        variables: {
          productId,
          variants: variantsInput,
          strategy: 'REMOVE_STANDALONE_VARIANT'
        }
      });
      ensureNoUserErrors('productVariantsBulkCreate', variantResult.productVariantsBulkCreate.userErrors);

      const createdVariants = variantResult.productVariantsBulkCreate.productVariants ?? [];
      const variantMetafieldEntries = createdVariants.flatMap((variant, index) => {
        const fields = build.variantMetafields[index] ?? [];
        if (!variant?.id) return [];
        return fields.map((field) => ({ ...field, ownerId: variant.id }));
      });

      if (variantMetafieldEntries.length) {
        logEntries.push({
          timestamp: nowIso(),
          action: 'publish:shopify:variant-metafields',
          productKey,
          message: `Setting ${variantMetafieldEntries.length} variant metafields`
        });
        await setVariantMetafields(variantMetafieldEntries);
      }
    }

    if (assets.length) {
      logEntries.push({
        timestamp: nowIso(),
        action: 'publish:shopify:images',
        productKey,
        message: `Uploading ${assets.length} images`
      });
      await uploadImages(productId, assets, build.sheetUpdates[COLUMN_NAMES.TITLE]);
    }

    if (build.metafields.length) {
      logEntries.push({
        timestamp: nowIso(),
        action: 'publish:shopify:metafields',
        productKey,
        message: `Setting ${build.metafields.length} metafields`
      });
      await setMetafields(productId, build.metafields);
    }

    const sheetUpdates = {
      ...build.sheetUpdates,
      [COLUMN_NAMES.STATUS]: STATUS.COMPLETE
    };

    await updateRowWithProductId(row, productId, sheetUpdates);

    if (assets.length) {
      await Promise.all(
        assets.map(async (asset) => {
          try {
            await moveToArchive(asset.driveFileId);
          } catch (error) {
            logger.warn({ error, fileId: asset.driveFileId }, 'Failed to archive Drive image');
          }
        })
      );
    }

    logEntries.push({
      timestamp: nowIso(),
      action: 'publish:complete',
      productKey,
      message: `Published product ${productId}`
    });

    await writeLogs(logEntries);

    return { success: true, productId };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const message = failure.message;
    logger.error({ err: failure, productKey, errorMessage: message }, 'Failed to publish product');

    await writeLogs([
      ...logEntries,
      {
        timestamp: nowIso(),
        action: 'publish:error',
        productKey,
        message
      }
    ]);

    await writeError({
      timestamp: nowIso(),
      productKey,
      step: 'publishProduct',
      message,
      hint: 'Check Shopify admin and Drive files for partial progress',
      payloadSnippet: JSON.stringify({ sheetRow: productKey }).slice(0, 500)
    });

    return { success: false, error: message };
  }
}
