// 外链与项目元信息：开源仓库地址统一在此维护。
import { IS_TAURI } from "./platform";

/** 统一的开源项目仓库地址 */
export const GITHUB_URL = "https://github.com/scanlation/manga-reader";

/**
 * 打开外部链接：
 * - Tauri 桌面端：调用系统默认浏览器（opener 插件），避免在 WebView 内跳走；
 * - Web 端：新标签页打开。
 */
export async function openExternal(url: string): Promise<void> {
  if (IS_TAURI) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
