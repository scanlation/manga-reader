// 浏览器能力检测：着陆页据此展示/隐藏打开方式，路由据此拦截完全不可用的浏览器。
// 仅在浏览器环境求值（SPA 无 SSR），Tauri 桌面端始终视为全能力。
import { IS_TAURI } from "./platform";

interface PickerWindow {
  showDirectoryPicker?: unknown;
}

function isMobileLike(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * 手机类设备（UA 判定）：竖屏下不支持双页模式等设备形态差异据此分支。
 * Tauri 桌面端 UA 不含移动端标识，恒为 false。
 */
export const IS_MOBILE: boolean = isMobileLike();

/**
 * 文件夹读取能力：
 * - Tauri 桌面端：原生目录选择，始终支持；
 * - 桌面 Chromium：showDirectoryPicker（File System Access）；
 * - 桌面 Firefox / Safari：webkitdirectory 隐形 input 兜底；
 * - 移动端：目录选择与目录拖放均不可用 → 隐藏文件夹相关入口与文案。
 */
export const SUPPORTS_FOLDER: boolean =
  IS_TAURI ||
  typeof (window as PickerWindow).showDirectoryPicker === "function" ||
  ("webkitdirectory" in HTMLInputElement.prototype && !isMobileLike());

/**
 * 网页端最低可用能力：RAR/7Z/TAR 解压依赖 Worker + WebAssembly（libarchive.js），
 * 读取依赖 Blob.arrayBuffer。任一缺失即整个网页模式不可用 →
 * 路由守卫统一跳转「暂不支持」页（建议桌面端）。
 */
export const SUPPORTS_WEB_READING: boolean =
  IS_TAURI ||
  (typeof Worker === "function" &&
    typeof WebAssembly === "object" &&
    typeof File === "function" &&
    typeof Blob.prototype.arrayBuffer === "function");
