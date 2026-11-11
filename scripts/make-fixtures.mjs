// 生成测试夹具：SVG 漫画页（两个章节）+ 打包 sample.cbz / sample.epub / sample.zip。
// 用法：node scripts/make-fixtures.mjs [--out test-fixtures]
// 打包依赖 fflate（zipSync），rar/7z/tar 需系统工具，这里不生成。
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "test-fixtures");

const PALETTES = [
  ["#1e3a5f", "#4f8cff"],
  ["#3d2a5f", "#a06bff"],
  ["#0f4a3a", "#2fd8a8"],
  ["#5f2a2a", "#ff7a6b"],
  ["#4a4206", "#ffd23f"],
];

function svgPage(label, sub, seed) {
  const [bg, fg] = PALETTES[seed % PALETTES.length];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1131" viewBox="0 0 800 1131">
  <rect width="800" height="1131" fill="${bg}"/>
  <circle cx="${150 + (seed * 97) % 500}" cy="300" r="140" fill="${fg}" opacity="0.25"/>
  <rect x="${100 + (seed * 131) % 400}" y="620" width="320" height="220" rx="18" fill="${fg}" opacity="0.35"/>
  <text x="400" y="560" font-family="Arial, sans-serif" font-size="220" font-weight="bold"
        fill="${fg}" text-anchor="middle">${label}</text>
  <text x="400" y="640" font-family="Arial, sans-serif" font-size="34"
        fill="#ffffff" opacity="0.85" text-anchor="middle">${sub}</text>
  <text x="400" y="1090" font-family="Arial, sans-serif" font-size="20"
        fill="#ffffff" opacity="0.5" text-anchor="middle">MangaTools Reader · test fixture</text>
</svg>`;
}

// ---------- 1) 文件夹夹具：两章节、自然排序（01 < 2 < 10）----------
const folderBook = join(outDir, "manga-folder");
rmSync(folderBook, { recursive: true, force: true });

const layout = [
  ["第01卷", ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012"]],
  ["第02卷", ["01", "02", "03", "04", "05", "06", "07", "08"]],
];

const allFiles = []; // { path, data }
let seed = 0;
for (const [chapter, pages] of layout) {
  for (const page of pages) {
    const path = `${chapter}/${page}.svg`;
    const data = strToU8(svgPage(page, chapter, seed++));
    allFiles.push({ path, data });
    const abs = join(folderBook, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);
  }
}

// ---------- 2) sample.cbz / sample.zip（同一内容）----------
const zipObj = Object.fromEntries(allFiles.map(({ path, data }) => [path, data]));
const cbz = zipSync(zipObj);
writeFileSync(join(outDir, "sample.cbz"), cbz);
writeFileSync(join(outDir, "sample.zip"), cbz);

// ---------- 3) sample.epub（spine 两章、图片型 EPUB）----------
const chapterXhtml = (title, images) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    ${images.map((p) => `<div><img src="../images/${p}" alt="${p}"/></div>`).join("\n    ")}
  </body>
</html>`;

const epubFiles = {
  "mimetype": strToU8("application/epub+zip"),
  "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
  "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:mtr-test-epub</dc:identifier>
    <dc:title>测试漫画 EPUB</dc:title>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    ${allFiles.map((f, i) => {
      const name = f.path.split("/").join("-").replace(".svg", "");
      return `<item id="img${i}" href="images/${f.path}" media-type="image/svg+xml"/>`;
    }).join("\n    ")}
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`),
  "OEBPS/text/ch1.xhtml": strToU8(chapterXhtml("第01卷", layout[0][1].map((p) => `第01卷/${p}.svg`))),
  "OEBPS/text/ch2.xhtml": strToU8(chapterXhtml("第02卷", layout[1][1].map((p) => `第02卷/${p}.svg`))),
  "OEBPS/nav.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">第01卷</a></li><li><a href="text/ch2.xhtml">第02卷</a></li></ol></nav></body>
</html>`),
};
for (const { path, data } of allFiles) {
  epubFiles[`OEBPS/images/${path}`] = data;
}
const epubZip = zipSync(epubFiles, { level: 6 });
writeFileSync(join(outDir, "sample.epub"), epubZip);

console.log(`✓ 夹具已生成到 ${outDir}`);
console.log("  - manga-folder/（文件夹，2 章 20 页，含自然排序用例 01~12 / 01~08）");
console.log("  - sample.cbz / sample.zip（20 页）");
console.log("  - sample.epub（spine 两章共 20 页）");
if (!existsSync(join(outDir, "sample.cbr"))) {
  console.log("  - 注：rar/7z/tar 夹具未生成（需对应工具，PC 端可手动验证）");
}
