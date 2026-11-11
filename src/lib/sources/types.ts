// 书籍源抽象：所有格式（压缩包/文件夹/PC 端路径）统一为可 list/read/close 的源。
// 新增格式：实现 BookSource + SourceProvider，然后在 registry.ts 注册即可，无需改分发逻辑。

/** 统一的打开输入：Web 文件 / PC 路径 / Web 文件夹句柄 */
export type OpenItem =
  | { type: "file"; file: File }
  | { type: "path"; path: string } // PC 端（Tauri）：文件或文件夹路径
  | { type: "webDir"; entries: File[] }; // Web 拖拽文件夹展开后的文件集合

export interface SourceEntry {
  path: string; // 相对路径，`/` 分隔
  size: number;
}

export interface BookSource {
  /** 格式标签（zip/cbz/epub/rar/7z/tar/folder...），用于展示与历史记录 */
  readonly format: string;
  /** 展示用标题（文件名或文件夹名） */
  readonly title: string;
  /** 全部文件条目（含目录内所有文件，未过滤） */
  list(): Promise<SourceEntry[]>;
  /** 读取单个条目 */
  read(path: string): Promise<ArrayBuffer>;
  close(): Promise<void>;
}

/** 打开结果：源 + 身份信息 */
export interface OpenedBook {
  source: BookSource;
  /** 用于历史记录匹配的身份 id（PC: 路径 hash；Web: 名称+大小 hash） */
  identity: BookIdentity;
}

export interface BookIdentity {
  id: string;
  title: string;
  format: string;
  /** PC 端才有完整路径，可用于“点击历史直接重开” */
  path?: string;
  size?: number;
}

export interface SourceProvider {
  /** 扩展点 id，如 "fflate-zip" */
  id: string;
  /** 优先级：注册表按顺序尝试，先匹配先用 */
  canOpen(item: OpenItem): boolean;
  create(item: OpenItem): Promise<BookSource>;
}
