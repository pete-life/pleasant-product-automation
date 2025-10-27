import { config } from '../env';
import { logger } from '../logger';
import { withBackoff } from '../utils/backoff';
import { COLUMN_NAMES, METAFIELD_COLUMN_MAP } from '../config/constants';
import { AIContentSchema, type AIContent, type SheetRow } from '../config/schemas';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-5';

const PROMPT = `You are an SEO expert and e-commerce specialist for Pleasant, a Danish upcycled fashion brand. You MUST produce all customer-facing output in Danish unless a requirement explicitly calls for another language. Analyze the supplied product image and generate consistent Danish content that keeps title, description, meta-description, and tags perfectly aligned. Follow every requirement exactly and return ONLY valid JSON (no markdown).`;

const DETAILED_INSTRUCTIONS = `Analyze this product image and generate SEO-optimized Danish e-commerce content while following these EXACT rules. The model must output Danish for every customer-facing string (title, description, meta description, tags, colors, patterns, categories, metafields) unless a rule specifically requests otherwise:

TITLE FORMAT (max 60 characters for SEO):
- Use: English adjective + Danish color + "upcycled" + style
- Examples: "Smooth yellow upcycled cap", "Classic red upcycled jacket"
- The title must match the image content precisely

STYLE (choose one based on the image):
Apparel: T-shirt, Short sleeve shirt, Long sleeve shirt, Bali shirt, Hoodie, Jacket
Accessories: Cap

COLOR (choose one Danish primary color):
Beige, Blå, Bronze, Brun, Flerfarvet, Grå, Grøn, Gul, Guld, Hvid, Lilla, Marineblå, Orange, Pink, Rosa, Rød, Sort

PATTERN (choose one Danish pattern):
Abstrakt, Blomstret, Cartoon, Dyreprint, Fotoprint, Geometrisk, Musik, Solid, Sport, Stribet, Ternet

PRODUCT DESCRIPTION (HTML for Shopify):
1. Opening paragraph: '<p>Pleasant upcycled [style] – ny [style] af brugt tekstil.</p>'
2. Product details: '<p>Beskriv det upcyclede tekstil, pasform og features baseret på billedet.</p>'
3. Always include: '<p>Fordele ved at vælge denne [style] vs [style] af nyt tekstil:</p><ul><li>Minimér CO2-aftrykket i din garderobe.</li><li>Undgå store mængder vand og kemikalier i dit tøjforbrug.</li><li>Støt en fremtid med mindre behov for nyt tekstil.</li><li>Bidrag til en positiv forandring i tøjbranchen.</li></ul>'
4. Note uniqueness: '<p>Vær opmærksom på, at hver [style] er unik og kan variere en smule fra billederne.</p>'
5. Production location: '<p>Produceret i Europa</p>' (for caps) or '<p>Produceret i Filippinerne</p>' (for shirts/jakker)
6. Always end with: '<p>Et slow fashion alternativ til fast fashion.</p>'

META DESCRIPTION (150-160 characters for Google):
- Provide a summary that matches the title and main description
- Include: Pleasant upcycled + style + color + "brugt tekstil" + primary benefit
- Example: 'Pleasant upcycled rød jakke af brugt tekstil. Miljøvenlig mode der reducerer CO2-aftryk. Produceret bæredygtigt.'

METAFIELDS for SEO:
- fabric: 'Upcycled' (always)
- color: The selected Danish color
- pattern: The selected Danish pattern
- target_gender: 'Unisex' (default) or a specific value if obvious
- age_group: 'Adults' (default)
- sleeve_length: For apparel use 'Lang', 'Kort', 'Ingen' (ærmeløs) or 'Tre kvart'. Accessories must use an empty string
- clothing_feature: Features such as 'Hætte', 'Lomme', 'Lynlås', 'Knapper', or empty if none

TAGS (10-15 relevant Danish SEO tags):
- Always include: upcycled, Pleasant, bæredygtig, slow fashion
- Add the specific style, color, pattern, and SEO terms like 'miljøvenlig tøj', 'genbrugt tekstil', 'dansk design'

CATEGORY:
- 'Tøj' for shirts, hoodies, jackets
- 'Tilbehør' for caps

JSON RESPONSE MUST INCLUDE:
{
  "title": string,
  "description": string (HTML as described),
  "meta_description": string,
  "tags": string[],
  "category": 'Tøj' or 'Tilbehør',
  "style": string,
  "color": string,
  "pattern": string,
  "vendor": 'Pleasant',
  "metafields": {
    "fabric": 'Upcycled',
    "color": string,
    "pattern": string,
    "target_gender": string,
    "age_group": string,
    "sleeve_length": string,
    "clothing_feature": string
  }
}

Return ONLY valid JSON without additional text or markdown. All fields must be written in Danish. If the image does not allow a valid response, return a clear error message in the meta_description field to highlight the issue.`;

function resolveMetafields(row: SheetRow) {
  return Object.entries(METAFIELD_COLUMN_MAP)
    .map(([column, key]) => [key, row[column as keyof SheetRow]] as const)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = (value as string).trim();
      return acc;
    }, {});
}

function buildUserContent(row: SheetRow): string {
  const payload = {
    productKey: row[COLUMN_NAMES.PRODUCT_KEY],
    sku: row[COLUMN_NAMES.SKU],
    price: row[COLUMN_NAMES.PRICE],
    existingTitle: row[COLUMN_NAMES.TITLE],
    existingDescription: row[COLUMN_NAMES.DESCRIPTION],
    existingMetaDescription: row[COLUMN_NAMES.META_DESCRIPTION],
    existingTags: row[COLUMN_NAMES.TAGS],
    sheetStyle: row[COLUMN_NAMES.STYLE],
    sheetColor: row[COLUMN_NAMES.COLOR],
    sheetPattern: row[COLUMN_NAMES.PATTERN],
    sheetCategory: row[COLUMN_NAMES.CATEGORY],
    sheetMetafields: resolveMetafields(row)
  };

  return `${DETAILED_INSTRUCTIONS}\n\nExisting sheet data (reference only, keep Danish output requirements in mind):\n${JSON.stringify(payload, null, 2)}`;
}

interface GenerateOptions {
  primaryImage?: { base64: string; mimeType: string };
}

async function callOpenAI(row: SheetRow, options?: GenerateOptions): Promise<AIContent> {
  const body = {
    model: OPENAI_MODEL,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: PROMPT }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: buildUserContent(row) },
          ...(options?.primaryImage
            ? [
                {
                  type: 'input_image',
                  image_url: `data:${options.primaryImage.mimeType};base64,${options.primaryImage.base64}`
                }
              ]
            : [])
        ]
      }
    ],
    reasoning: { effort: 'low' },
    text: {
      verbosity: 'low',
      format: { type: 'json_object' }
    },
    max_output_tokens: 2000,
    temperature: 1
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

export async function generateContentForRow(row: SheetRow, options?: GenerateOptions): Promise<AIContent> {
  return withBackoff(() => callOpenAI(row, options), {
    retries: 2,
    onRetry: (error, attempt) => {
      logger.warn({ error, attempt }, 'Retrying OpenAI content generation');
    }
  });
}
