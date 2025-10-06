export const SHEET_TABS = {
  PRODUCTS: 'Products',
  LOGS: 'Logs',
  ERRORS: 'Errors',
  CONFIG: 'Config'
} as const;

export const COLUMN_NAMES = {
  BATCH_ID: 'BatchID',
  STATUS: 'Status',
  ROW_ID: 'RowID',
  SHOPIFY_PRODUCT_ID: 'ShopifyProductId',
  PRODUCT_KEY: 'ProductKey',
  SKU: 'SKU',
  TITLE: 'Title',
  DESCRIPTION: 'Description',
  META_DESCRIPTION: 'MetaDescription',
  TAGS: 'Tags',
  STYLE: 'Style',
  CATEGORY: 'Category',
  COLOR: 'Color',
  PATTERN: 'Pattern',
  PRICE: 'Price',
  VENDOR: 'Vendor',
  PRODUCT_TYPE: 'Category',
  HANDLE: 'Handle',
  MAIN_IMAGE_ID: 'MainImageId',
  CLOSE_IMAGE_ID: 'CloseImageId',
  MODEL_IMAGE_ID: 'ModelImageId',
  MODEL2_IMAGE_ID: 'Model2ImageId',
  CREATED_AT: 'CreatedAt',
  UPDATED_AT: 'UpdatedAt',
  STOCK_ONE_SIZE: 'Stock: One-size',
  STOCK_XS: 'Stock: XS',
  STOCK_S: 'Stock: S',
  STOCK_M: 'Stock: M',
  STOCK_L: 'Stock: L',
  STOCK_XL: 'Stock: XL',
  SIZES: 'Sizes',
  METAFIELD_FABRIC: 'MetafieldFabric',
  METAFIELD_COLOR: 'MetafieldColor',
  METAFIELD_PATTERN: 'MetafieldPattern',
  METAFIELD_TARGET_GENDER: 'MetafieldTargetGender',
  METAFIELD_AGE_GROUP: 'MetafieldAgeGroup',
  METAFIELD_SLEEVE_LENGTH: 'MetafieldSleeveLength',
  METAFIELD_CLOTHING_FEATURE: 'MetafieldClothingFeature',
  GPC_CODE: 'GPCCode',
  GPC_ATTRIBUTES: 'GPCAttributes',
  GOOGLE_PRODUCT_CATEGORY: 'GoogleProductCategory',
  STRUCTURED_DATA: 'StructuredData',
  GPC_DESCRIPTION: 'GPCDescription',
  GPC_SEGMENT: 'GPCSegment',
  GPC_SEGMENT_NAME: 'GPCSegmentName',
  GPC_FAMILY: 'GPCFamily',
  GPC_FAMILY_NAME: 'GPCFamilyName',
  GPC_CLASS: 'GPCClass',
  GPC_CLASS_NAME: 'GPCClassName',
  GPC_BRICK: 'GPCBrick',
  GPC_BRICK_NAME: 'GPCBrickName'
} as const;

export const APPROVED_VALUES = ['APPROVED', 'GODKENDT'] as const;

export const STATUS = {
  PENDING: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  CREATED: 'CREATED',
  COMPLETE: 'COMPLETE'
} as const;

export const SIZE_OPTIONS = ['One-size', 'XS', 'S', 'M', 'L', 'XL'] as const;

export const ROLE_ORDER = ['main', 'close', 'model', 'model2'] as const;

export const SIZE_STOCK_COLUMNS: Record<(typeof SIZE_OPTIONS)[number], string> = {
  'One-size': COLUMN_NAMES.STOCK_ONE_SIZE,
  XS: COLUMN_NAMES.STOCK_XS,
  S: COLUMN_NAMES.STOCK_S,
  M: COLUMN_NAMES.STOCK_M,
  L: COLUMN_NAMES.STOCK_L,
  XL: COLUMN_NAMES.STOCK_XL
};

export const ROLE_COLUMN_MAP: Record<string, string> = {
  main: COLUMN_NAMES.MAIN_IMAGE_ID,
  close: COLUMN_NAMES.CLOSE_IMAGE_ID,
  model: COLUMN_NAMES.MODEL_IMAGE_ID,
  model2: COLUMN_NAMES.MODEL2_IMAGE_ID
};

export const KNOWN_IMAGE_COLUMNS = [
  COLUMN_NAMES.MAIN_IMAGE_ID,
  COLUMN_NAMES.CLOSE_IMAGE_ID,
  COLUMN_NAMES.MODEL_IMAGE_ID,
  COLUMN_NAMES.MODEL2_IMAGE_ID
];

export const METAFIELD_COLUMN_MAP: Record<string, string> = {
  [COLUMN_NAMES.METAFIELD_FABRIC]: 'fabric',
  [COLUMN_NAMES.METAFIELD_COLOR]: 'color',
  [COLUMN_NAMES.METAFIELD_PATTERN]: 'pattern',
  [COLUMN_NAMES.METAFIELD_TARGET_GENDER]: 'target_gender',
  [COLUMN_NAMES.METAFIELD_AGE_GROUP]: 'age_group',
  [COLUMN_NAMES.METAFIELD_SLEEVE_LENGTH]: 'sleeve_length',
  [COLUMN_NAMES.METAFIELD_CLOTHING_FEATURE]: 'clothing_feature',
  [COLUMN_NAMES.GPC_CODE]: 'gpc_code',
  [COLUMN_NAMES.GPC_ATTRIBUTES]: 'gpc_attributes',
  [COLUMN_NAMES.GOOGLE_PRODUCT_CATEGORY]: 'google_product_category',
  [COLUMN_NAMES.STRUCTURED_DATA]: 'structured_data',
  [COLUMN_NAMES.GPC_DESCRIPTION]: 'gpc_description',
  [COLUMN_NAMES.GPC_SEGMENT]: 'gpc_segment',
  [COLUMN_NAMES.GPC_SEGMENT_NAME]: 'gpc_segment_name',
  [COLUMN_NAMES.GPC_FAMILY]: 'gpc_family',
  [COLUMN_NAMES.GPC_FAMILY_NAME]: 'gpc_family_name',
  [COLUMN_NAMES.GPC_CLASS]: 'gpc_class',
  [COLUMN_NAMES.GPC_CLASS_NAME]: 'gpc_class_name',
  [COLUMN_NAMES.GPC_BRICK]: 'gpc_brick',
  [COLUMN_NAMES.GPC_BRICK_NAME]: 'gpc_brick_name'
};

export const METAFIELD_KEY_WHITELIST = Object.values(METAFIELD_COLUMN_MAP);

export const IMAGE_FILENAME_ROLE_REGEX = /_(main|close|model2?|[a-z0-9-]+)\./i;

export const DEFAULT_TIMEZONE = 'UTC';
