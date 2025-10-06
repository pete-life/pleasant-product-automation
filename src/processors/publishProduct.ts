import type { SheetRow, AIContent, ImageAsset } from '../config/schemas';
import { COLUMN_NAMES, STATUS } from '../config/constants';
import { generateContentForRow } from '../ai/generateContent';
import { buildShopifyInput } from './buildShopifyInput';
import { collectRowAssets } from './collectRowAssets';
import { shopifyRequest } from '../shopify/client';
import { PRODUCT_CREATE, VARIANTS_BULK_CREATE, PRODUCT_IMAGE_CREATE, METAFIELDS_SET } from '../shopify/mutations';
import { readFileAsBase64, moveToArchive } from '../google/drive';
import { updateRowWithProductId, writeLogs, writeError } from '../google/sheets';
import { nowIso } from '../utils/dates';
import { logger } from '../logger';
import { config } from '../env';

interface ProductCreateResponse {
  productCreate: {
    product?: { id: string; legacyResourceId?: string; handle?: string };
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface VariantsBulkCreateResponse {
  productVariantsBulkCreate: {
    productVariants?: Array<{ id: string; title: string; sku?: string }>;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface ProductImageCreateResponse {
  productImageCreate: {
    image?: { id: string; url?: string; altText?: string };
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
}

interface MetafieldsSetResponse {
  metafieldsSet: {
    metafields?: Array<{ key: string; namespace: string; value: string }>;
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
  for (const asset of assets) {
    const { base64, mimeType } = await readFileAsBase64(asset.driveFileId);
    const attachment = `data:${mimeType};base64,${base64}`;

    const result = await shopifyRequest<ProductImageCreateResponse>({
      query: PRODUCT_IMAGE_CREATE,
      variables: {
        productId,
        image: {
          attachment,
          altText: altText ?? undefined,
          filename: asset.filename,
          position: asset.position
        }
      }
    });

    ensureNoUserErrors('productImageCreate', result.productImageCreate.userErrors);
  }
}

async function setMetafields(productId: string, metafields: Array<Record<string, unknown>>) {
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

      const variantsInput = build.variants.map((variant) => {
        const payload: Record<string, unknown> = {
          title: variant.title,
          price: variant.price ?? build.price,
          sku: variant.sku,
          options: variant.optionValues.map((option) => option.value)
        };

        if (typeof variant.inventoryQuantity === 'number') {
          payload.inventoryManagement = 'SHOPIFY';
          payload.inventoryPolicy = 'DENY';
          payload.inventoryQuantities = [
            {
              locationId: config.shopify.locationId,
              availableQuantity: variant.inventoryQuantity
            }
          ];
        }

        return payload;
      });

      const variantResult = await shopifyRequest<VariantsBulkCreateResponse>({
        query: VARIANTS_BULK_CREATE,
        variables: {
          productId,
          variants: variantsInput
        }
      });
      ensureNoUserErrors('productVariantsBulkCreate', variantResult.productVariantsBulkCreate.userErrors);
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error, productKey }, 'Failed to publish product');

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
