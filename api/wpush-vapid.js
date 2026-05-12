/**
 * GET /api/wpush-vapid — 返回 VAPID 公钥（与 api/push.js 同风格，供浏览器订阅）
 */
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return res.status(503).json({ ok: false, error: "VAPID_PUBLIC_KEY missing" });
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ publicKey: key });
}
