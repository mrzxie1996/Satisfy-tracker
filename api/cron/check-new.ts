import webpush from "web-push";
import { kvEnvReady } from "../_lib/redis.js";
import { fetchAllSnapshots } from "../_lib/products.js";
import { buildMarkdownAlert } from "../_lib/notify-format.js";
import {
  getIdSnapshot,
  setIdSnapshot,
  getSubscriptions,
  removeSubscription,
  type IdSnapshot,
} from "../_lib/push-store.js";
import { sendPushPlusMarkdown } from "../_lib/pushplus.js";

function siteBaseUrl(): string {
  const raw = (process.env.SITE_URL || process.env.VERCEL_URL || "https://satisfy-tracker.vercel.app").replace(
    /\/$/,
    "",
  );
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function diffNewIds(prev: number[] | undefined, current: number[]): number[] {
  const set = new Set(prev ?? []);
  return current.filter((id) => !set.has(id));
}

/**
 * 对比 KV 快照发现上新后，发 PushPlus（可选）与 Web Push（可选）。
 *
 * Hobby 不宜依赖 Vercel Cron 高频触发：请在 cron-job.org 等外部服务每 3 小时 GET 本路径，
 * 并设置环境变量 CRON_SECRET，请求头携带 Authorization: Bearer <CRON_SECRET>。
 */
export default async function handler(_req: any, res: any) {
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

  const siteUrl = siteBaseUrl();

  let data: Awaited<ReturnType<typeof fetchAllSnapshots>>;
  try {
    data = await fetchAllSnapshots();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[check-new] fetchAllSnapshots:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }

  const currentSnap: IdSnapshot = {
    official: data.official.ids,
    slamjam: data.slamjam.ids,
    havensurf: data.havensurf.ids,
  };

  const prev = await getIdSnapshot();
  if (!prev) {
    await setIdSnapshot(currentSnap);
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

  await setIdSnapshot(currentSnap);

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

  let pushplusOk: boolean | null = null;
  const pushToken = process.env.PUSHPLUS_TOKEN;
  if (pushToken) {
    const r = await sendPushPlusMarkdown({ token: pushToken, title, markdown });
    pushplusOk = r.ok;
    if (!r.ok) console.error("[check-new] PushPlus:", r.ok === false ? r.error : "");
  }

  let wpushAttempted = 0;
  let wpushOk = 0;
  let wpushFail = 0;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@localhost";

  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    const subs = await getSubscriptions();
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
      } catch (e: unknown) {
        wpushFail++;
        const st = typeof e === "object" && e && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
        if (st === 404 || st === 410) {
          try {
            await removeSubscription(sub.endpoint);
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
