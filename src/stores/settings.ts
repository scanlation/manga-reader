// 阅读设置：schema 驱动（见 components/manga-viewer/SettingsPanel.vue），localStorage 持久化。
import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type ReadingBg = "black" | "dark" | "gray" | "white";

/** 阅读模式：单页（翻页）/ 瀑布流（上下拼接连续滚动）/ 双页（左右拼合） */
export type ReadMode = "single" | "waterfall" | "dual";

/** 基准适配模式：按宽度撑满 / 按高度撑满 */
export type FitMode = "fitWidth" | "fitHeight";

export interface ReaderSettings {
  /** 阅读区背景 */
  readingBg: ReadingBg;
  /** 阅读模式：单页 / 瀑布流 */
  readMode: ReadMode;
  /** 基准适配模式（宽度/高度撑满），与设置共同保存、下次打开保持 */
  fitMode: FitMode;
  /** 预加载页数：前后各 N 页（0–5） */
  preloadCount: number;
  /** 安全区宽度：两侧留白合计占窗口宽度的百分比（0–50，步进 5） */
  safeAreaWidth: number;
  /** 定时切页间隔（秒，0 = 关闭，最长 600） */
  autoPageInterval: number;
  /** 双页模式：拼合配对相位偏移（-1 向前错开一页 / 0 默认 / +1 向后错开一页） */
  dualPageOffset: number;
  /** 滚轮翻页（关闭时滚轮滚动放大后的页面；瀑布流下滚轮始终滚动） */
  wheelPageTurn: boolean;
  /** 日漫右开本：翻页方向镜像 */
  rtl: boolean;
}

const STORAGE_KEY = "mtr:settings";

const DEFAULTS: ReaderSettings = {
  readingBg: "black",
  readMode: "single",
  fitMode: "fitHeight",
  preloadCount: 2,
  safeAreaWidth: 0,
  autoPageInterval: 0,
  dualPageOffset: 0,
  wheelPageTurn: true,
  rtl: true,
};

/** 旧版本持久化值的规范化（钳制到现行取值范围）。 */
function normalize(v: ReaderSettings): ReaderSettings {
  v.preloadCount = Math.min(5, Math.max(0, Math.round(v.preloadCount) || 0));
  v.safeAreaWidth = Math.min(50, Math.max(0, Math.round(v.safeAreaWidth / 5) * 5 || 0));
  v.autoPageInterval = Math.min(600, Math.max(0, Math.round(v.autoPageInterval) || 0));
  v.dualPageOffset = Math.min(1, Math.max(-1, Math.round(v.dualPageOffset) || 0));
  if (v.fitMode !== "fitWidth" && v.fitMode !== "fitHeight") v.fitMode = "fitHeight";
  if (v.readMode !== "single" && v.readMode !== "waterfall" && v.readMode !== "dual") {
    v.readMode = "single";
  }
  return v;
}

export const BG_VALUES: Record<ReadingBg, string> = {
  black: "#000000",
  dark: "#17181c",
  gray: "#3a3d44",
  white: "#e9eaee",
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<ReaderSettings>(load());

  function load(): ReaderSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return normalize({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<ReaderSettings>) });
    } catch {
      return { ...DEFAULTS };
    }
  }

  watch(
    settings,
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
      } catch {
        /* 忽略 */
      }
    },
    { deep: true },
  );

  function patch(partial: Partial<ReaderSettings>) {
    Object.assign(settings.value, partial);
  }

  return { settings, patch };
});
