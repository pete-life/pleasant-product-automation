export const SHEET_TABS = {
  PRODUCTS: 'Products',
  LOGS: 'Logs',
  ERRORS: 'Errors',
  CONFIG: 'Config'
} as const;

export const COLUMN_NAMES = {
  ROW_NUMBER: 'row_number',
  BATCH_ID: 'BatchID',
  STATUS: 'Status',
  SHOPIFY_PRODUCT_ID: 'ShopifyProductId',
  PRODUCT_KEY: 'ProductKey',
  SKU: 'SKU',
  TITLE: 'Title',
  DESCRIPTION: 'Description',
  META_DESCRIPTION: 'MetaDescription',
  PRICE: 'Price',
  VENDOR: 'Vendor',
  PRODUCT_TYPE: 'ProductType',
  TAGS: 'Tags',
  HANDLE: 'Handle',
  MAIN_IMAGE_ID: 'MainImageId',
  CLOSE_IMAGE_ID: 'CloseImageId',
  MODEL_IMAGE_ID: 'ModelImageId',
  MODEL2_IMAGE_ID: 'Model2ImageId',
  SIZES: 'Sizes',
  REGENERATE: 'Regenerate',
  CREATED_AT: 'CreatedAt',
  UPDATED_AT: 'UpdatedAt',
  FABRIC: 'fabric',
  COLOR: 'color',
  PATTERN: 'pattern',
  TARGET_GENDER: 'target_gender',
  AGE_GROUP: 'age_group',
  SLEEVE_LENGTH: 'sleeve_length',
  CLOTHING_FEATURE: 'clothing_feature'
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

export const KNOWN_IMAGE_COLUMNS = [
  COLUMN_NAMES.MAIN_IMAGE_ID,
  COLUMN_NAMES.CLOSE_IMAGE_ID,
  COLUMN_NAMES.MODEL_IMAGE_ID,
  COLUMN_NAMES.MODEL2_IMAGE_ID
];

export const METAFIELD_KEYS = [
  COLUMN_NAMES.FABRIC,
  COLUMN_NAMES.COLOR,
  COLUMN_NAMES.PATTERN,
  COLUMN_NAMES.TARGET_GENDER,
  COLUMN_NAMES.AGE_GROUP,
  COLUMN_NAMES.SLEEVE_LENGTH,
  COLUMN_NAMES.CLOTHING_FEATURE
];

export const IMAGE_FILENAME_ROLE_REGEX = /_(main|close|model2?|[a-z0-9-]+)\./i;

export const DEFAULT_TIMEZONE = 'UTC';
