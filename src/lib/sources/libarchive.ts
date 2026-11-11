// Web 端 RAR/7Z/TAR/CBR 源：libarchive.js（WASM + Worker，懒加载）。
// worker 与 wasm 位于 public/vendor/libarchive/（由 scripts/copy-vendor.mjs 复制）。
import type { BookSource, OpenItem, SourceEntry } from "./types";

// libarchive.js 没有类型导出时的最小类型声明
interface CompressedFile {
  extract(): Promise<File>;
  size: number;
  path?: string;
  name: string;
  isDirectory?: boolean;
}

interface LibarchiveArchive {
  getFilesArray(): Promise<{ file: CompressedFile; path: string }[]>;
}

interface LibarchiveModule {
  Archive: {
    init(opts: { workerUrl: string }): void;
    open(file: Blob): Promise<LibarchiveArchive>;
  };
}

let modulePromise: Promise<LibarchiveModule> | null = null;

/** 懒加载 libarchive.js 并把 worker 指到 public/vendor 下（避免打包器处理 worker）。 */
async function loadLibarchive(): Promise<LibarchiveModule> {
  if (!modulePromise) {
    modulePromise = import("libarchive.js").then((mod) => {
      const m = mod as unknown as LibarchiveModule;
      m.Archive.init({ workerUrl: "/vendor/libarchive/worker-bundle.js" });
      return m;
    });
  }
  return modulePromise;
}

const ARCHIVE_EXTENSIONS = /\.(rar|cbr|7z|cb7|tar|tgz|tbz2?|tar\.gz|tar\.bz2)$/i;

export function isLibarchiveFile(file: File): boolean {
  return ARCHIVE_EXTENSIONS.test(file.name.toLowerCase()) || !/\.[a-z0-9]+$/i.test(file.name);
}

export async function createLibarchiveSource(
  item: OpenItem & { type: "file" },
): Promise<BookSource> {
  const { Archive } = await loadLibarchive();
  const archive = await Archive.open(item.file);

  const fileMap = new Map<string, CompressedFile>();
  const files = await archive.getFilesArray();
  for (const { file } of files) {
    const path = (file.path ?? file.name).replace(/\\/g, "/");
    if (!file.isDirectory) fileMap.set(path, file);
  }

  return {
    format: formatLabel(item.file.name),
    title: item.file.name,
    async list(): Promise<SourceEntry[]> {
      return [...fileMap.entries()].map(([path, f]) => ({ path, size: f.size ?? 0 }));
    },
    async read(path: string): Promise<ArrayBuffer> {
      const entry = fileMap.get(path);
      if (!entry) throw new Error("err.notFound");
      const extracted = await entry.extract();
      return extracted.arrayBuffer();
    },
    async close(): Promise<void> {
      fileMap.clear();
    },
  };
}

function formatLabel(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "rar";
}
