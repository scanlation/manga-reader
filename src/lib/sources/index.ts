// sources 入口：注册内置 provider 并导出 openBook 统一入口。
// 扩展点：第三方/插件可调用 registerSource() 追加 provider，先注册先匹配。
import { IS_TAURI } from "@/lib/platform";

import { findProvider, registerSource } from "./registry";
import { createTauriSource, hashString } from "./tauri";
import type { BookIdentity, BookSource, OpenItem, OpenedBook } from "./types";
import { createWebFolderSource } from "./web-folder";
import { createZipSource, isZipFile } from "./fflate";
import { createLibarchiveSource, isLibarchiveFile } from "./libarchive";

export type { BookSource, OpenItem, OpenedBook, BookIdentity, SourceEntry } from "./types";
export { registerSource, findProvider } from "./registry";
export { hashString } from "./tauri";

// ---------- 内置 provider ----------

const zipProvider = {
  id: "builtin-zip",
  canOpen(item: OpenItem) {
    return item.type === "file" && isZipFile(item.file);
  },
  create: async (item: OpenItem & { type: "file" }) => createZipSource(item),
};

const libarchiveProvider = {
  id: "builtin-libarchive",
  canOpen(item: OpenItem) {
    return item.type === "file" && isLibarchiveFile(item.file);
  },
  create: createLibarchiveSource,
};

const webFolderProvider = {
  id: "builtin-web-folder",
  canOpen(item: OpenItem) {
    return item.type === "webDir";
  },
  create: async (item: OpenItem & { type: "webDir" }) => createWebFolderSource(item),
};

const tauriProvider = {
  id: "builtin-tauri",
  canOpen(item: OpenItem) {
    return item.type === "path";
  },
  create: async (item: OpenItem & { type: "path" }) => {
    const { source } = await createTauriSource(item);
    return source;
  },
};

registerSource(zipProvider);
registerSource(libarchiveProvider);
registerSource(webFolderProvider);
if (IS_TAURI) registerSource(tauriProvider);

// ---------- 统一入口 ----------

/**
 * 打开书籍。抛出的 Error.message 为 `err.*` 错误码，由调用方经 i18n 展示。
 */
export async function openBook(item: OpenItem): Promise<OpenedBook> {
  const provider = findProvider(item);
  if (!provider) throw new Error("err.unsupported");

  let identity: BookIdentity;
  const source: BookSource = await provider.create(item);

  if (item.type === "path") {
    identity = {
      id: await hashString(`path:${item.path}`),
      title: source.title,
      format: source.format,
      path: item.path,
    };
  } else if (item.type === "file") {
    const f = item.file;
    const lastModified = (f as File & { lastModified: number }).lastModified;
    identity = {
      id: await hashString(`web:${f.name}:${f.size}:${lastModified}`),
      title: f.name,
      format: source.format,
      size: f.size,
    };
  } else {
    const sizeSum = item.entries.reduce((s, f) => s + f.size, 0);
    identity = {
      id: await hashString(`webdir:${source.title}:${sizeSum}`),
      title: source.title,
      format: "folder",
    };
  }

  return { source, identity };
}
