// 阅读页核心状态机：当前书、页码、缩放、页图 blob LRU、预加载、进度写入。
// 错误以 err.* 错误码抛出，由组件经 i18n 转 toast。
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

import type { Book } from "@/lib/book";
import { findHistoryById, findHistoryEntryByUuid, newUuid, type HistoryEntry } from "@/lib/history";
import { dirHandleToFiles, ensureReadPermission, loadHandle } from "@/lib/fs-handles";
import { loadCachedBook, restoreItemFiles, saveCachedBook } from "@/lib/cached-books";
import { webRelativePath } from "@/lib/sources/web-folder";
import { IS_TAURI } from "@/lib/platform";
import { useHistoryStore } from "./history";
import { useSettingsStore } from "./settings";
import type { OpenItem, OpenedBook } from "@/lib/sources/types";
import { openBook } from "@/lib/sources";

export type FitMode = "fitWidth" | "fitHeight";

const ZOOM_MIN = 0.125;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;
const BLOB_LRU_MAX = 24;
const PROGRESS_WRITE_INTERVAL = 500;
/** 双页模式"正常开本"的最大高宽比：超过视为长图，单独显示 */
const DUAL_TALL_ASPECT = 1.8;

export const useMangaViewerStore = defineStore("mangaViewer", () => {
  const historyStore = useHistoryStore();
  const settingsStore = useSettingsStore();

  // ---------- 状态 ----------
  const book = ref<Book | null>(null);
  const pageIndex = ref(0);
  /** 基准适配模式（工具条两个按钮）；高亮只跟随它，缩放不清除 */
  const fitMode = ref<FitMode>("fitWidth");
  /** 当前页的缩放倍率（相对基准适配尺寸），翻页/重置后回到 1 */
  const fitScale = ref(1);
  /** 重置序号：重置缩放时自增，画布据此清除旋转/位移等手工状态 */
  const resetEpoch = ref(0);
  /** 打开时命中历史的位置（供 Reader 展示恢复 toast；null = 无历史） */
  const restoredPage = ref<number | null>(null);
  /** 当前书对应的路由 UUID（`#/manga/<uuid>/<page>`）；无书时为 null */
  const bookUuid = ref<string | null>(null);

  const pageUrls = ref(new Map<number, string>());
  const loadingPages = ref(new Set<number>());
  /** 已探明的页面原始尺寸（双页/瀑布流共用；未探明的页视为正常开本） */
  const pageDims = ref(new Map<number, { w: number; h: number }>());

  let openedRef: OpenedBook | null = null;
  let lastProgressWrite = 0;
  let progressTimer: number | null = null;

  const pageCount = computed(() => book.value?.pageCount ?? 0);
  const currentPage = computed(() => pageIndex.value + 1);
  /** 画布反馈的实际显示百分比（供工具条展示） */
  const canvasPercent = ref<number | null>(null);

  // ---------- 打开 / 关闭 ----------
  /** 打开书籍，返回其身份 id（调用方可用于关联持久化数据，如 FSA 句柄）。 */
  async function open(item: OpenItem): Promise<string> {
    await close();
    const opened = await openBook(item);
    openedRef = opened;
    const built = await import("@/lib/book").then((m) => m.buildBook(opened));
    book.value = built;

    // 命中历史 → 恢复进度
    const hit = findHistoryById(built.identity.id);
    restoredPage.value = hit ? clampPage(hit.lastPage, built.pageCount) : null;
    pageIndex.value = restoredPage.value ?? 0;

    // 路由 UUID：同一文件（identity id 相同）始终复用同一个 UUID
    bookUuid.value = hit?.uuid ?? newUuid();

    // 初始历史条目（含封面）
    historyStore.upsert({
      id: built.identity.id,
      uuid: bookUuid.value,
      title: built.identity.title,
      format: built.identity.format,
      path: built.identity.path,
      pageCount: built.pageCount,
      lastPage: pageIndex.value,
      updatedAt: Date.now(),
    });

    // 懒生成封面（不阻塞打开）
    void makeCover(built);
    void ensurePage(pageIndex.value);
    // 拖放打开的 Web 书籍持久化文件本体（IndexedDB），重启后收藏链接可直接续读
    cacheBookForReopen(built.identity.id, built.identity.title, item);
    return built.identity.id;
  }

  /** 按路由 UUID 重开书籍（收藏夹链接/刷新直开）。成功返回 identity id，无记录/恢复失败返回 null。 */
  async function openByUuid(uuid: string, requestedPage?: number): Promise<string | null> {
    const entry = findHistoryEntryByUuid(uuid);
    if (!entry) return null;
    const ok = await reopenFromHistoryEntry(entry);
    if (!ok) return null;
    if (requestedPage !== undefined) {
      // 直达链接指定页：跳过"恢复进度"提示
      restoredPage.value = null;
      goTo(requestedPage - 1);
    }
    return book.value?.identity.id ?? null;
  }

  /** 按历史记录 id 恢复书籍（着陆页"最近打开"点击重开）。 */
  async function openFromHistoryId(entryId: string): Promise<boolean> {
    const entry = findHistoryById(entryId);
    if (!entry) return false;
    return reopenFromHistoryEntry(entry);
  }

  /** 从历史记录恢复书籍：Tauri 走记录路径；Web 依次尝试 FSA 句柄、IndexedDB 文件缓存。 */
  async function reopenFromHistoryEntry(entry: HistoryEntry): Promise<boolean> {
    try {
      if (IS_TAURI && entry.path) {
        await open({ type: "path", path: entry.path });
        return true;
      }
      // 1) File System Access 句柄（选择器打开的文件/文件夹）
      const handle = await loadHandle(entry.id);
      if (handle && (await ensureReadPermission(handle))) {
        if ((handle as { kind?: string }).kind === "file") {
          const file = await (handle as { getFile(): Promise<File> }).getFile();
          await open({ type: "file", file });
          return true;
        }
        const entries = await dirHandleToFiles(handle as Parameters<typeof dirHandleToFiles>[0]);
        if (entries.length > 0) {
          await open({ type: "webDir", entries });
          return true;
        }
      }
      // 2) 拖放书籍的 IndexedDB 文件本体缓存
      const cache = await loadCachedBook(entry.id);
      if (cache) {
        const { kind, files } = restoreItemFiles(cache);
        if (kind === "file") await open({ type: "file", file: files[0] });
        else await open({ type: "webDir", entries: files });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function close(): Promise<void> {
    // 先写入进度
    if (progressTimer !== null) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
    if (autoPageTimer !== null) {
      clearInterval(autoPageTimer);
      autoPageTimer = null;
    }
    flushProgress(true);
    if (openedRef) {
      const s = openedRef.source;
      openedRef = null;
      try {
        await s.close();
      } catch {
        /* 忽略 */
      }
    }
    book.value = null;
    pageIndex.value = 0;
    restoredPage.value = null;
    bookUuid.value = null;
    canvasPercent.value = null;
    clearPageDims();
    for (const url of pageUrls.value.values()) {
      URL.revokeObjectURL(url);
    }
    pageUrls.value = new Map();
    loadingPages.value = new Set();
  }

  // ---------- 页图 ----------
  async function ensurePage(index: number): Promise<string | null> {
    const b = book.value;
    if (!b || index < 0 || index >= b.pageCount) return null;
    const cached = pageUrls.value.get(index);
    if (cached) return cached;
    if (loadingPages.value.has(index)) return null;
    loadingPages.value.add(index);
    try {
      const page = b.pages[index];
      const buf = await b.source.read(page.path);
      const blob = new Blob([buf], { type: sniffImageMime(page.path) });
      const url = URL.createObjectURL(blob);
      pageUrls.value.set(index, url);
      evictOldPages(index);
      return url;
    } finally {
      loadingPages.value.delete(index);
    }
  }

  function evictOldPages(current: number) {
    if (pageUrls.value.size <= BLOB_LRU_MAX) return;
    // 淘汰距离当前页最远的已加载页
    const entries = [...pageUrls.value.keys()].sort(
      (a, b) => Math.abs(b - current) - Math.abs(a - current),
    );
    while (pageUrls.value.size > BLOB_LRU_MAX && entries.length > 0) {
      const victim = entries.shift()!;
      const url = pageUrls.value.get(victim);
      if (url) URL.revokeObjectURL(url);
      pageUrls.value.delete(victim);
    }
  }

  function sniffImageMime(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    switch (ext) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      case "avif":
        return "image/avif";
      case "bmp":
        return "image/bmp";
      case "svg":
        return "image/svg+xml";
      default:
        return "application/octet-stream";
    }
  }

  /** 本会话已写入缓存的书籍 id（避免每次打开重复写大文件） */
  const cachedThisSession = new Set<string>();

  /** 把拖放/Web 打开的书籍文件持久化到 IndexedDB（Tauri 路径书无需）。 */
  function cacheBookForReopen(id: string, title: string, item: OpenItem): void {
    if (item.type === "path" || cachedThisSession.has(id)) return;
    cachedThisSession.add(id);
    if (item.type === "file") {
      void saveCachedBook(id, title, "file", [{ path: item.file.name, file: item.file }]);
    } else if (item.type === "webDir") {
      void saveCachedBook(
        id,
        title,
        "webDir",
        item.entries.map((f) => ({ path: webRelativePath(f), file: f })),
      );
    }
  }

  async function makeCover(b: Book) {
    try {
      const url = await ensurePage(0);
      if (!url) return;
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = 96;
      const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      historyStore.upsert({
        id: b.identity.id,
        uuid: bookUuid.value ?? newUuid(),
        title: b.identity.title,
        format: b.identity.format,
        path: b.identity.path,
        pageCount: b.pageCount,
        lastPage: pageIndex.value,
        cover: dataUrl,
        updatedAt: Date.now(),
      });
    } catch {
      /* 封面失败不影响阅读 */
    }
  }

  // ---------- 翻页 ----------
  function clampPage(page: number, count: number): number {
    if (count <= 0) return 0;
    return Math.min(count - 1, Math.max(0, page));
  }

  function goTo(index: number) {
    const b = book.value;
    if (!b) return;
    const clamped = clampPage(index, b.pageCount);
    if (clamped === pageIndex.value) return;
    // 切页即回到基准适配（新页面不继承上一页的手工缩放）
    fitScale.value = 1;
    pageIndex.value = clamped;
    flushProgress(false);
    void ensurePage(clamped);
    preloadAround(clamped);
  }

  /** 双页模式的视单元：配对相位受 dualPageOffset 影响（-1 从第 1 页起配对 /
   *  0 默认（封面单独，从第 2 页起）/ +1 再向后错开一页）；开本异常（长图）的页
   *  单独显示，其配对页也单独显示以保持配对相位（日漫/普通镜像均成立）。 */
  const dualUnits = computed<number[][]>(() => {
    const b = book.value;
    if (!b || b.pageCount === 0) return [];
    const tall = (i: number) => {
      const d = pageDims.value.get(i);
      return !!d && d.h / d.w > DUAL_TALL_ASPECT;
    };
    // 配对起点：-1 → 0-based 0（封面并入拼页）；0 → 1（封面单独）；+1 → 2（封面与第 2 页单独）
    const start = Math.min(
      Math.max(0, 1 + Math.max(-1, Math.min(1, settingsStore.settings.dualPageOffset))),
      b.pageCount,
    );
    const units: number[][] = [];
    for (let i = 0; i < start; i++) units.push([i]);
    let i = start;
    while (i < b.pageCount) {
      const hasNext = i + 1 < b.pageCount;
      if (tall(i) || (hasNext && tall(i + 1))) {
        // 配对中任一页为长图 → 两页都单独显示（保住后续配对相位）
        units.push([i]);
        if (hasNext) units.push([i + 1]);
        i += hasNext ? 2 : 1;
      } else if (hasNext) {
        units.push([i, i + 1]);
        i += 2;
      } else {
        units.push([i]); // 末尾落单页
        i += 1;
      }
    }
    return units;
  });

  /** 页码所属视单元的下标（二分；单元按起始页有序）。 */
  function unitIndexForPage(pageIndex: number): number {
    const units = dualUnits.value;
    if (units.length === 0) return 0;
    let lo = 0;
    let hi = units.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (units[mid][0] <= pageIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function clearPageDims() {
    pageDims.value = new Map();
  }

  /** 当前单元是否为第一个（双页按单元判定；其余按页判定），供箭头禁用。 */
  const navAtStart = computed(() => {
    const b = book.value;
    if (!b) return true;
    if (settingsStore.settings.readMode === "dual") {
      return unitIndexForPage(pageIndex.value) <= 0;
    }
    return pageIndex.value <= 0;
  });

  /** 当前单元是否为最后一个，供箭头禁用。 */
  const navAtEnd = computed(() => {
    const b = book.value;
    if (!b) return true;
    if (settingsStore.settings.readMode === "dual") {
      return unitIndexForPage(pageIndex.value) >= dualUnits.value.length - 1;
    }
    return pageIndex.value >= b.pageCount - 1;
  });

  function nextPage() {
    // 双页模式：以视单元为单位整体切换（当前两页同时切出）
    if (settingsStore.settings.readMode === "dual") {
      const units = dualUnits.value;
      const idx = unitIndexForPage(pageIndex.value);
      if (idx >= units.length - 1) return;
      goTo(units[idx + 1][0]);
      return;
    }
    goTo(pageIndex.value + 1);
  }

  function prevPage() {
    if (settingsStore.settings.readMode === "dual") {
      const units = dualUnits.value;
      const idx = unitIndexForPage(pageIndex.value);
      if (idx <= 0) return;
      goTo(units[idx - 1][0]);
      return;
    }
    goTo(pageIndex.value - 1);
  }

  /**
   * 瀑布流模式：滚动驱动的当前页更新（不重置缩放、不动滚动位置）。
   * 由画布在视口中心跨页时调用；URL/进度/工具条随 pageIndex 响应式同步。
   */
  function setCurrentFromScroll(index: number) {
    const b = book.value;
    if (!b) return;
    const clamped = clampPage(index, b.pageCount);
    if (clamped === pageIndex.value) return;
    pageIndex.value = clamped;
    flushProgress(false);
  }

  /** 双向预载：[center-before, center+after] 范围内的页图（瀑布流用）。 */
  function preloadRange(center: number, before: number, after: number) {
    const b = book.value;
    if (!b) return;
    const from = Math.max(0, center - Math.max(0, before));
    const to = Math.min(b.pageCount - 1, center + Math.max(0, after));
    for (let i = from; i <= to; i++) void ensurePage(i);
  }

  function preloadAround(index: number) {
    const b = book.value;
    if (!b) return;
    // 前后各 N 页统一预载（0–5）
    const n = Math.max(0, Math.min(5, settingsStore.settings.preloadCount));
    for (let d = 1; d <= n; d++) {
      const after = index + d;
      const before = index - d;
      if (after < b.pageCount) void ensurePage(after);
      if (before >= 0) void ensurePage(before);
    }
  }

  function flushProgress(force: boolean) {
    const b = book.value;
    if (!b) return;
    const now = Date.now();
    if (!force && now - lastProgressWrite < PROGRESS_WRITE_INTERVAL) {
      // 尾随写入：窗口内的最后一次变化也要落盘（浏览器关闭前由 pagehide 兜底）
      if (progressTimer === null) {
        progressTimer = window.setTimeout(() => {
          progressTimer = null;
          flushProgress(true);
        }, PROGRESS_WRITE_INTERVAL - (now - lastProgressWrite) + 10);
      }
      return;
    }
    lastProgressWrite = now;
    historyStore.setProgress(b.identity.id, pageIndex.value);
  }

  // ---------- 定时切页 ----------
  let autoPageTimer: number | null = null;

  /** 按 autoPageInterval 同步"每隔 N 秒切换下一页"定时器（0 秒或无书 = 关闭）。 */
  function syncAutoPageTimer() {
    if (autoPageTimer !== null) {
      clearInterval(autoPageTimer);
      autoPageTimer = null;
    }
    const seconds = Math.min(600, Math.max(0, settingsStore.settings.autoPageInterval));
    if (!book.value || seconds <= 0) return;
    autoPageTimer = window.setInterval(() => {
      nextPage();
    }, seconds * 1000);
  }

  watch(
    [() => settingsStore.settings.autoPageInterval, book],
    () => syncAutoPageTimer(),
  );

  // ---------- 适配与缩放 ----------
  /** 切换基准适配模式。仅改变基准，不动手工缩放倍率与高亮。 */
  function setMode(mode: FitMode) {
    fitMode.value = mode;
  }

  /** 设置当前页缩放倍率（越界裁剪；画布/捏合共用入口）。 */
  function setFitScale(value: number) {
    fitScale.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  }

  function zoomIn() {
    setFitScale(fitScale.value * ZOOM_STEP);
  }

  function zoomOut() {
    setFitScale(fitScale.value / ZOOM_STEP);
  }

  /** 重置：缩放回 1 并自增重置序号（画布清除旋转/位移），回到基准适配原始展示。 */
  function zoomReset() {
    fitScale.value = 1;
    resetEpoch.value++;
  }

  /** 显示百分比：统一取画布反馈实际值（基准 × 手工倍率）。 */
  function percentLabel(): number {
    return Math.round(canvasPercent.value ?? 100);
  }

  /** 立即写入进度（绕过节流；页面卸载/关闭时用）。 */
  function flushProgressNow() {
    flushProgress(true);
  }

  return {
    book,
    pageIndex,
    currentPage,
    pageCount,
    fitMode,
    fitScale,
    resetEpoch,
    restoredPage,
    bookUuid,
    pageUrls,
    pageDims,
    canvasPercent,
    dualUnits,
    navAtStart,
    navAtEnd,
    open,
    close,
    ensurePage,
    openByUuid,
    openFromHistoryId,
    goTo,
    nextPage,
    prevPage,
    unitIndexForPage,
    clearPageDims,
    setCurrentFromScroll,
    preloadRange,
    setMode,
    setFitScale,
    zoomIn,
    zoomOut,
    zoomReset,
    percentLabel,
    flushProgressNow,
  };
});
