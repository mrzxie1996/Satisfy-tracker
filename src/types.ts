export type ShopifyImage = {
  src: string;
  width?: number;
  height?: number;
};

export type ShopifyVariant = {
  id: number;
  title: string;
  price: string;
  available: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

/** Minimal subset of Shopify Product JSON API */
export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  created_at: string;
  updated_at: string;
  product_type: string;
  vendor: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
};

export type VariantStock = {
  id: number;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  title: string;
  price: string;
  available: boolean;
};

export type TrackedProduct = {
  id: number;
  title: string;
  handle: string;
  sourceLabel: string;
  sourceUrl: string;
  imageUrl: string | null;
  /** Formatted HKD range e.g. HK$1,400 */
  priceRangeHKD: string | null;
  variants: VariantStock[];
  createdAt: string;
  /** true when first seen after last snapshot */
  isNew?: boolean;
};

export type ManualNote = {
  productId: number;
  note: string;
  updatedAt: string;
};

export type WatchSource = {
  id: string;
  label: string;
  /** Path prefix after origin, e.g. satisfyrunning.com -> use proxy base */
  shopifyOriginPath: string;
  enabled: boolean;
};
