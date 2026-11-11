// 打开书籍流程 composable：文件选择、文件夹选择、拖放收集、多文件选择弹窗、错误 toast。
// Web 与 Tauri 双端分支都收敛到这里，组件层只调用 pickFiles/pickFolder/openDropped。
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";

import { IS_TAURI } from "@/lib/platform";
import {
  BOOK_EXTENSIONS,
  dirHandleToFiles,
  fsPickBookFile,
  fsPickBookFolder,
  saveHandle,
  supportsFsAccess,
} from "@/lib/fs-handles";
import type { OpenItem } from "@/lib/sources";
import { useMangaViewerStore } from "@/stores/mangaViewer";
import { useToast } from "@/components/ui/useToast";

interface DraggableFile extends File {
  _mtrPath?: string;
}

export function useOpenFlow() {
  const { t } = useI18n();
  const router = useRouter();
  const readerStore = useMangaViewerStore();
  const toast = useToast();

  const opening = ref(false);
  const pendingItems = ref<OpenItem[]>([]);
  const showPickerModal = computed(() => pendingItems.value.length > 1);

  // ---------- 选择 ----------
  async function pickFiles() {
    if (IS_TAURI) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: false,
        filters: [
          {
            name: t("landing.formatsTitle"),
            extensions: BOOK_EXTENSIONS.map((e) => e.slice(1)),
          },
        ],
      });
      if (typeof picked === "string") {
        await openAndNavigate({ type: "path", path: picked });
      }
      return;
    }

    // Web：优先 File System Access API（弹系统原生"打开"对话框，
    // 避免 <input> 的 webkitdirectory"上传"字样），失败时回退隐形 input
    if (supportsFsAccess()) {
      try {
        const picked = await fsPickBookFile(t("landing.formatsTitle"));
        if (picked) {
          await openAndNavigate({ type: "file", file: picked.file }, picked.handle);
        }
        return;
      } catch {
        /* FSA 不可用 → 回退隐形 input */
      }
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = BOOK_EXTENSIONS.join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await openAndNavigate({ type: "file", file });
    };
    input.click();
  }

  async function pickFolder() {
    if (IS_TAURI) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true });
      if (typeof picked === "string") {
        await openAndNavigate({ type: "path", path: picked });
      }
      return;
    }

    // Web：优先 FSA（原生的"选择文件夹"对话框，无"上传"字样）
    if (supportsFsAccess()) {
      try {
        const dir = await fsPickBookFolder();
        if (dir) {
          const entries = await dirHandleToFiles(dir);
          if (entries.length > 0) {
            await openAndNavigate({ type: "webDir", entries }, dir);
          }
        }
        return;
      } catch {
        /* FSA 不可用 → 回退 webkitdirectory input */
      }
    }

    const input = document.createElement("input");
    input.type = "file";
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      if (files.length === 0) return;
      await openAndNavigate({ type: "webDir", entries: files });
    };
    input.click();
  }

  // ---------- 拖放 ----------
  async function openDropped(dataTransfer: DataTransfer): Promise<void> {
    if (IS_TAURI) {
      // Tauri 端拖放走窗口事件（Landing 绑定 tauri://drag-drop），DataTransfer 为空
      return;
    }
    const items = await webItemsFromDataTransfer(dataTransfer);
    if (items.length === 0) {
      toast.show(t("errors.unsupported"), { alert: true });
      return;
    }
    await openOrOfferChoice(items);
  }

  /** Tauri 拖放事件给出的路径数组。 */
  async function openTauriPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const items: OpenItem[] = [];
    for (const path of paths) {
      let kind = "file";
      try {
        kind = await invoke<string>("path_kind", { path });
      } catch {
        /* 保守按文件处理 */
      }
      if (kind === "missing") continue;
      items.push({ type: "path", path });
    }
    if (items.length === 0) {
      toast.show(t("errors.notFound"), { alert: true });
      return;
    }
    await openOrOfferChoice(items);
  }

  async function openOrOfferChoice(items: OpenItem[]): Promise<void> {
    if (items.length === 1) {
      await openAndNavigate(items[0]);
      return;
    }
    // 多文件：弹出选择列表
    pendingItems.value = items;
  }

  // ---------- 打开 ----------
  async function openAndNavigate(item: OpenItem, handle?: unknown): Promise<void> {
    opening.value = true;
    try {
      const bookId = await readerStore.open(item);
      // Web 端持久化 FSA 句柄，供"最近打开"跨会话续读（PC 端记录 path，无需句柄）
      if (handle && !IS_TAURI) void saveHandle(bookId, handle);
      // 路由 #/manga/<uuid>/<page>，可收藏后直开续读
      const uuid = readerStore.bookUuid;
      if (uuid) await router.push(`/manga/${uuid}/${readerStore.pageIndex + 1}`);
      else await router.push("/");
    } catch (e) {
      // 打开/解析失败影响后续使用 → Alert 对话框
      toast.show(translateError(e), { alert: true });
    } finally {
      opening.value = false;
    }
  }

  /** err.* 错误码 → 当前语言的错误文案；未知错误给通用文案。 */
  function translateError(e: unknown): string {
    const code = e instanceof Error ? e.message : "";
    if (code.startsWith("err.")) {
      const key = `errors.${code.slice(4)}`;
      const translated = t(key);
      return translated === key ? t("errors.openFailed") : translated;
    }
    return t("errors.openFailed");
  }

  function confirmPending(item: OpenItem) {
    pendingItems.value = [];
    void openAndNavigate(item);
  }

  /**
   * Web 端点击"最近打开"续读：统一走 reader store 的记录恢复链路
   * （FSA 句柄 → 拖放缓存文件本体），成功后路由到 `#/manga/<uuid>/<page>`。
   */
  async function reopenWeb(entryId: string): Promise<void> {
    const ok = await readerStore.openFromHistoryId(entryId);
    if (!ok) {
      toast.show(t("landing.historyReopenNoHandle"), { alert: true });
      return;
    }
    const uuid = readerStore.bookUuid;
    if (uuid) await router.push(`/manga/${uuid}/${readerStore.pageIndex + 1}`);
    else await router.push("/");
  }

  function cancelPending() {
    pendingItems.value = [];
  }

  return {
    opening,
    pendingItems,
    showPickerModal,
    pickFiles,
    pickFolder,
    openDropped,
    openTauriPaths,
    confirmPending,
    reopenWeb,
    cancelPending,
    /** 供 DEV fixture 钩子等直接打开条目并导航 */
    openAndNavigate,
  };
}

