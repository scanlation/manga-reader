// SourceProvider 注册表 —— 扩展点：
// 插件式新增格式 = import { registerSource } 并传入 provider，无需改动本文件其余逻辑。
import type { OpenItem, SourceProvider } from "./types";

const providers: SourceProvider[] = [];

export function registerSource(provider: SourceProvider): void {
  providers.push(provider);
}

export function findProvider(item: OpenItem): SourceProvider | null {
  return providers.find((p) => p.canOpen(item)) ?? null;
}
