/**
 * POST /api/push — 服务端转发 PushPlus（token 仅存环境变量）
 * Body JSON: { title?: string, content: string }
 */

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const token = process.env.PUSHPLUS_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "PUSHPLUS_TOKEN is not set" });
  }

  let title = "";
  let content = "";
  try {
    const raw =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (raw && typeof raw === "object") {
      title = typeof raw.title === "string" ? raw.title : "";
      content = typeof raw.content === "string" ? raw.content : "";
    }
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  if (!content.trim()) {
    return res.status(400).json({ ok: false, error: "content is required" });
  }

  const upstream = await fetch("https://www.pushplus.plus/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      title: title.trim() || "Satisfy Tracker",
      content: content.trim(),
      channel: "wechat",
    }),
  });

  let data;
  try {
    data = await upstream.json();
  } catch {
    data = { msg: await upstream.text() };
  }

  const code = data && typeof data.code === "number" ? data.code : upstream.status;
  if (!upstream.ok || code !== 200) {
    const msg = (data && data.msg) || `HTTP ${upstream.status}`;
    return res.status(502).json({ ok: false, error: msg, pushplus: data });
  }

  return res.status(200).json({ ok: true, pushplus: data });
}
