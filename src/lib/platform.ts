// 平台检测：Tauri 桌面端 vs 纯浏览器。
interface TauriGlobal {
  __TAURI_INTERNALS__?: unknown;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as TauriGlobal).__TAURI_INTERNALS__;
}

export const IS_TAURI = isTauri();
