import { addSubscription, kvReady, type StoredPushSubscription } from "../_lib/push-store";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!kvReady()) {
    return new Response(JSON.stringify({ ok: false, error: "KV 未配置（Vercel KV）" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: StoredPushSubscription;
  try {
    body = (await req.json()) as StoredPushSubscription;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body?.endpoint || !body.keys?.auth || !body.keys?.p256dh) {
    return new Response(JSON.stringify({ ok: false, error: "invalid subscription" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await addSubscription(body);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
