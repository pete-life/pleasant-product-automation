const PATTERN_HANDLE_MAP: Record<string, string> = {
  solid: 'solid',
  'solid color': 'solid',
  'solid colour': 'solid',
  'plain': 'solid',
  striped: 'striped',
  stribet: 'striped',
  'tie dye': 'tie-dye',
  'tie-dye': 'tie-dye',
  'tie dye pattern': 'tie-dye',
  geometric: 'geometric',
  'geo': 'geometric',
  floral: 'floral',
  flower: 'floral',
  camouflage: 'camouflage',
  camo: 'camouflage',
  'animal print': 'animalprint',
  'animal-print': 'animalprint',
  animalprint: 'animalprint',
  'photo print': 'fotoprint',
  'photo-print': 'fotoprint',
  photographic: 'fotoprint',
  fotoprint: 'fotoprint',
  marl: 'marl',
  marled: 'marl',
  dotted: 'dotted',
  'polka dot': 'dotted',
  'polka-dot': 'dotted',
  'polka dot pattern': 'dotted',
  checked: 'checked',
  checkered: 'checked',
  tartan: 'checked',
  cartoon: 'cartoon',
  graphic: 'cartoon',
  xmas: 'xmas',
  christmas: 'xmas',
  festive: 'xmas',
  abstract: 'abstrakt',
  abstrakt: 'abstrakt',
  sport: 'sport',
  sporty: 'sport',
  musik: 'musik',
  music: 'musik',
  musical: 'musik',
  surfing: 'surfing',
  surf: 'surfing',
  natur: 'natur',
  nature: 'natur',
  natural: 'natur'
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ') // collapse spaces
    .trim();
}

export function mapPatternToHandle(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = normalize(value);
  if (!normalized) return undefined;
  return PATTERN_HANDLE_MAP[normalized] ?? PATTERN_HANDLE_MAP[normalized.replace(/\s+/g, '-')];
}
