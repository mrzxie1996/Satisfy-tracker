import type { ShopifyProduct } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

/**
 * Fetches all products from a Shopify store via public JSON API.
 * Uses dev proxy path `/api/shopify` -> satisfyrunning.com
 */
export async function fetchAllShopifyProducts(basePath: string): Promise<ShopifyProduct[]> {
  const base = basePath.replace(/\/$/, "");
  const out: ShopifyProduct[] = [];
  let page = 1;
  const limit = 250;

  for (;;) {
    const url = `${base}/products.json?limit=${limit}&page=${page}&currency=HKD`;
    const data = await fetchJson<{ products: ShopifyProduct[] }>(url);
    const batch = data.products ?? [];
    out.push(...batch);
    if (batch.length < limit) break;
    page += 1;
    if (page > 50) break;
  }

  return out;
}