// ---------- Web 拖拽递归展开 ----------

/** 从 DataTransfer 展开文件/目录为带相对路径的 File 集合。 */
async function webItemsFromDataTransfer(dt: DataTransfer): Promise<OpenItem[]> {
  const entries = entriesFromDataTransfer(dt);

  if (entries.length === 0) {
    // 纯文件列表（无 entry API 支持时）
    const files = [...dt.files];
    return files.map((file) => ({ type: "file", file }));
  }

  const collected: DraggableFile[] = [];
  let dirCount = 0;

  for (const entry of entries) {
    if (entry.isFile) {
      const file = await entryToFile(entry as FileSystemFileEntry, entry.name);
      collected.push(file);
    } else if (entry.isDirectory) {
      dirCount++;
      const dirFiles = await readDirRecursive(entry as FileSystemDirectoryEntry, entry.name);
      collected.push(...dirFiles);
    }
  }

  if (dirCount === 1 && collected.length > 0) {
    // 单个文件夹 → webDir
    return [{ type: "webDir", entries: collected }];
  }
  if (dirCount > 1) {
    // 多个文件夹：按根目录分组，各自包装为 webDir（多选弹窗选择）
    const byRoot = new Map<string, DraggableFile[]>();
    for (const f of collected) {
      const root = f._mtrPath?.split("/")[0] ?? f.name;
      const arr = byRoot.get(root) ?? [];
      arr.push(f);
      byRoot.set(root, arr);
    }
    return [...byRoot.values()].map((group) => ({ type: "webDir", entries: group }));
  }
  return collected.map((file) => ({ type: "file", file }));
}

function entriesFromDataTransfer(dt: DataTransfer): FileSystemEntry[] {
  const out: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i]?.webkitGetAsEntry();
    if (entry) out.push(entry);
  }
  return out;
}

function entryToFile(entry: FileSystemFileEntry, path: string): Promise<DraggableFile> {
  return new Promise((resolve, reject) => {
    entry.file(
      (file) => {
        (file as DraggableFile)._mtrPath = path;
        resolve(file as DraggableFile);
      },
      (err) => reject(err),
    );
  });
}

function readDirRecursive(
  dir: FileSystemDirectoryEntry,
  prefix: string,
): Promise<DraggableFile[]> {
  return new Promise((resolve) => {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (batch.length === 0) {
          // 读完目录，递归子项
          const files: DraggableFile[] = [];
          for (const entry of all) {
            const path = `${prefix}/${entry.name}`;
            if (entry.isFile) {
              try {
                files.push(await entryToFile(entry as FileSystemFileEntry, path));
              } catch {
                /* 跳过 */
              }
            } else if (entry.isDirectory) {
              try {
                files.push(
                  ...(await readDirRecursive(entry as FileSystemDirectoryEntry, path)),
                );
              } catch {
                /* 跳过 */
              }
            }
          }
          resolve(files);
          return;
        }
        all.push(...batch);
        readBatch();
      });
    };
    readBatch();
  });
}
