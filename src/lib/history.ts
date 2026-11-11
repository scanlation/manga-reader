// 历史与进度记录：localStorage 持久化，按书籍 id 匹配。
const HISTORY_KEY = "mtr:history";
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  /** 稳定 id（PC: 路径 hash；Web: 名称+大小+修改时间 hash） */
  id: string;
  /** 路由用 UUID（`#/manga/<uuid>/<page>`，首次打开生成后跟随记录） */
  uuid: string;
  title: string;
  format: string;
  /** PC 端才有：点击历史直接重开 */
  path?: string;
  pageCount: number;
  /** 最后阅读页（0-based 索引） */
  lastPage: number;
  /** 首页缩略图 dataURL（96px 宽，可能为空） */
  cover?: string;
  /** 归档文件夹名（一维标签，无嵌套；未归档为 undefined） */
  folder?: string;
  updatedAt: number;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // 容量溢出（封面过大等）：去掉封面重试一次
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(trimmed.map(({ cover: _cover, ...rest }) => rest)),
      );
    } catch {
      /* 放弃持久化 */
    }
  }
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

/** 打开/更新记录：存在则置顶并更新进度，不存在则插入头部。 */
export function upsertHistory(entry: HistoryEntry): HistoryEntry[] {
  const rest = loadHistory().filter((e) => e.id !== entry.id);
  const next = [entry, ...rest].slice(0, MAX_ENTRIES);
  saveHistory(next);
  return next;
}

/** 批量删除记录，返回删除后的列表（保证搜索/删除并发时基于最新数据）。 */
export function removeEntries(ids: string[]): HistoryEntry[] {
  const set = new Set(ids);
  const next = loadHistory().filter((e) => !set.has(e.id));
  saveHistory(next);
  return next;
}

export function findHistoryById(id: string): HistoryEntry | null {
  return loadHistory().find((e) => e.id === id) ?? null;
}

/** 根据路由 UUID 查找记录。 */
export function findHistoryEntryByUuid(uuid: string): HistoryEntry | null {
  return loadHistory().find((e) => !!e.uuid && e.uuid === uuid) ?? null;
}

/** 生成 UUIDv4（crypto.randomUUID 不可用时手动拼）。 */
export function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  const join = (from: number, to: number) => hex.slice(from, to).join("");
  return `${join(0, 4)}-${join(4, 6)}-${join(6, 8)}-${join(8, 10)}-${join(10, 16)}`;
}

/** 进度节流写入（翻页高频调用时降低 localStorage 写入频率）。 */
export function updateProgress(
  id: string,
  lastPage: number,
): HistoryEntry[] {
  const list = loadHistory();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return list;
  if (list[idx].lastPage === lastPage) return list;
  list[idx] = {
    ...list[idx],
    lastPage,
    updatedAt: Date.now(),
  };
  saveHistory(list);
  return list;
}

