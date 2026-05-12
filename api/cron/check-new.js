/**
 * GET /api/cron/check-new — 对比 KV 快照、PushPlus / Web Push（逻辑内联，避免 Vercel 无法解析 api/_lib 相对路径）
 * 外部定时器（cron-job.org）须带 Authorization: Bearer <CRON_SECRET>（若已配置 CRON_SECRET）
 */
import webpush from "web-push";
import { Redis } from "@upstash/redis";

const SUBS_KEY = "satisfy-tracker:push-subs";
const SNAP_KEY = "satisfy-tracker:id-snapshot";
const PUSHPLUS_SEND = "https://www.pushplus.plus/send";

const OFFICIAL = "https://satisfyrunning.com";
const SLAMJAM_COLLECTION = "https://slamjam.com/en-hk/collections/satisfy";
const HAVEN_PREFIX = "https://havensurf.com";
const HAVEN_TOKEN_FALLBACK = "b5053c919908d5cb6b214d979eb71357";

const HAVEN_GQL =
  'query HavenSatisfy @inContext(country: HK) {\n' +
  '  collection(handle: "satisfy") {\n' +
  "    products(first: 250) {\n" +
  "      nodes {\n" +
  "        id\n" +
  "        title\n" +
  "        variants(first: 100) {\n" +
  "          nodes {\n" +
  "            id\n" +
  "          }\n" +
  "        }\n" +
  "      }\n" +
  "    }\n" +
  "  }\n" +
  "}";

function kvEnvReady() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function fetchOfficialSnapshot() {
  const base = OFFICIAL.replace(/\/$/, "");
  const titlesById = {};
  const ids = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const url = `${base}/products.json?limit=${limit}&page=${page}&currency=HKD`;
    const data = await fetchJson(url);
    const batch = data.products ?? [];
    for (const p of batch) {
      ids.push(p.id);
      titlesById[String(p.id)] = p.title;
    }
    if (batch.length < limit) break;
    page += 1;
    if (page > 50) break;
  }
  return { ids, titlesById };
}

async function fetchSlamJamSnapshot() {
  const base = SLAMJAM_COLLECTION.replace(/\/$/, "");
  const titlesById = {};
  const ids = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const url = `${base}/products.json?limit=${limit}&page=${page}`;
    const data = await fetchJson(url);
    const batch = data.products ?? [];
    for (const p of batch) {
      ids.push(p.id);
      titlesById[String(p.id)] = p.title;
    }
    if (batch.length < limit) break;
    page += 1;
    if (page > 50) break;
  }
  return { ids, titlesById };
}

function legacyProductIdFromGid(gid) {
  const m = /Product\/(\d+)/.exec(gid || "");
  return m ? parseInt(m[1], 10) : 0;
}

async function fetchHavenSnapshot(token) {
  const url = `${HAVEN_PREFIX}/api/2024-10/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token || HAVEN_TOKEN_FALLBACK,
    },
    body: JSON.stringify({ query: HAVEN_GQL }),
  });
  if (!res.ok) throw new Error(`Haven GraphQL HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors && j.errors.length) {
    throw new Error(j.errors.map((e) => e.message).join("; "));
  }
  const nodes = j.data?.collection?.products?.nodes ?? [];
  const titlesById = {};
  const ids = [];
  for (const node of nodes) {
    const pid = legacyProductIdFromGid(node.id);
    if (!pid) continue;
    ids.push(pid);
    titlesById[String(pid)] = node.title || "";
  }
  return { ids, titlesById };
}

async function fetchAllSnapshots() {
  const havenToken = process.env.HAVEN_STOREFRONT_TOKEN || HAVEN_TOKEN_FALLBACK;
  const [official, slamjam, havensurf] = await Promise.all([
    fetchOfficialSnapshot(),
    fetchSlamJamSnapshot(),
    fetchHavenSnapshot(havenToken),
  ]);
  return { official, slamjam, havensurf };
}

