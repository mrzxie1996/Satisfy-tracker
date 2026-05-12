export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "VAPID_PUBLIC_KEY missing" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ publicKey: key }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
