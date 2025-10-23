export const PRICE_MAP: Record<string, string> = {
  cap: '399',
  'short sleeve shirt': '649',
  't-shirt': '349',
  'long sleeve shirt': '699',
  'longsleeve shirt': '699',
  'bali shirt': '499',
  'kids shirt': '299',
  sweatshirt: '649',
  hoodie: '649',
  jacket: '1199'
};

export interface GpcMapping {
  segment: string;
  family: string;
  class: string;
  brick: string;
  segmentName: string;
  familyName: string;
  className: string;
  brickName: string;
  taxonomyCategoryId: string;
}

const GPC_MAP: Record<string, GpcMapping> = {
  cap: {
    segment: '67000000',
    family: '67010000',
    class: '67010100',
    brick: '10001329',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Clothing Accessories',
    brickName: 'Headwear',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-2-17-1'
  },
  't-shirt': {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001352',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Shirts/Blouses/Polo Shirts/T-shirts',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-13-8'
  },
  'short sleeve shirt': {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001352',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Shirts/Blouses/Polo Shirts/T-shirts',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-13-7'
  },
  'long sleeve shirt': {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001352',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Shirts/Blouses/Polo Shirts/T-shirts',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-13-7'
  },
  'bali shirt': {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001352',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Shirts/Blouses/Polo Shirts/T-shirts',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-13-7'
  },
  hoodie: {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001351',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Sweaters/Pullovers',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-13-13'
  },
  sweatshirt: {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001351',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Sweaters/Pullovers',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-13-14'
  },
  jacket: {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001350',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Jackets/Blazers/Cardigans/Waistcoats',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-10-2'
  },
  'kids shirt': {
    segment: '67000000',
    family: '67010000',
    class: '67010800',
    brick: '10001352',
    segmentName: 'Clothing',
    familyName: 'Clothing',
    className: 'Upper Body Wear/Tops',
    brickName: 'Shirts/Blouses/Polo Shirts/T-shirts',
    taxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1-2-9-6'
  }
};

export function determinePrice(style: string | undefined): string {
  if (!style) return '499';
  const normalized = style.toLowerCase();
  for (const [key, price] of Object.entries(PRICE_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return price;
    }
  }
  return '499';
}

export function determineGpc(
  style: string | undefined,
  category: string | undefined
): GpcMapping & { code: string; description: string } {
  const normalizedStyle = (style ?? '').toLowerCase();
  let mapping = GPC_MAP[normalizedStyle];
  if (!mapping) {
    for (const [key, value] of Object.entries(GPC_MAP)) {
      if (normalizedStyle.includes(key) || key.includes(normalizedStyle)) {
        mapping = value;
        break;
      }
    }
  }

  if (!mapping) {
    const normalizedCategory = (category ?? '').toLowerCase();
    if (normalizedCategory.includes('tilbehør') || normalizedCategory.includes('accessories')) {
      mapping = GPC_MAP['cap'];
    } else {
      mapping = GPC_MAP['t-shirt'];
    }
  }

  const code = `${mapping.segment}-${mapping.family}-${mapping.class}-${mapping.brick}`;
  const description = `${mapping.segmentName} > ${mapping.familyName} > ${mapping.className} > ${mapping.brickName}`;

  return {
    ...mapping,
    code,
    description
  };
}