async function getSubscriptions(redis) {
  const raw = await redis.get(SUBS_KEY);
  if (raw == null || raw === "") return [];
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function getIdSnapshot(redis) {
  const raw = await redis.get(SNAP_KEY);
  if (raw == null || raw === "") return null;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  try {
    const o = JSON.parse(text);
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

async function setIdSnapshot(redis, s) {
  await redis.set(SNAP_KEY, JSON.stringify(s));
}

async function removeSubscription(redis, endpoint) {
  const subs = await getSubscriptions(redis);
  await redis.set(
    SUBS_KEY,
    JSON.stringify(subs.filter((s) => s.endpoint !== endpoint)),
  );
}

function escapeMd(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildMarkdownAlert(args) {
  const { data, newOfficial, newSlam, newHaven, siteUrl } = args;
  const lines = [];
  const md = [];
  const base = siteUrl.replace(/\/$/, "");

  if (newOfficial.length) {
    const names = newOfficial.map((id) => data.official.titlesById[String(id)] || `#${id}`);
    lines.push(
      `官网 ${newOfficial.length} 款：` + names.slice(0, 5).join(" · ") + (newOfficial.length > 5 ? " …" : ""),
    );
    md.push(`### 官网（${newOfficial.length}）`);
    md.push(names.map((n) => `- ${escapeMd(n)}`).join("\n"));
  }

  if (newSlam.length) {
    const names = newSlam.map((id) => data.slamjam.titlesById[String(id)] || `#${id}`);
    lines.push(
      `Slam Jam ${newSlam.length} 款：` + names.slice(0, 5).join(" · ") + (newSlam.length > 5 ? " …" : ""),
    );
    md.push(`### Slam Jam（${newSlam.length}）`);
    md.push(names.map((n) => `- ${escapeMd(n)}`).join("\n"));
  }

  if (newHaven.length) {
    const names = newHaven.map((id) => data.havensurf.titlesById[String(id)] || `#${id}`);
    lines.push(
      `Haven ${newHaven.length} 款：` + names.slice(0, 5).join(" · ") + (newHaven.length > 5 ? " …" : ""),
    );
    md.push(`### Haven Surf（${newHaven.length}）`);
    md.push(names.map((n) => `- ${escapeMd(n)}`).join("\n"));
  }

  const total = newOfficial.length + newSlam.length + newHaven.length;
  const title = `Satisfy 上新 · ${total} 条`;
  md.unshift(`**时间**：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" })}`);
  md.push("");
  md.push(`[打开 Satisfy 追踪页](${base}/satisfy-tracker.html)`);
  return { title, markdown: md.join("\n"), plainLines: lines };
}

async function sendPushPlusMarkdown({ token, title, markdown, channel = "wechat" }) {
  try {
    const res = await fetch(PUSHPLUS_SEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        content: markdown,
        template: "markdown",
        channel,
      }),
    });
    const raw = await res.json();
    const code = raw.code ?? res.status;
    if (!res.ok || (code !== undefined && code !== 200)) {
      return { ok: false, error: raw.msg || `HTTP ${res.status}` };
    }
    return { ok: true, code, raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function siteBaseUrl() {
  const raw = (process.env.SITE_URL || process.env.VERCEL_URL || "https://satisfy-tracker.vercel.app").replace(
    /\/$/,
    "",
  );
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function diffNewIds(prev, current) {
  const set = new Set(prev ?? []);
  return current.filter((id) => !set.has(id));
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  if (!kvEnvReady()) {
    return res.status(503).json({ ok: false, error: "KV_REST_API_URL / KV_REST_API_TOKEN not set" });
  }

  const redis = getRedis();
  const siteUrl = siteBaseUrl();

  let data;
  try {
    data = await fetchAllSnapshots();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[check-new] fetchAllSnapshots:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }

  const currentSnap = {
    official: data.official.ids,
    slamjam: data.slamjam.ids,
    havensurf: data.havensurf.ids,
  };

  const prev = await getIdSnapshot(redis);
  if (!prev) {
    await setIdSnapshot(redis, currentSnap);
    return res.status(200).json({
      ok: true,
      message: "已建立初始快照，未推送",
      baseline: true,
      counts: {
        official: currentSnap.official.length,
        slamjam: currentSnap.slamjam.length,
        havensurf: currentSnap.havensurf.length,
      },
    });
  }

  const newOfficial = diffNewIds(prev.official, currentSnap.official);
  const newSlam = diffNewIds(prev.slamjam, currentSnap.slamjam);
  const newHaven = diffNewIds(prev.havensurf, currentSnap.havensurf);
  const totalNew = newOfficial.length + newSlam.length + newHaven.length;

  await setIdSnapshot(redis, currentSnap);

  if (totalNew === 0) {
    return res.status(200).json({
      ok: true,
      message: "检查完成，无上新",
      foundNew: false,
    });
  }

  const { title, markdown, plainLines } = buildMarkdownAlert({
    data,
    newOfficial,
    newSlam,
    newHaven,
    siteUrl,
  });

  let pushplusOk = null;
  const pushToken = process.env.PUSHPLUS_TOKEN;
  if (pushToken) {
    const r = await sendPushPlusMarkdown({ token: pushToken, title, markdown });
    pushplusOk = r.ok;
    if (!r.ok) console.error("[check-new] PushPlus:", r.error);
  }

  let wpushAttempted = 0;
  let wpushOk = 0;
  let wpushFail = 0;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@localhost";

  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    const subs = await getSubscriptions(redis);
    const body = plainLines.join("\n").slice(0, 1800);
    const payload = JSON.stringify({
      title,
      body: body || title,
      url: `${siteUrl}/`,
    });

    for (const sub of subs) {
      wpushAttempted++;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            expirationTime: sub.expirationTime ?? undefined,
          },
          payload,
          { TTL: 86400 },
        );
        wpushOk++;
      } catch (e) {
        wpushFail++;
        const st = typeof e === "object" && e && "statusCode" in e ? e.statusCode : undefined;
        if (st === 404 || st === 410) {
          try {
            await removeSubscription(redis, sub.endpoint);
          } catch {
            /* ignore */
          }
        }
        console.error("[check-new] webpush:", st, e instanceof Error ? e.message : String(e));
      }
    }
  }

  return res.status(200).json({
    ok: true,
    message: "检查完成并已尝试推送",
    foundNew: true,
    newCounts: {
      official: newOfficial.length,
      slamjam: newSlam.length,
      havensurf: newHaven.length,
    },
    pushplus: pushToken ? { ok: pushplusOk } : { skipped: true },
    webPush: pub && priv ? { attempted: wpushAttempted, ok: wpushOk, fail: wpushFail } : { skipped: true },
  });
}
