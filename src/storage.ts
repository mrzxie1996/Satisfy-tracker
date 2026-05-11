import type { ShopifyProduct, TrackedProduct, VariantStock } from "./types";

const LAST_IDS_KEY = "satisfy:lastProductIds";
const NOTES_KEY = "satisfy:notes";

export function loadLastSnapshotIds(): Set<number> {
  try {
    const raw = localStorage.getItem(LAST_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is number => typeof x === "number"));
  } catch {
    return new Set();
  }
}

export function saveSnapshotIds(ids: Set<number>): void {
  localStorage.setItem(LAST_IDS_KEY, JSON.stringify([...ids]));
}

export type NoteMap = Record<number, string>;

export function loadNotes(): NoteMap {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: NoteMap = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const id = Number(k);
      if (!Number.isFinite(id) || typeof v !== "string") continue;
      out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveNotes(map: NoteMap): void {
  localStorage.setItem(NOTES_KEY, JSON.stringify(map));
}

export function pickImage(p: ShopifyProduct): string | null {
  const img = p.images?.[0]?.src;
  return img ?? null;
}

export function formatHKD(priceStr: string): string {
  const n = parseFloat(priceStr);
  if (Number.isNaN(n)) return priceStr;
  try {
    return new Intl.NumberFormat("zh-Hant-HK", {
      style: "currency",
      currency: "HKD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `HK$${n.toFixed(0)}`;
  }
}

function priceRangeHKDFromVariants(variants: VariantStock[]): string | null {
  if (!variants.length) return null;
  const nums = variants.map((v) => parseFloat(v.price)).filter((n) => !Number.isNaN(n));
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return formatHKD(String(min));
  return `${formatHKD(String(min))} – ${formatHKD(String(max))}`;
}

function normalizeVariants(p: ShopifyProduct): VariantStock[] {
  return (p.variants ?? []).map((v) => ({
    id: v.id,
    option1: v.option1 ?? null,
    option2: v.option2 ?? null,
    option3: v.option3 ?? null,
    title: v.title,
    price: v.price,
    available: !!v.available,
  }));
}

export function toTracked(
  p: ShopifyProduct,
  sourceLabel: string,
  productUrlBase: string,
  previousIds: Set<number>
): TrackedProduct {
  const variants = normalizeVariants(p);
  const url = `${productUrlBase.replace(/\/$/, "")}/products/${p.handle}?currency=HKD`;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    sourceLabel,
    sourceUrl: url,
    imageUrl: pickImage(p),
    priceRangeHKD: priceRangeHKDFromVariants(variants),
    variants,
    createdAt: p.created_at,
    isNew: !previousIds.has(p.id),
  };
}

export function sortByCreatedDesc(a: TrackedProduct, b: TrackedProduct): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
