// 历史记录 store：供着陆页（列表/清空/重开）与阅读页（进度写入）共用。
import { defineStore } from "pinia";
import { ref } from "vue";

import {
  clearHistory,
  loadHistory,
  removeEntries,
  updateProgress,
  upsertHistory,
  type HistoryEntry,
} from "@/lib/history";

export const useHistoryStore = defineStore("history", () => {
  const entries = ref<HistoryEntry[]>(loadHistory());

  function upsert(entry: HistoryEntry) {
    entries.value = upsertHistory(entry);
  }

  function setProgress(id: string, lastPage: number) {
    updateProgress(id, lastPage);
    // 同步内存视图（localStorage 已写）
    const found = entries.value.find((e) => e.id === id);
    if (found) {
      found.lastPage = lastPage;
      found.updatedAt = Date.now();
    }
  }

  /** 批量删除记录。 */
  function remove(ids: string[]) {
    entries.value = removeEntries(ids);
  }

  /** 归档/取消归档：folder 为 null 表示移出文件夹。 */
  function setFolder(id: string, folder: string | null) {
    const found = entries.value.find((e) => e.id === id);
    if (!found) return;
    const updated: HistoryEntry = { ...found, folder: folder ?? undefined, updatedAt: Date.now() };
    entries.value = upsertHistory(updated);
  }

  function clear() {
    clearHistory();
    entries.value = [];
  }

  return { entries, upsert, setProgress, remove, setFolder, clear };
});
