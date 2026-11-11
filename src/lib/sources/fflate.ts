// Web 端 zip/cbz/epub 源：fflate 同步解包到内存（按需 Uint8Array -> ArrayBuffer）。
// 适合中小文件；RAR/7Z/TAR 走 libarchive.ts。
import { unzipSync } from "fflate";

import type { BookSource, OpenItem } from "./types";

export function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return /\.(zip|cbz|epub|jar)$/.test(name);
}

export async function createZipSource(
  item: OpenItem & { type: "file" },
): Promise<BookSource> {
  let entriesPromise: Promise<Record<string, Uint8Array>> | null = null;

  /** 懒解包（缓存 Promise，list() 与 read() 共用，EPUB 构建只 read() 不 list()）。 */
  function ensure(): Promise<Record<string, Uint8Array>> {
    if (!entriesPromise) {
      entriesPromise = item.file
        .arrayBuffer()
        .then((buf) => unzipSync(new Uint8Array(buf)));
    }
    return entriesPromise;
  }

  return {
    format: formatLabel(item.file.name),
    title: item.file.name,
    async list() {
      const map = await ensure();
      return Object.entries(map)
        .filter(([path]) => !path.endsWith("/"))
        .map(([path, data]) => ({ path, size: data.length }));
    },
    async read(path: string) {
      const map = await ensure();
      const data = map[path];
      if (!data) throw new Error("err.notFound");
      // 拷贝出独立 ArrayBuffer，避免 subarray 共享大缓冲
      return data.slice().buffer;
    },
    async close() {
      entriesPromise = null;
    },
  };
}

function formatLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "zip";
  return /\.(zip|cbz|epub|jar)$/.test(name) ? ext : "zip";
}
