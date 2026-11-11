// EPUB 解析：container.xml → OPF → spine 顺序 → 各 xhtml 内图片（去重、保序）。
// 纯文本页跳过；仅依赖 DOMParser，Web / Tauri 通用。
import type { BookSource } from "@/lib/sources/types";

const XML_TYPE = "text/xml" as DOMParserSupportedType;

interface EpubImagePlan {
  /** 按 spine 顺序去重后的图片条目路径 */
  imagePaths: string[];
  /** 跳过的纯文字页数量 */
  textPageCount: number;
  /** spine 内容文档 → 目录章节（原始标题 + 章内首图路径），供 buildEpubBook 映射页码 */
  spineChapters: { title: string; firstImage: string | null }[];
}

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
]);

export async function planEpubPages(
  source: BookSource,
): Promise<EpubImagePlan> {
  const containerXml = await readText(source, "META-INF/container.xml");
  if (!containerXml) throw new Error("err.invalidEpub");

  const parser = new DOMParser();
  const container = parser.parseFromString(containerXml, XML_TYPE);
  const rootfile = container.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("err.invalidEpub");

  const opfXml = await readText(source, opfPath);
  if (!opfXml) throw new Error("err.invalidEpub");
  const opf = parser.parseFromString(opfXml, XML_TYPE);

  // manifest: id -> { href, mediaType }
  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const item of opf.querySelectorAll("manifest > item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      mediaType: item.getAttribute("media-type") ?? "",
    });
  }

  // spine 顺序的内容文档
  const spineIds = [...opf.querySelectorAll("spine > itemref")]
    .map((el) => el.getAttribute("idref"))
    .filter((id): id is string => !!id);

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const imagePaths: string[] = [];
  const spineChapters: { title: string; firstImage: string | null }[] = [];
  const seen = new Set<string>();
  let textPageCount = 0;

  for (const idref of spineIds) {
    const item = manifest.get(idref);
    if (!item) continue;
    const media = item.mediaType;
    const isHtml = media === "application/xhtml+xml" || media === "text/html";
    const isImage = IMAGE_MIME.has(media);

    if (isImage) {
      const p = resolvePath(opfDir, item.href);
      if (!seen.has(p)) {
        seen.add(p);
        imagePaths.push(p);
      }
      continue;
    }
    if (!isHtml) continue; // css/ncx/nav 等跳过

    const baseDir = opfDir + (item.href.includes("/")
      ? item.href.slice(0, item.href.lastIndexOf("/") + 1)
      : "");
    const html = await readText(source, resolvePath(opfDir, item.href));
    if (!html) continue;

    const doc = parser.parseFromString(html, XML_TYPE);
    let pageHasImage = false;
    let docFirstImage: string | null = null;

    // <img src> 与 SVG <image xlink:href|href>
    const srcs = new Set<string>();
    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src) srcs.add(src);
    });
    doc.querySelectorAll("image").forEach((img) => {
      const href =
        img.getAttribute("xlink:href") ??
        img.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
        img.getAttribute("href");
      if (href) srcs.add(href);
    });

    for (const raw of srcs) {
      if (/^(data:|https?:)/i.test(raw)) continue;
      const decoded = decodeURIComponent(raw.split("#")[0]);
      const p = resolvePath(baseDir, decoded);
      if (manifestHasImage(manifest, p, opfDir) || /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(p)) {
        if (!seen.has(p)) {
          seen.add(p);
          imagePaths.push(p);
        }
        if (docFirstImage === null) docFirstImage = p;
        pageHasImage = true;
      }
    }

    if (pageHasImage) {
      // 该内容文档构成一个目录章节（含首图与标题）
      spineChapters.push({ title: extractTitle(doc), firstImage: docFirstImage });
    } else {
      textPageCount++;
    }
  }

  if (imagePaths.length === 0) throw new Error("err.noImages");
  return { imagePaths, textPageCount, spineChapters };
}

/** 章节标题：优先取内容文档中的标题元素，退化到 <title>；空白折叠并限长。 */
function extractTitle(doc: Document): string {
  const heading = doc.querySelector("h1, h2, h3, h4, h5, h6");
  const raw = heading?.textContent ?? doc.querySelector("title")?.textContent ?? "";
  const text = raw.replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function manifestHasImage(
  manifest: Map<string, { href: string; mediaType: string }>,
  absPath: string,
  opfDir: string,
): boolean {
  for (const { href, mediaType } of manifest.values()) {
    if (!IMAGE_MIME.has(mediaType)) continue;
    if (resolvePath(opfDir, href) === absPath) return true;
  }
  return false;
}

async function readText(source: BookSource, path: string): Promise<string | null> {
  try {
    const buf = await source.read(path);
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return null;
  }
}

/** 相对路径解析（纯路径运算，不处理 .. 越界返回原值）。 */
function resolvePath(baseDir: string, href: string): string {
  const clean = href.replace(/\\/g, "/");
  const segments: string[] = [];
  for (const seg of (baseDir + clean).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") segments.pop();
    else segments.push(seg);
  }
  return segments.join("/");
}
