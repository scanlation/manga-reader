<script setup lang="ts">
// 顶部/底部工具条联动显隐。两条工具条共享同一 visible 状态：
// - 桌面端：鼠标进入上/下热区（默认 72px）或悬停工具条时显示，离开 600ms 后淡出；
//   翻页/滚轮 flash() 短暂显示；键鼠按下期间锁定（输入框/滑块拖动等不隐藏）。
// - 触屏：点击屏幕或从边缘向内滑动(≥48px)时显示；点击位置不在两条工具条范围内时立即隐藏。
// 动画只做透明度淡入淡出：定位条不再使用 transform，
// 避免其成为子元素 position:fixed 的包含块（宽度/定位失效）。
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    /** 热区高度 px（距离上/下边缘） */
    hotzone?: number;
    /** 离开后的隐藏延时 ms */
    hideDelay?: number;
  }>(),
  { hotzone: 72, hideDelay: 600 },
);

defineSlots<{
  top(): unknown;
  bottom(): unknown;
}>();

const rootRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const locked = ref(false);
let hideTimer = 0;

function clearTimer() {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
}

function show() {
  clearTimer();
  visible.value = true;
}

function scheduleHide() {
  if (locked.value) return;
  clearTimer();
  hideTimer = window.setTimeout(() => {
    visible.value = false;
  }, props.hideDelay);
}

function hideNow() {
  clearTimer();
  visible.value = false;
}

function inHotzone(y: number): boolean {
  const vh = window.innerHeight;
  return y <= props.hotzone || y >= vh - props.hotzone;
}

function inBars(target: EventTarget | null): boolean {
  return target instanceof Node && rootRef.value?.contains(target) === true;
}

// ---------- 桌面端：指针（鼠标/笔） ----------

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  if (inHotzone(event.clientY)) show();
  else scheduleHide();
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  // 键鼠交互期间锁定显隐（输入框聚焦 / 滑块拖动等）
  locked.value = true;
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  locked.value = false;
  // 释放点不在热区（如点击画布中央）→ 计划隐藏；处于热区/工具条内则保持
  if (visible.value && !inHotzone(event.clientY)) scheduleHide();
}

// ---------- 触屏 ----------

/** 点击显示/隐藏；多指手势（isPrimary=false）不触发 */
function onTouchPointerDown(event: PointerEvent) {
  if (!event.isPrimary) return;
  if (visible.value) {
    // 可见时点击工具条以外区域 → 立即隐藏
    if (!inBars(event.target)) hideNow();
  } else {
    show();
  }
}

// 从屏幕边缘向内滑动显示（单手操作）
const EDGE_ZONE = 28; // 起点距上/下边缘的判定范围
const SWIPE_DIST = 48; // 内滑行程阈值

let swipeBaseY: number | null = null;
let swipeEdge: "top" | "bottom" | null = null;

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  swipeEdge = null;
  const y = event.touches[0].clientY;
  const vh = window.innerHeight;
  if (y <= EDGE_ZONE) swipeEdge = "top";
  else if (y >= vh - EDGE_ZONE) swipeEdge = "bottom";
  swipeBaseY = swipeEdge ? y : null;
}

function onTouchMove(event: TouchEvent) {
  if (!swipeEdge || swipeBaseY === null || event.touches.length !== 1) return;
  const dy = event.touches[0].clientY - swipeBaseY;
  const showNow =
    (swipeEdge === "top" && dy >= SWIPE_DIST) ||
    (swipeEdge === "bottom" && dy <= -SWIPE_DIST);
  if (showNow) {
    show();
    swipeEdge = null; // 本次手势只触发一次
  }
}

function onTouchEnd() {
  swipeEdge = null;
  swipeBaseY = null;
}

// ---------- 外部交互 ----------

/** 翻页时短暂显示两条工具条（外部调用）。 */
function flash() {
  show();
  scheduleHide();
}

onMounted(() => {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointerdown", onTouchPointerDown, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  window.removeEventListener("pointerdown", onTouchPointerDown, { capture: true });
  window.removeEventListener("pointerup", onPointerUp, { capture: true });
  window.removeEventListener("touchstart", onTouchStart);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("touchend", onTouchEnd);
  window.removeEventListener("touchcancel", onTouchEnd);
  clearTimer();
});

defineExpose({ flash, visible });
</script>

<template>
  <div ref="rootRef" class="bars" aria-live="off">
    <div
      class="bars__bar bars__bar--top"
      :class="{ 'bars__bar--visible': visible }"
    >
      <slot name="top" />
    </div>
    <div
      class="bars__bar bars__bar--bottom"
      :class="{ 'bars__bar--visible': visible }"
    >
      <slot name="bottom" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.bars__bar {
  position: fixed;
  left: 0;
  right: 0;
  z-index: var(--z-bars);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;

  // 仅透明度动画：不使用 transform，保证子元素 fixed 定位与宽度不受影响
  &--visible {
    opacity: 1;
    pointer-events: auto;
  }

  &--top {
    top: 0;
  }

  &--bottom {
    bottom: 0;
  }
}
</style>
