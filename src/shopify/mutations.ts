export const PRODUCT_CREATE = /* GraphQL */ `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id legacyResourceId handle }
      userErrors { field message }
    }
  }
`;

export const VARIANTS_BULK_CREATE = /* GraphQL */ `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id title sku }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_IMAGE_CREATE = /* GraphQL */ `
  mutation productImageCreate($productId: ID!, $image: ImageInput!) {
    productImageCreate(productId: $productId, image: $image) {
      image { id url altText }
      userErrors { field message }
    }
  }
`;

export const METAFIELDS_SET = /* GraphQL */ `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key namespace value type ownerType }
      userErrors { field message }
    }
  }
`;
