import type { CombinedSnapshot } from "./products.js";

export function buildMarkdownAlert(args: {
  data: CombinedSnapshot;
  newOfficial: number[];
  newSlam: number[];
  newHaven: number[];
  siteUrl: string;
}): { title: string; markdown: string; plainLines: string[] } {
  const { data, newOfficial, newSlam, newHaven, siteUrl } = args;
  const lines: string[] = [];
  const md: string[] = [];

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
      `Slam Jam ${newSlam.length} 款：` +
        names.slice(0, 5).join(" · ") +
        (newSlam.length > 5 ? " …" : ""),
    );
    md.push(`### Slam Jam（${newSlam.length}）`);
    md.push(names.map((n) => `- ${escapeMd(n)}`).join("\n"));
  }

  if (newHaven.length) {
    const names = newHaven.map((id) => data.havensurf.titlesById[String(id)] || `#${id}`);
    lines.push(
      `Haven ${newHaven.length} 款：` +
        names.slice(0, 5).join(" · ") +
        (newHaven.length > 5 ? " …" : ""),
    );
    md.push(`### Haven Surf（${newHaven.length}）`);
    md.push(names.map((n) => `- ${escapeMd(n)}`).join("\n"));
  }

  const total = newOfficial.length + newSlam.length + newHaven.length;
  const title = `Satisfy 上新 · ${total} 条`;
  md.unshift(`**时间**：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" })}`);
  md.push("");
  md.push(`[打开 Satisfy 追踪页](${base}/satisfy-tracker.html)`);

  const markdown = md.join("\n");
  return { title, markdown, plainLines: lines };
}

function escapeMd(s: string): string {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
