/**
 * Cloudflare Worker：为静态 HTML 工具代抓 END. 页面并加上 CORS，避免浏览器跨域与部分直连失败。
 *
 * 部署：npm i -g wrangler → 在本文件旁执行
 *   wrangler deploy end-proxy-worker.js
 * 将得到的 https://xxx.workers.dev 配到 satisfy-tracker.html 的「自建代理」输入框，格式：
 *   https://xxx.workers.dev/?url=
 * （页面会把完整 END 地址作 url= 的查询参数。）
 *
 * 安全：仅允许 endclothing.com 域名，避免开放任意 SSRF。
 */
export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    var url = new URL(request.url);
    var target = url.searchParams.get("url");
    if (!target) {
      return json(
        {
          error: "Missing url query param",
          example: url.origin + "/?url=" + encodeURIComponent("https://www.endclothing.com/hk/brands/satisfy"),
        },
        400
      );
    }
    var t;
    try {
      t = new URL(target);
    } catch (e) {
      return json({ error: "Invalid url" }, 400);
    }
    if (t.protocol !== "https:") {
      return json({ error: "Only https URLs" }, 400);
    }
    if (!/\.endclothing\.com$/i.test(t.hostname) && t.hostname !== "media.endclothing.com") {
      return json({ error: "Host not allowed" }, 403);
    }

    var upstream = await fetch(target, {
      method: request.method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
      },
      redirect: "follow",
    });

    var body = upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
    var ct = upstream.headers.get("Content-Type") || "text/html; charset=utf-8";

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Cache-Control": "private, max-age=60",
      },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
