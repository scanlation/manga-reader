// PC（Tauri）端源：全部委托给 Rust 命令（open_source / read_entry / close_source）。
// invoke read_entry 返回 ArrayBuffer（Rust 侧用 ipc::Response 直传字节）。
import { invoke } from "@tauri-apps/api/core";

import type { BookIdentity, BookSource, OpenItem, SourceEntry } from "./types";

interface RustEntry {
  path: string;
  size: number;
  isDir: boolean;
}

interface RustOpenResult {
  handle: number;
  format: string;
  kind: string;
  entries: RustEntry[];
}

export async function createTauriSource(item: OpenItem & { type: "path" }): Promise<{
  source: BookSource;
  identity: BookIdentity;
}> {
  const result = await invoke<RustOpenResult>("open_source", { path: item.path });

  const source: BookSource = {
    format: result.format,
    title: fileNameOf(item.path),
    async list(): Promise<SourceEntry[]> {
      return result.entries
        .filter((e) => !e.isDir)
        .map((e) => ({ path: e.path, size: e.size }));
    },
    async read(path: string): Promise<ArrayBuffer> {
      const buf = await invoke<ArrayBuffer>("read_entry", {
        handle: result.handle,
        path,
      });
      return buf;
    },
    async close(): Promise<void> {
      try {
        await invoke("close_source", { handle: result.handle });
      } catch {
        // 句柄可能已随应用退出清理
      }
    },
  };

  const identity: BookIdentity = {
    id: await hashString(`path:${item.path}`),
    title: fileNameOf(item.path),
    format: result.format,
    path: item.path,
  };

  return { source, identity };
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** FNV-1a 64bit 转 hex —— 轻量稳定 hash，用于历史记录 id。 */
export async function hashString(input: string): Promise<string> {
  let h1 = 0xcbf29ce484222325n;
  const fnvPrime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    h1 ^= BigInt(input.charCodeAt(i));
    h1 = (h1 * fnvPrime) & 0xffffffffffffffffn;
  }
  return h1.toString(16).padStart(16, "0");
}
