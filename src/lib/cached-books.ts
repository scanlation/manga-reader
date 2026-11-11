// 拖放打开的 Web 书籍持久化缓存：
// 浏览器拖放拿不到 File System Access 句柄，只有内存中的 File；
// 把文件本体存 IndexedDB（File 结构化克隆保留 name/size/lastModified，
// 因此重开时 identity hash 与首次打开完全一致，阅读进度/UUID 不丢）。
// 供"收藏链接 `#/manga/<uuid>` 直开续读"与"最近打开点击重开"共用。
const DB_NAME = "mtr-books";
const STORE = "books";
const VERSION = 1;
/** 最多缓存的书籍个数（按 updatedAt 淘汰最旧） */
const MAX_CACHED_BOOKS = 8;

export interface CachedBook {
  id: string;
  title: string;
  /** 单文件书籍 / 拖拽展开的文件夹书籍 */
  kind: "file" | "webDir";
  /**
   * 文件列表：file 为原 File（结构化克隆，保留 name/lastModified）。
   * path 为书内相对路径——文件夹项由结构化克隆丢掉 _mtrPath，重建时需补回。
   */
  files: Array<{ path: string; file: File }>;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-open-failed"));
  });
  return dbPromise;
}

function requestTo<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-request-failed"));
  });
}

/** 保存/更新书籍缓存；超上限按 updatedAt 淘汰最旧。失败静默（不影响阅读）。 */
export async function saveCachedBook(
  id: string,
  title: string,
  kind: CachedBook["kind"],
  files: Array<{ path: string; file: File }>,
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const now = Date.now();
    await requestTo(store.put({ id, title, kind, files, updatedAt: now } satisfies CachedBook));
    const all: CachedBook[] = await requestTo(store.getAll());
    const others = all.filter((e) => e.id !== id).sort((a, b) => a.updatedAt - b.updatedAt);
    const drop = others.length + 1 > MAX_CACHED_BOOKS ? others.slice(0, others.length + 1 - MAX_CACHED_BOOKS) : [];
    for (const entry of drop) void requestTo(store.delete(entry.id));
  } catch {
    /* 缓存失败不影响阅读 */
  }
}

/** 按书籍 id 读取缓存；缺失/损坏返回 null。 */
export async function loadCachedBook(id: string): Promise<CachedBook | null> {
  try {
    const db = await openDb();
    const entry = (await requestTo(
      db.transaction(STORE).objectStore(STORE).get(id),
    )) as CachedBook | undefined;
    if (!entry || !Array.isArray(entry.files) || entry.files.length === 0) return null;
    return entry;
  } catch {
    return null;
  }
}

/** 删除某本书的缓存（关阅读器不需要删；仅在缓存淘汰/礼貌清理时使用）。 */
export async function deleteCachedBook(id: string): Promise<void> {
  try {
    const db = await openDb();
    await requestTo(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } catch {
    /* 忽略 */
  }
}

/** 重建可直接喂给 reader.open 的 File 集合：file 项与 webDir 项。 */
export function restoreItemFiles(cache: CachedBook): { kind: CachedBook["kind"]; files: File[] } {
  const files = cache.files.map(({ path, file }) => {
    // 克隆回来的 File 元数据齐全；为防止个别浏览器还原成 Blob，这里的 File 构造保证 lastModified 一致
    const restored =
      typeof (file as File).arrayBuffer === "function" && "lastModified" in file
        ? file
        : new File([file], path, { type: file.type, lastModified: file.lastModified });
    if (cache.kind !== "webDir") return restored as File;
    // 结构化克隆丢自定义属性 → 给文件夹项补回 _mtrPath
    Object.defineProperty(restored as File, "_mtrPath", { value: path, configurable: true });
    return restored as File;
  });
  return { kind: cache.kind, files };
}
