// 构建后处理：扫描 dist/ 生成 precache 清单，注入 dist/sw.js 并派生缓存版本号。
// 由 package.json 的 build 脚本在 `vite build` 之后自动执行，产物 dist/sw.js 直接可部署。
//   - index.html 以 "/" 记录（cache.addAll 时请求根路径即取到该文件）
//   - sw.js 自身、*.map 不进清单（前者由注册请求直接拉取，后者体积大且离线无意义）
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = resolve(root, "dist");
const swPath = join(distDir, "sw.js");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(distDir)
  .map((f) => relative(distDir, f).split(sep).join("/"))
  .filter((f) => f !== "sw.js" && !f.endsWith(".map"));

// index.html → "/"；其余按根相对 URL 记录
const urls = files.map((f) => (f === "index.html" ? "/" : `/${f}`));
urls.sort();

// 版本号：清单 + sw 模板内容哈希，内容变化才换缓存
const version = createHash("sha256")
  .update(JSON.stringify(urls))
  .update(readFileSync(swPath))
  .digest("hex")
  .slice(0, 12);

const manifestJson = JSON.stringify(urls, null, 2);
const sw = readFileSync(swPath, "utf8")
  .replace("/* @precache */ []", `/* @precache */ ${manifestJson}`)
  .replace('/* @version */ "dev"', `/* @version */ "${version}"`);

writeFileSync(swPath, sw);
console.log(`[inject-sw-precache] ${urls.length} 个资源已注入 sw.js（版本 mtr-offline-${version}）`);
