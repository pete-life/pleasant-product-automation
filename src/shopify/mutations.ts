export const PRODUCT_CREATE = /* GraphQL */ `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id legacyResourceId handle options { id name } variants(first: 1) { nodes { id title } } }
      userErrors { field message }
    }
  }
`;

export const VARIANTS_BULK_CREATE = /* GraphQL */ `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
      productVariants { id title sku }
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

export const STAGED_UPLOADS_CREATE = /* GraphQL */ `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

export const PRODUCT_CREATE_MEDIA = /* GraphQL */ `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id alt status }
      userErrors { field message }
    }
  }
`;
