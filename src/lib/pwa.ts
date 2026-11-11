// PWA 离线模式：Service Worker 注册入口。
// 仅在生产构建 + 浏览器安全上下文（https 或本机回环）注册：
// - dev 下资源由 Vite 内存供给，SW 缓存会干扰 HMR；
// - Tauri 桌面端资源本地加载，天然离线，无需 SW；
// - file:// / 非安全 http 下浏览器本身拒绝注册，静默跳过。
import { IS_TAURI } from "./platform";

function isSecureContext(): boolean {
  if (window.isSecureContext) return true;
  // 部分场景 isSecureContext 判定不含回环域名时兜底
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

export function registerServiceWorker(): void {
  if (IS_TAURI || !import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator) || !isSecureContext()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 离线能力注册失败不影响在线使用 */
    });
  });
}
