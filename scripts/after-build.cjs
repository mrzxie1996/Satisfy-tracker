/**
 * Vite 构建后：把 satisfy-tracker.html 复制到 dist/satisfy-tracker.html 与 dist/index.html。
 * 这样 Vercel 上访问 / 即为完整单页（官网 + END + Slam Jam），不再落到仅含官网的 React index。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const trackerSrc = path.join(root, "satisfy-tracker.html");

if (!fs.existsSync(dist)) {
  console.error("after-build: dist/ missing, run vite build first");
  process.exit(1);
}

const html = fs.readFileSync(trackerSrc, "utf8");
fs.writeFileSync(path.join(dist, "satisfy-tracker.html"), html, "utf8");
fs.writeFileSync(path.join(dist, "index.html"), html, "utf8");
console.log("after-build: index.html + satisfy-tracker.html <- satisfy-tracker.html");
