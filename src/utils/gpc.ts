import { COLUMN_NAMES } from '../config/constants';

export interface GpcProfile {
  code: string;
  description: string;
  segmentId: string;
  segmentName: string;
  familyId: string;
  familyName: string;
  classId: string;
  className: string;
  brickId: string;
  brickName: string;
  googleCategory?: string;
  structuredData?: string;
  attributes: Record<string, string>;
}

interface DeriveOptions {
  style: string;
  targetGender?: string;
  ageGroup?: string;
  sleeveLength?: string;
  clothingFeature?: string;
}

const BASE_PROFILES: Record<string, Omit<GpcProfile, 'description' | 'attributes'>> = {
  cap: {
    code: '67000000-67010000-67010100-10001329',
    segmentId: '67000000',
    segmentName: 'Clothing',
    familyId: '67010000',
    familyName: 'Clothing',
    classId: '67010100',
    className: 'Clothing Accessories',
    brickId: '10001329',
    brickName: 'Headwear',
    googleCategory: 'Apparel & Accessories > Clothing Accessories > Hats',
    structuredData: undefined
  },
  shirt: {
    code: '67000000-67010000-67010800-10001352',
    segmentId: '67000000',
    segmentName: 'Clothing',
    familyId: '67010000',
    familyName: 'Clothing',
    classId: '67010800',
    className: 'Upper Body Wear/Tops',
    brickId: '10001352',
    brickName: 'Shirts/Blouses/Polo Shirts/T-shirts',
    googleCategory: 'Apparel & Accessories > Clothing > Shirts & Tops',
    structuredData: undefined
  },
  sweater: {
    code: '67000000-67010000-67010800-10001351',
    segmentId: '67000000',
    segmentName: 'Clothing',
    familyId: '67010000',
    familyName: 'Clothing',
    classId: '67010800',
    className: 'Upper Body Wear/Tops',
    brickId: '10001351',
    brickName: 'Sweaters/Pullovers',
    googleCategory: 'Apparel & Accessories > Clothing > Shirts & Tops',
    structuredData: undefined
  },
  jacket: {
    code: '67000000-67010000-67010800-10001350',
    segmentId: '67000000',
    segmentName: 'Clothing',
    familyId: '67010000',
    familyName: 'Clothing',
    classId: '67010800',
    className: 'Upper Body Wear/Tops',
    brickId: '10001350',
    brickName: 'Jackets/Blazers/Cardigans/Waistcoats',
    googleCategory: 'Apparel & Accessories > Clothing > Outerwear',
    structuredData: undefined
  }
};

const GENDER_MAP: Array<{ includes: string[]; value: string }> = [
  { includes: ['unisex'], value: '30004340' },
  { includes: ['male', 'mand', 'herre'], value: '30004039' },
  { includes: ['female', 'kvinde', 'dame'], value: '30003891' }
];

const AGE_MAP: Array<{ includes: string[]; value: string }> = [
  { includes: ['adult', 'voksen', 'voksne'], value: '30000147' },
  { includes: ['all ages', 'alle'], value: '30000164' },
  { includes: ['baby', 'infant'], value: '30006665' },
  { includes: ['child', 'børn', 'barn'], value: '30000628' }
];

function normalize(input?: string): string {
  return (input ?? '').trim().toLowerCase();
}

function resolveGenderCode(targetGender?: string): string {
  const normalized = normalize(targetGender);
  const matched = GENDER_MAP.find((entry) => entry.includes.some((token) => normalized.includes(token)));
  return matched?.value ?? '30004340';
}

function resolveAgeCode(ageGroup?: string): string {
  const normalized = normalize(ageGroup);
  const matched = AGE_MAP.find((entry) => entry.includes.some((token) => normalized.includes(token)));
  return matched?.value ?? '30000147';
}

function resolveSleeveLengthCode(sleeveLength?: string): string | undefined {
  const normalized = normalize(sleeveLength);
  if (!normalized) return undefined;
  if (['lang', 'long', 'lange', 'long sleeve', 'fuld', 'full'].some((token) => normalized.includes(token))) {
    return '30010303';
  }
  if (['kort', 'short'].some((token) => normalized.includes(token))) {
    return '30010304';
  }
  if (['ingen', 'none', 'ærmeløs', 'aarm', 'no sleeve', 'sleeveless'].some((token) => normalized.includes(token))) {
    return '30010302';
  }
  if (['tre kvart', '3/4', 'three quarter'].some((token) => normalized.includes(token))) {
    return '30010305';
  }
  return '30002515';
}

function descriptionFor(profile: Omit<GpcProfile, 'description' | 'attributes'>) {
  return [profile.segmentName, profile.familyName, profile.className, profile.brickName].join(' > ');
}

function resolveShirtType(style: string): string {
  const normalized = normalize(style);
  if (normalized.includes('t-shirt')) {
    return '30010301';
  }
  if (normalized.includes('polo')) {
    return '30010300';
  }
  return '30010298';
}

function resolveSweaterType(style: string): string {
  return '30010306';
}

