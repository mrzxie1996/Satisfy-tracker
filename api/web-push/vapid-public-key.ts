/**
 * Node-style GET — same pattern as subscribe for Vercel api/ compatibility.
 */
export default async function handler(req: { method?: string }, res: any): Promise<void> {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(503).json({ ok: false, error: "VAPID_PUBLIC_KEY missing" });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json({ publicKey: key });
}
