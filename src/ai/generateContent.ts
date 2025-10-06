import { config } from '../env';
import { logger } from '../logger';
import { withBackoff } from '../utils/backoff';
import { COLUMN_NAMES, METAFIELD_COLUMN_MAP } from '../config/constants';
import { AIContentSchema, type AIContent, type SheetRow } from '../config/schemas';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-5';

const PROMPT = `You are an SEO expert and e-commerce specialist for Pleasant, a Danish upcycled fashion brand. Analyze the supplied product image and generate consistent Danish content that keeps title, description, meta-description, and tags perfectly aligned. Follow every requirement exactly and return ONLY valid JSON (no markdown).`;

const DETAILED_INSTRUCTIONS = `Analyze this product image and generate SEO-optimized Danish e-commerce content following these EXACT requirements:

TITLE FORMAT (maks 60 tegn for SEO):
- Brug: Engelsk adjektiv + farve + "upcycled" + style
- Eksempler: "Smooth yellow upcycled cap", "Classic red upcycled jacket"
- Skal matche billedets indhold PRÆCIST

STYLE (vælg én baseret på billedet):
Tøj: T-shirt, Short sleeve shirt, Long sleeve shirt, Bali shirt, Hoodie, Jacket
Accessories: Cap

COLOR (vælg én primærfarve på dansk):
Beige, Blå, Bronze, Brun, Flerfarvet, Grå, Grøn, Gul, Guld, Hvid, Lilla, Marineblå, Orange, Pink, Rosa, Rød, Sort

PATTERN (vælg ét mønster på dansk):
Abstrakt, Blomstret, Cartoon, Dyreprint, Fotoprint, Geometrisk, Musik, Solid, Sport, Stribet, Ternet

PRODUKTBESKRIVELSE (HTML til Shopify):
1. Åbningsafsnit: '<p>Pleasant upcycled [style] – ny [style] af brugt tekstil.</p>'
2. Produktdetaljer: '<p>Beskriv det upcyclede tekstil, pasform og features baseret på billedet.</p>'
3. Inkludér ALTID: '<p>Fordele ved at vælge denne [style] vs [style] af nyt tekstil:</p><ul><li>Minimér CO2-aftrykket i din garderobe.</li><li>Undgå store mængder vand og kemikalier i dit tøjforbrug.</li><li>Støt en fremtid med mindre behov for nyt tekstil.</li><li>Bidrag til en positiv forandring i tøjbranchen.</li></ul>'
4. Notér unikhed: '<p>Vær opmærksom på, at hver [style] er unik og kan variere en smule fra billederne.</p>'
5. Produktionssted: '<p>Produceret i Europa</p>' (for caps) eller '<p>Produceret i Filippinerne</p>' (for shirts/jakker)
6. Afslut ALTID med: '<p>Et slow fashion alternativ til fast fashion.</p>'

META-DESCRIPTION (150-160 tegn til Google):
- Sammendrag der matcher titel og hovedbeskrivelse
- Inkludér: Pleasant upcycled + style + farve + "brugt tekstil" + vigtigste fordel
- Eksempel: 'Pleasant upcycled rød jakke af brugt tekstil. Miljøvenlig mode der reducerer CO2-aftryk. Produceret bæredygtigt.'

METAFIELDS for SEO:
- fabric: 'Upcycled' (altid)
- color: Den valgte danske farve
- pattern: Det valgte mønster
- target_gender: 'Unisex' (standard) eller specifik hvis tydeligt
- age_group: 'Adults' (standard)
- sleeve_length: For tøj – 'Lang', 'Kort', 'Ingen' (ærmeløs) eller 'Tre kvart'. Accessories skal bruge tom streng
- clothing_feature: Features som 'Hætte', 'Lomme', 'Lynlås', 'Knapper' eller tom hvis ingen

TAGS (10-15 relevante danske SEO-tags):
- Inkludér altid: upcycled, Pleasant, bæredygtig, slow fashion
- Tilføj: specifik style, farve, mønster samt SEO-termer som 'miljøvenlig tøj', 'genbrugt tekstil', 'dansk design'

CATEGORY:
- 'Tøj' for shirts, hoodies, jackets
- 'Tilbehør' for caps

JSON-SVAR SKAL INDEHOLDE:
{
  "title": string,
  "description": string (HTML som beskrevet),
  "meta_description": string,
  "tags": string[],
  "category": 'Tøj' eller 'Tilbehør',
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

Returnér KUN gyldig JSON uden ekstra tekst eller markdown. Alle felter er obligatoriske og skal være på dansk. Hvis billedet ikke gør et svar muligt, returnér en klar fejl i feltet meta_description for at synliggøre problemet.`;

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

  return `${DETAILED_INSTRUCTIONS}\n\nEksisterende sheet-data (kun til reference):\n${JSON.stringify(payload, null, 2)}`;
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
