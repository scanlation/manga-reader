// 轻量 toast：useToast() 任意组件调用，<ToastHost/> 在 App.vue 挂一次。
import { reactive } from "vue";

export interface ToastItem {
  id: number;
  message: string;
  /** 可选操作（如“从头开始”） */
  actionLabel?: string;
  action?: () => void;
  /** 毫秒，默认 4000 */
  duration: number;
  /**
   * 阻塞性错误 → Alert 对话框（全屏遮罩 + 居中卡片，点关闭才消失），
   * 且不自动消失。普通提示保持左上角提示条。
   */
  alert?: boolean;
}

interface ToastState {
  items: ToastItem[];
}

export const toastState = reactive<ToastState>({ items: [] });

let nextId = 1;

export function useToast() {
  function show(
    message: string,
    opts?: { actionLabel?: string; action?: () => void; duration?: number; alert?: boolean },
  ) {
    const item: ToastItem = {
      id: nextId++,
      message,
      actionLabel: opts?.actionLabel,
      action: opts?.action,
      duration: opts?.duration ?? 4000,
      alert: opts?.alert,
    };
    // 同一时刻只保留一个 Alert，避免多个遮罩叠放（后来的替换先前）
    if (item.alert) {
      const prev = toastState.items.find((t) => t.alert);
      if (prev) dismiss(prev.id);
    }
    toastState.items.push(item);
    // 超量时丢弃最旧的
    if (toastState.items.length > 4) toastState.items.shift();
    // Alert 不自动消失，用户点关闭才收回
    if (!item.alert) window.setTimeout(() => dismiss(item.id), item.duration);
  }

  function dismiss(id: number) {
    const idx = toastState.items.findIndex((t) => t.id === id);
    if (idx !== -1) toastState.items.splice(idx, 1);
  }

  return { show, dismiss };
}
