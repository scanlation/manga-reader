// Web 端拖拽文件夹源：拖放时递归展开的 File 列表（相对路径已归一为 / 分隔）。
import type { BookSource, OpenItem, SourceEntry } from "./types";

export function createWebFolderSource(
  item: OpenItem & { type: "webDir" },
): BookSource {
  const title = deriveTitle(item.entries);

  return {
    format: "folder",
    title,
    async list(): Promise<SourceEntry[]> {
      return item.entries.map((f) => ({
        path: webRelativePath(f),
        size: f.size,
      }));
    },
    async read(path: string): Promise<ArrayBuffer> {
      const file = item.entries.find((f) => webRelativePath(f) === path);
      if (!file) throw new Error("err.notFound");
      return file.arrayBuffer();
    },
    async close(): Promise<void> {
      // 无需清理
    },
  };
}

/** webkitRelativePath 或拖拽展开时写入的 _mtrPath 作为相对路径。 */
export function webRelativePath(file: File): string {
  const anyFile = file as File & { _mtrPath?: string };
  const raw =
    anyFile._mtrPath ??
    (file as File & { webkitRelativePath: string }).webkitRelativePath ??
    file.name;
  return raw.replace(/\\/g, "/").replace(/^\//, "");
}

function deriveTitle(entries: File[]): string {
  const first = entries[0];
  const rel = webRelativePath(first);
  const top = rel.split("/")[0];
  return top || "folder";
}
