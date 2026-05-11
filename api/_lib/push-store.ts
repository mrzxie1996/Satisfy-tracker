import { kv } from "@vercel/kv";

const SUBS_KEY = "satisfy-tracker:push-subs";
const SNAP_KEY = "satisfy-tracker:id-snapshot";

/** Browser PushSubscription.toJSON() shape */
export type StoredPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type IdSnapshot = {
  official: number[];
  slamjam: number[];
  havensurf: number[];
};

export function kvReady(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getSubscriptions(): Promise<StoredPushSubscription[]> {
  const raw = await kv.get<string>(SUBS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as StoredPushSubscription[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveSubscriptions(subs: StoredPushSubscription[]): Promise<void> {
  await kv.set(SUBS_KEY, JSON.stringify(subs));
}

export async function addSubscription(sub: StoredPushSubscription): Promise<void> {
  const subs = await getSubscriptions();
  const rest = subs.filter((s) => s.endpoint !== sub.endpoint);
  rest.push(sub);
  await saveSubscriptions(rest);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const subs = await getSubscriptions();
  await saveSubscriptions(subs.filter((s) => s.endpoint !== endpoint));
}

export async function getIdSnapshot(): Promise<IdSnapshot | null> {
  const raw = await kv.get<string>(SNAP_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as IdSnapshot;
    if (!o || !Array.isArray(o.official)) return null;
    return {
      official: o.official,
      slamjam: Array.isArray(o.slamjam) ? o.slamjam : [],
      havensurf: Array.isArray(o.havensurf) ? o.havensurf : [],
    };
  } catch {
    return null;
  }
}

export async function setIdSnapshot(s: IdSnapshot): Promise<void> {
  await kv.set(SNAP_KEY, JSON.stringify(s));
}
