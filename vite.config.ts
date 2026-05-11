import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vercel 对 Vite 项目有时只执行 `vite build`，不会跑 package.json 里整条 `npm run build`。
 * 在 closeBundle 写入完整 satisfy-tracker.html，保证线上 `/` 含官网 + END + Slam Jam。
 */
function satisfyTrackerAsIndexHtml(): import("vite").Plugin {
  return {
    name: "satisfy-tracker-as-index",
    apply: "build",
    closeBundle() {
      const root = path.resolve(__dirname);
      const dist = path.join(root, "dist");
      const src = path.join(root, "satisfy-tracker.html");
      if (!existsSync(dist) || !existsSync(src)) {
        console.warn("[satisfy-tracker-as-index] skip (dist or satisfy-tracker.html missing)");
        return;
      }
      const html = readFileSync(src, "utf8");
      writeFileSync(path.join(dist, "satisfy-tracker.html"), html);
      writeFileSync(path.join(dist, "index.html"), html);
      console.log("[satisfy-tracker-as-index] dist/index.html <- satisfy-tracker.html");
    },
  };
}

export default defineConfig({
  plugins: [react(), satisfyTrackerAsIndexHtml()],
  server: {
    proxy: {
      "/api/shopify": {
        target: "https://satisfyrunning.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/shopify/, ""),
      },
    },
  },
});
