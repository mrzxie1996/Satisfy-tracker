import { addSubscription, kvReady, type StoredPushSubscription } from "../_lib/push-store";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const jsonHeaders = { "Content-Type": "application/json" };

  try {
    if (!kvReady()) {
      return new Response(JSON.stringify({ ok: false, error: "KV 未配置（需 KV_REST_API_URL + KV_REST_API_TOKEN）" }), {
        status: 503,
        headers: jsonHeaders,
      });
    }

    let body: StoredPushSubscription;
    try {
      body = (await req.json()) as StoredPushSubscription;
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid json" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (!body?.endpoint || !body.keys?.auth || !body.keys?.p256dh) {
      return new Response(JSON.stringify({ ok: false, error: "invalid subscription" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await addSubscription(body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: jsonHeaders,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[web-push/subscribe]", e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: jsonHeaders,
    });
  }
}
