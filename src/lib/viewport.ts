// 视口形态检测：横竖屏等随设备旋转动态变化的状态，用 matchMedia 监听保证响应式。
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/**
 * 当前是否竖屏（portrait）。随设备旋转 / 窗口拉伸自动更新。
 * 手机端竖屏不支持双页模式（屏宽不够拼页），据此在阅读页回退为单页。
 */
export function usePortraitOrientation(): Ref<boolean> {
  const mql = window.matchMedia("(orientation: portrait)");
  const portrait = ref(mql.matches);

  function onChange(event: MediaQueryListEvent) {
    portrait.value = event.matches;
  }

  onMounted(() => mql.addEventListener("change", onChange));
  onBeforeUnmount(() => mql.removeEventListener("change", onChange));

  return portrait;
}
