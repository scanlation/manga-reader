// File System Access 桥接：FSA 选择器（弹原生"打开/选择文件夹"对话框）、
// 目录句柄递归展开为 File 集合、读权限申请、以及按书籍 id 持久化句柄（IndexedDB），
// 供 Web 端"最近打开"点击续读。仅 Chromium 系浏览器支持；调用方需回退到 <input> 方案。
// 说明：lib.dom 未收录部分 Chromium 扩展（queryPermission 等），这里用本地接口 + cast 规避。

interface FsFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

interface FsDirHandle {
  kind: "directory";
  name: string;
}

/** Chromium 扩展的权限方法（非标准 DOM API，可选存在）。 */
interface FsPermission {
  queryPermission?(opts?: { mode?: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(opts?: { mode?: "read" | "readwrite" }): Promise<
    "granted" | "denied" | "prompt"
  >;
}

export type FsDirectoryHandle = FsDirHandle & FsPermission;

interface PickerWindow {
  showOpenFilePicker?(opts?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }): Promise<FsFileHandle[]>;
  showDirectoryPicker?(opts?: {
    mode?: "read" | "readwrite";
  }): Promise<FsDirectoryHandle>;
}

/** 目录句柄的迭代能力（lib.dom 类型可能缺失，走 cast）。 */
interface IterableDir extends FsDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FsFileHandle | FsDirectoryHandle]>;
}

/** 展开 FSA 选择文件时使用的留点扩展名（统一在这里维护）。 */
export const BOOK_EXTENSIONS = [".zip", ".cbz", ".epub", ".rar", ".cbr", ".7z", ".tar", ".tgz", ".tbz2"];

export function supportsFsAccess(): boolean {
  const win = window as PickerWindow;
  return typeof win.showOpenFilePicker === "function";
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** FSA 选择单个书籍文件；用户取消返回 null，API 异常抛出由调用方回退。 */
export async function fsPickBookFile(
  description: string,
): Promise<{ file: File; handle: FsFileHandle } | null> {
  const win = window as PickerWindow;
  if (!win.showOpenFilePicker) throw new Error("fsa-unsupported");
  try {
    const [handle] = await win.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description,
          accept: { "application/octet-stream": BOOK_EXTENSIONS },
        },
      ],
    });
    return { file: await handle.getFile(), handle };
  } catch (e) {
    if (isAbort(e)) return null; // 用户取消
    throw e;
  }
}

/** FSA 选择文件夹；用户取消返回 null，API 异常抛出由调用方回退。 */
export async function fsPickBookFolder(): Promise<FsDirectoryHandle | null> {
  const win = window as PickerWindow;
  if (!win.showDirectoryPicker) throw new Error("fsa-unsupported");
  try {
    return await win.showDirectoryPicker({ mode: "read" });
  } catch (e) {
    if (isAbort(e)) return null; // 用户取消
    throw e;
  }
}

/** 目录句柄 → 带相对路径（`根目录名/子路径`，与拖放 _mtrPath 语义一致）的 File 集合。 */
export async function dirHandleToFiles(dir: FsDirectoryHandle): Promise<File[]> {
  const out: File[] = [];
  async function walk(d: FsDirectoryHandle, prefix: string): Promise<void> {
    const iter = (d as IterableDir).entries();
    for await (const entry of iter) {
      const [, child] = entry;
      const path = `${prefix}/${child.name}`;
      if (child.kind === "file") {
        const file = await (child as FsFileHandle).getFile();
        (file as File & { _mtrPath?: string })._mtrPath = path;
        out.push(file);
      } else {
        await walk(child as FsDirectoryHandle, path);
      }
    }
  }
  await walk(dir, dir.name);
  return out;
}

/** 读权限检查：已授权直接通过，否则借用户手势弹授权框。 */
export async function ensureReadPermission(handle: unknown): Promise<boolean> {
  const h = handle as FsPermission;
  try {
    if (h.queryPermission && (await h.queryPermission({ mode: "read" })) === "granted") {
      return true;
    }
    if (!h.requestPermission) return false;
    return (await h.requestPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

// ---------- 句柄持久化（IndexedDB） ----------

const DB_NAME = "mtr-handles";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** 按书籍 id 保存句柄（FileSystemHandle 可结构化克隆持久化）。 */
export async function saveHandle(bookId: string, handle: unknown): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put(handle, bookId));
  } catch {
    /* 句柄保存失败不影响阅读 */
  }
}

/** 按书籍 id 读取句柄；不存在返回 null。 */
export async function loadHandle(bookId: string): Promise<unknown | null> {
  try {
    const found = await withStore<unknown>("readonly", (s) => s.get(bookId));
    return found ?? null;
  } catch {
    return null;
  }
}

/** 清空所有句柄（随"清空记录"一起调用）。 */
export async function clearAllHandles(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch {
    /* 忽略 */
  }
}

/** 删除某本书的句柄（随"批量删除/清空记录"调用）。 */
export async function deleteHandle(bookId: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(bookId));
  } catch {
    /* 忽略 */
  }
}
