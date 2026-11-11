// 快捷键表 —— 扩展点：数据驱动，新增快捷键在 DEFAULT_SHORTCUTS 加一行，
// 处理器在 Reader 中按 action 分发。
export type ShortcutAction =
  | "prevPage"
  | "nextPage"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "fitWidth"
  | "fitHeight"
  | "back"
  | "toggleToc";

export interface ShortcutDef {
  /** KeyboardEvent.key（小写比较） */
  key: string;
  action: ShortcutAction;
  /** 需要按住 Ctrl/Meta */
  ctrl?: boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  { key: "arrowleft", action: "prevPage" },
  { key: "arrowright", action: "nextPage" },
  { key: "pageup", action: "prevPage" },
  { key: "pagedown", action: "nextPage" },
  { key: "=", action: "zoomIn", ctrl: true },
  { key: "+", action: "zoomIn" },
  { key: "-", action: "zoomOut", ctrl: true },
  { key: "0", action: "zoomReset", ctrl: true },
  { key: "w", action: "fitWidth", ctrl: true },
  { key: "h", action: "fitHeight", ctrl: true },
  { key: "escape", action: "back" },
  { key: "t", action: "toggleToc", ctrl: true },
];

export function matchShortcut(
  event: KeyboardEvent,
  shortcuts: ShortcutDef[] = DEFAULT_SHORTCUTS,
): ShortcutAction | null {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  const hit = shortcuts.find((s) => s.key === key && !!s.ctrl === ctrl);
  return hit?.action ?? null;
}
