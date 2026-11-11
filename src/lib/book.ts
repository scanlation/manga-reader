// 书籍构建：BookSource + identity → 统一的 Book（扁平页面列表 + 章节索引）。
// 图片过滤 + 自然排序 + 一级目录章节分组；EPUB 走专门解析。
import { isImagePath, sortImagePaths } from "./images";
import { planEpubPages } from "./epub";
import type { BookIdentity, BookSource, OpenedBook } from "./sources/types";

export interface BookChapter {
  title: string;
  /** 该章起始页在 pages 中的索引 */
  pageStart: number;
  pageCount: number;
}

export interface BookPage {
  /** 源内路径 */
  path: string;
  chapterIndex: number;
}

export interface Book {
  identity: BookIdentity;
  source: BookSource;
  pages: BookPage[];
  chapters: BookChapter[];
  pageCount: number;
  /** 是否有真实目录（EPUB spine 章节或多一级分组），决定阅读页是否显示目录按钮 */
  hasToc: boolean;
  /** EPUB 跳过的纯文字页数（0 = 无） */
  skippedTextPages: number;
}

/** 章节数 ≥ 2 才视为有目录（单个分组没有跳章意义）。 */
const TOC_MIN_CHAPTERS = 2;

export async function buildBook(opened: OpenedBook): Promise<Book> {
  const { source, identity } = opened;

  if (source.format === "epub") {
    return buildEpubBook(opened);
  }

  const entries = await source.list();
  const imagePaths = sortImagePaths(
    entries.map((e) => e.path).filter(isImagePath),
  );
  if (imagePaths.length === 0) throw new Error("err.noImages");

  const { pages, chapters } = groupIntoChapters(imagePaths);
  return {
    identity,
    source,
    pages,
    chapters,
    pageCount: pages.length,
    hasToc: chapters.length >= TOC_MIN_CHAPTERS,
    skippedTextPages: 0,
  };
}

async function buildEpubBook(opened: OpenedBook): Promise<Book> {
  const { source, identity } = opened;
  const plan = await planEpubPages(source);
  const imagePaths = plan.imagePaths;
  const pages: BookPage[] = imagePaths.map((path) => ({ path, chapterIndex: 0 }));

  // spine 内容文档 → 目录章节：首图路径映射为页码
  const pageIndexOf = new Map(imagePaths.map((p, i) => [p, i] as const));
  const chapters: BookChapter[] = [];
  for (const ch of plan.spineChapters) {
    if (!ch.firstImage) continue;
    const idx = pageIndexOf.get(ch.firstImage);
    if (idx === undefined) continue;
    if (chapters.length > 0 && idx <= chapters[chapters.length - 1].pageStart) continue;
    if (chapters.length > 0) {
      chapters[chapters.length - 1].pageCount = idx - chapters[chapters.length - 1].pageStart;
    }
    chapters.push({ title: ch.title, pageStart: idx, pageCount: 0 });
  }
  if (chapters.length > 0) {
    chapters[chapters.length - 1].pageCount = pages.length - chapters[chapters.length - 1].pageStart;
    // 每页归属章节索引
    for (let pi = 0, ci = 0; pi < pages.length; pi++) {
      while (ci + 1 < chapters.length && pi >= chapters[ci + 1].pageStart) ci++;
      pages[pi].chapterIndex = ci;
    }
  }

  const hasToc = chapters.length >= TOC_MIN_CHAPTERS;
  return {
    identity,
    source,
    pages,
    chapters: hasToc ? chapters : singleChapter(pages.length),
    pageCount: pages.length,
    hasToc,
    skippedTextPages: plan.textPageCount,
  };
}

function singleChapter(pageCount: number): BookChapter[] {
  return [{ title: "", pageStart: 0, pageCount }];
}

/**
 * 一级目录分章节：
 * - 所有图片同层（根目录或同一子目录）→ 单章节
 * - 否则按一级子目录分组，目录名自然排序；根目录散图归入第一章前?? —— 归入“散页”组并排最前
 */
function groupIntoChapters(imagePaths: string[]): {
  pages: BookPage[];
  chapters: BookChapter[];
} {
  // 是否存在至少一个多于一层的目录差异
  const topLevel = new Set(imagePaths.map((p) => p.split("/")[0]));
  const allNested = imagePaths.every((p) => p.includes("/"));

  if (topLevel.size <= 1 || !allNested) {
    // 单章节
    return {
      pages: imagePaths.map((path) => ({ path, chapterIndex: 0 })),
      chapters: [
        { title: "", pageStart: 0, pageCount: imagePaths.length },
      ],
    };
  }

  // 按一级目录分组；根目录散图（无目录）先归入 "" 组并排最前
  const groups = new Map<string, string[]>();
  for (const p of imagePaths) {
    const top = p.includes("/") ? p.split("/")[0] : "";
    const arr = groups.get(top) ?? [];
    arr.push(p);
    groups.set(top, arr);
  }

  const collator = new Intl.Collator(undefined, { numeric: true });
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return collator.compare(a, b);
  });

  const pages: BookPage[] = [];
  const chapters: BookChapter[] = [];
  for (const key of keys) {
    const groupPaths = sortImagePaths(groups.get(key)!);
    chapters.push({
      title: key,
      pageStart: pages.length,
      pageCount: groupPaths.length,
    });
    for (const p of groupPaths) {
      pages.push({ path: p, chapterIndex: chapters.length - 1 });
    }
  }
  return { pages, chapters };
}
