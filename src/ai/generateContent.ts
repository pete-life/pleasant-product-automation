import { config } from '../env';
import { logger } from '../logger';
import { AIContentSchema, type AIContent, type SheetRow } from '../config/schemas';
import { withBackoff } from '../utils/backoff';
import { COLUMN_NAMES, METAFIELD_KEYS } from '../config/constants';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-4.1-mini';

const PROMPT = `You are a seasoned apparel copywriter. For each product, craft concise and engaging ecommerce copy in the brand's tone.
Provide a JSON object with this shape:
{
  "title": string,
  "descriptionHtml": string,
  "metaDescription": string,
  "tags": string[],
  "metafields"?: {
    "fabric"?: string,
    "color"?: string,
    "pattern"?: string,
    "target_gender"?: string,
    "age_group"?: string,
    "sleeve_length"?: string,
    "clothing_feature"?: string
  }
}
Respect existing non-empty fields when provided; only fill missing or explicitly cleared values.`;

function resolveMetafields(row: SheetRow) {
  const entries = METAFIELD_KEYS.map((key) => [key, row[key as keyof SheetRow]] as const)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value as string;
      return acc;
    }, {});

  return entries;
}

function buildUserContent(row: SheetRow): string {
  const payload = {
    productKey: row[COLUMN_NAMES.PRODUCT_KEY],
    sku: row[COLUMN_NAMES.SKU],
    vendor: row[COLUMN_NAMES.VENDOR],
    productType: row[COLUMN_NAMES.PRODUCT_TYPE],
    price: row[COLUMN_NAMES.PRICE],
    status: row[COLUMN_NAMES.STATUS],
    existing: {
      title: row[COLUMN_NAMES.TITLE],
      description: row[COLUMN_NAMES.DESCRIPTION],
      metaDescription: row[COLUMN_NAMES.META_DESCRIPTION],
      tags: row[COLUMN_NAMES.TAGS]
    },
    metafields: resolveMetafields(row)
  };

  return `Product data:\n\n${JSON.stringify(payload, null, 2)}`;
}

async function callOpenAI(row: SheetRow): Promise<AIContent> {
  const body = {
    model: OPENAI_MODEL,
    input: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: buildUserContent(row) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const payload = await response.json();
  const text = extractJsonText(payload);
  const parsed = JSON.parse(text);
  return AIContentSchema.parse(parsed);
}

function extractJsonText(payload: any): string {
  const output = payload?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        const textBlock = content.find((block: any) => block.type === 'output_text');
        if (typeof textBlock?.text === 'string') {
          return textBlock.text;
        }
      }
    }
  }
  if (typeof payload?.output_text === 'string') {
    return payload.output_text;
  }
  if (Array.isArray(payload?.choices)) {
    const text = payload.choices[0]?.message?.content;
    if (typeof text === 'string') {
      return text;
    }
  }
  throw new Error('Unexpected OpenAI response format');
}

export async function generateContentForRow(row: SheetRow): Promise<AIContent> {
  return withBackoff(() => callOpenAI(row), {
    retries: 2,
    onRetry: (error, attempt) => {
      logger.warn({ error, attempt }, 'Retrying OpenAI content generation');
    }
  });
}