function resolveJacketType(style: string): string {
  const normalized = normalize(style);
  if (normalized.includes('bomber')) {
    return '30017159';
  }
  if (normalized.includes('parka')) {
    return '30017160';
  }
  if (normalized.includes('cardigan')) {
    return '30010290';
  }
  if (normalized.includes('vest') || normalized.includes('waistcoat')) {
    return '30010291';
  }
  if (normalized.includes('poncho')) {
    return '30017161';
  }
  return '30010288';
}

function resolveMaterialCode(): string {
  return '30000720';
}

function resolveHoodedCode(clothingFeature?: string): string | undefined {
  const normalized = normalize(clothingFeature);
  if (!normalized) return undefined;
  if (['hætte', 'hood', 'hooded'].some((token) => normalized.includes(token))) {
    return '30002654';
  }
  return '30002960';
}

function buildAttributes(profileKey: string, options: DeriveOptions): Record<string, string> {
  const attributes: Record<string, string> = {
    '20000045': resolveAgeCode(options.ageGroup),
    '20001131': resolveGenderCode(options.targetGender)
  };

  if (profileKey === 'cap') {
    attributes['20001947'] = '30010323';
    return attributes;
  }

  const sleeveCode = resolveSleeveLengthCode(options.sleeveLength);
  if (sleeveCode) {
    attributes['20001941'] = sleeveCode;
  }

  attributes['20000794'] = resolveMaterialCode();

  switch (profileKey) {
    case 'shirt': {
      attributes['20001940'] = resolveShirtType(options.style);
      break;
    }
    case 'sweater': {
      attributes['20001942'] = resolveSweaterType(options.style);
      {
        const hooded = resolveHoodedCode(options.clothingFeature);
        if (hooded) {
          attributes['20003164'] = hooded;
        }
      }
      break;
    }
    case 'jacket': {
      attributes['20001938'] = resolveJacketType(options.style);
      {
        const hooded = resolveHoodedCode(options.clothingFeature);
        if (hooded) {
          attributes['20003164'] = hooded;
        }
      }
      break;
    }
    default:
      break;
  }

  return attributes;
}

function normalizeStyle(style: string): string {
  const normalized = normalize(style);
  if (!normalized) return '';
  if (normalized.includes('cap')) return 'cap';
  if (normalized.includes('hoodie')) return 'sweater';
  if (normalized.includes('sweater') || normalized.includes('pullover')) return 'sweater';
  if (normalized.includes('jacket') || normalized.includes('coat') || normalized.includes('blazer')) {
    return 'jacket';
  }
  return 'shirt';
}

export function deriveGpcProfile(options: DeriveOptions): GpcProfile | undefined {
  const profileKey = normalizeStyle(options.style);
  const base = BASE_PROFILES[profileKey];
  if (!base) return undefined;

  const attributes = buildAttributes(profileKey, options);

  return {
    ...base,
    description: descriptionFor(base),
    attributes
  };
}

export function gpcProfileToColumnUpdates(profile: GpcProfile) {
  return {
    [COLUMN_NAMES.GPC_CODE]: profile.code,
    [COLUMN_NAMES.GPC_ATTRIBUTES]: formatAttributes(profile.attributes),
    [COLUMN_NAMES.GOOGLE_PRODUCT_CATEGORY]: profile.googleCategory,
    [COLUMN_NAMES.STRUCTURED_DATA]: profile.structuredData,
    [COLUMN_NAMES.GPC_DESCRIPTION]: profile.description,
    [COLUMN_NAMES.GPC_SEGMENT]: profile.segmentId,
    [COLUMN_NAMES.GPC_SEGMENT_NAME]: profile.segmentName,
    [COLUMN_NAMES.GPC_FAMILY]: profile.familyId,
    [COLUMN_NAMES.GPC_FAMILY_NAME]: profile.familyName,
    [COLUMN_NAMES.GPC_CLASS]: profile.classId,
    [COLUMN_NAMES.GPC_CLASS_NAME]: profile.className,
    [COLUMN_NAMES.GPC_BRICK]: profile.brickId,
    [COLUMN_NAMES.GPC_BRICK_NAME]: profile.brickName
  } as Record<string, string | undefined>;
}

function formatAttributes(attributes: Record<string, string>) {
  const entries = Object.entries(attributes)
    .filter(([, value]) => Boolean(value))
    .map(([attributeId, valueId]) => `${attributeId}=${valueId}`);
  return entries.length ? entries.join(';') : undefined;
}

export function gpcProfileToMetafields(profile: GpcProfile) {
  return {
    gpc_code: profile.code,
    gpc_attributes: formatAttributes(profile.attributes),
    google_product_category: profile.googleCategory,
    structured_data: profile.structuredData,
    gpc_description: profile.description,
    gpc_segment: profile.segmentId,
    gpc_segment_name: profile.segmentName,
    gpc_family: profile.familyId,
    gpc_family_name: profile.familyName,
    gpc_class: profile.classId,
    gpc_class_name: profile.className,
    gpc_brick: profile.brickId,
    gpc_brick_name: profile.brickName
  } as Record<string, string | undefined>;
}
