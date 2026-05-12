/**
 * GET /api/end-html?url=<encodeURIComponent(END 页面完整 https URL)>
 *
 * 与根目录 end-proxy-worker.js 规则一致：仅允许 *.endclothing.com 与 media.endclothing.com，
 * 避免开放任意 SSRF。部署在 Vercel 后，可在 satisfy-tracker 的「自建代理」填：
 *   https://<你的域名>/api/end-html?url=
 * 同源请求无 CORS 问题；若 END 拦截 Vercel 出口 IP，可改用 Cloudflare Worker 版代理。
 */

function json(res, obj, status) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status || 200).json(obj);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return json(res, { error: "Method not allowed" }, 405);
  }

  const target = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!target) {
    const ex =
      (req.headers["x-forwarded-proto"] === "https" ? "https" : "http") +
      "://" +
      (req.headers.host || "localhost") +
      "/api/end-html?url=" +
      encodeURIComponent("https://www.endclothing.com/hk/brands/satisfy");
    return json(res, { error: "Missing url query param", example: ex }, 400);
  }

  let t;
  try {
    t = new URL(target);
  } catch {
    return json(res, { error: "Invalid url" }, 400);
  }
  if (t.protocol !== "https:") {
    return json(res, { error: "Only https URLs" }, 400);
  }
  if (!/\.endclothing\.com$/i.test(t.hostname) && t.hostname !== "media.endclothing.com") {
    return json(res, { error: "Host not allowed" }, 403);
  }

  const upstream = await fetch(target, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
    },
    redirect: "follow",
  });

  const ct = upstream.headers.get("Content-Type") || "text/html; charset=utf-8";
  const body =
    upstream.status === 204 || upstream.status === 304
      ? Buffer.alloc(0)
      : Buffer.from(await upstream.arrayBuffer());

  res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "private, max-age=60");
  return res.status(upstream.status).send(body);
}
