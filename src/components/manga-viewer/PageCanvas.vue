<script setup lang="ts">
// 阅读画布：基准适配（fitWidth/fitHeight，store.fitMode）+ 当前页手工变换
// （缩放倍率 store.fitScale、旋转/位移本地状态）。无滚动条：
// 放大与平移全部用 transform 实现，位移按旋转后的包围盒夹取。
// 翻页手势：仅当未做过手工操作（缩放/拖拽/旋转）时，点击左右 25% 区域翻页
// （日漫模式下方向镜像）；工具栏热区（上下 72px）与中带不翻页。
// 翻页或重置后回到基准适配的原始展示。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useMangaViewerStore } from "@/stores/mangaViewer";
import { useSettingsStore, BG_VALUES } from "@/stores/settings";

const props = defineProps<{
  pageUrl: string | null;
}>();

const emit = defineEmits<{
  /** 非缩放滚轮（翻页意图）：deltaY > 0 = 向下/下一页 */
  wheelPage: [direction: 1 | -1];
  /** 点击区域翻页：-1 = 上一页，1 = 下一页（日漫模式已在内部镜像） */
  zonePage: [direction: 1 | -1];
}>();

const reader = useMangaViewerStore();
const settings = useSettingsStore();

const viewportEl = ref<HTMLElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);

const containerW = ref(0);
const containerH = ref(0);
const naturalW = ref(0);
const naturalH = ref(0);
const pageLoaded = ref(false);

const bgColor = computed(() => BG_VALUES[settings.settings.readingBg]);

/** 工具栏热区：该纵向条带内点击不触发区域翻页 */
const HOTZONE = 72;
const DRAG_THRESHOLD = 6;

// ---------- 手工变换（仅作用于当前展示的图片） ----------
const offset = ref({ x: 0, y: 0 });
const rotation = ref(0); // 度
/** 是否发生过手工操作（缩放/拖拽/旋转）；为真时点击区域翻页关闭 */
const manual = ref(false);

function resetTransform() {
  offset.value = { x: 0, y: 0 };
  rotation.value = 0;
  manual.value = false;
}

// 翻页 → 回到原设置；重置缩放 → 回到原设置
watch(() => reader.pageIndex, resetTransform);
watch(() => reader.resetEpoch, resetTransform);
// 缩放倍率偏离 1 即为手工操作状态（工具栏 ±、滚轮、捏合共用）
watch(
  () => reader.fitScale,
  (v) => {
    if (v !== 1) manual.value = true;
  },
);
watch(
  () => [props.pageUrl, reader.fitScale, reader.resetEpoch] as const,
  () => {
    offset.value = clampOffset(offset.value);
  },
);

// ---------- 容器尺寸 ----------
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (viewportEl.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        containerW.value = rect.width;
        containerH.value = rect.height;
        offset.value = clampOffset(offset.value);
      }
    });
    resizeObserver.observe(viewportEl.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

let probeToken = 0;

watch(
  () => props.pageUrl,
  (url) => {
    pageLoaded.value = false;
    if (!url) return;
    // 离屏探测自然尺寸：DOM 内 <img> 只有在尺寸已知后才渲染，
    // 不可以在渲染前依赖 @load 取尺寸（会死锁不显示）。
    const token = ++probeToken;
    const probe = new Image();
    probe.onload = () => {
      if (token !== probeToken || props.pageUrl !== url) return;
      naturalW.value = probe.naturalWidth;
      naturalH.value = probe.naturalHeight;
      pageLoaded.value = true;
      void nextTick(reportPercent);
    };
    probe.src = url;
  },
  { immediate: true },
);

function onImgLoad() {
  if (naturalW.value > 0) return;
  const img = imgEl.value;
  if (!img) return;
  naturalW.value = img.naturalWidth;
  naturalH.value = img.naturalHeight;
  pageLoaded.value = true;
  reportPercent();
}

// ---------- 基准适配尺寸与百分比反馈 ----------
interface RenderBox {
  width: number;
  height: number;
}

/** 安全区：两侧留白合计占窗口宽度的百分比（0–50），fitWidth 以有效宽度为基准 */
const contentWidth = computed(() => {
  const safe = Math.min(50, Math.max(0, settings.settings.safeAreaWidth)) / 100;
  return containerW.value * (1 - safe);
});

const renderBox = computed<RenderBox>(() => {
  if (!pageLoaded.value || naturalW.value === 0 || containerW.value === 0) {
    return { width: 0, height: 0 };
  }
  if (reader.fitMode === "fitWidth") {
    const width = contentWidth.value;
    return { width, height: (width * naturalH.value) / naturalW.value };
  }
  const height = containerH.value;
  return { width: (height * naturalW.value) / naturalH.value, height };
});

function reportPercent() {
  if (!pageLoaded.value || naturalW.value === 0) return;
  const percent = ((renderBox.value.width * reader.fitScale) / naturalW.value) * 100;
  reader.canvasPercent = percent;
}

watch([renderBox, () => reader.fitMode, () => reader.fitScale], () => {
  void nextTick(reportPercent);
});

// ---------- 位移夹取（按旋转后的包围盒） ----------
function maxOffsets(): { x: number; y: number } {
  const box = renderBox.value;
  if (box.width === 0) return { x: 0, y: 0 };
  const rad = (rotation.value * Math.PI) / 180;
  const w = box.width * reader.fitScale;
  const h = box.height * reader.fitScale;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = w * cos + h * sin;
  const bh = w * sin + h * cos;
  return {
    x: Math.max(0, (bw - containerW.value) / 2),
    y: Math.max(0, (bh - containerH.value) / 2),
  };
}

function clampOffset(o: { x: number; y: number }): { x: number; y: number } {
  const m = maxOffsets();
  return {
    x: Math.min(m.x, Math.max(-m.x, o.x)),
    y: Math.min(m.y, Math.max(-m.y, o.y)),
  };
}

const imgTransform = computed(
  () =>
    `translate(${offset.value.x}px, ${offset.value.y}px) rotate(${rotation.value}deg) scale(${reader.fitScale})`,
);

const dragging = ref(false);

// ---------- 指针：拖拽平移 / 双指捏合缩放+旋转 / 点击翻页 ----------
interface ActivePointer {
  x: number;
  y: number;
}
const activePointers = new Map<number, ActivePointer>();

// 单指 / 鼠标拖拽状态
let drag: { startX: number; startY: number; offset: { x: number; y: number }; moved: boolean } | null = null;
// 双指捏合状态
let pinch: {
  dist: number;
  angle: number;
  midX: number;
  midY: number;
  scale: number;
  rotation: number;
  offset: { x: number; y: number };
} | null = null;

function distanceBetween(a: ActivePointer, b: ActivePointer): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleBetween(a: ActivePointer, b: ActivePointer): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function twoPointers(): [ActivePointer, ActivePointer] {
  return [...activePointers.values()].slice(0, 2) as [ActivePointer, ActivePointer];
}

function capturePointer(el: HTMLElement, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* 指针可能已失效，忽略 */
  }
}

function releasePointer(el: HTMLElement, id: number | undefined) {
  if (id === undefined) return;
  try {
    el.releasePointerCapture(id);
  } catch {
    /* capture 未生效，忽略 */
  }
}

function beginPinch() {
  const [a, b] = twoPointers();
  pinch = {
    dist: distanceBetween(a, b),
    angle: angleBetween(a, b),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
    scale: reader.fitScale,
    rotation: rotation.value,
    offset: { ...offset.value },
  };
  drag = null;
  manual.value = true;
}

function onPointerDown(event: PointerEvent) {
  // 鼠标只接受左键（右/中键不参与翻页与拖拽）
  if (event.pointerType === "mouse" && event.button !== 0) return;
  capturePointer(event.currentTarget as HTMLElement, event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 1 && !pinch) {
    drag = { startX: event.clientX, startY: event.clientY, offset: { ...offset.value }, moved: false };
  } else if (activePointers.size === 2) {
    beginPinch();
  }
}

function onPointerMove(event: PointerEvent) {
  const p = activePointers.get(event.pointerId);
  if (!p) return;
  p.x = event.clientX;
  p.y = event.clientY;

  // 双指捏合：缩放 + 旋转 + 中点位移
  if (activePointers.size >= 2 && pinch) {
    const [a, b] = twoPointers();
    const ratio = clamp(distanceBetween(a, b) / pinch.dist, 0.2, 5);
    reader.setFitScale(pinch.scale * ratio);
    rotation.value = pinch.rotation + (angleBetween(a, b) - pinch.angle);
    const dx = (a.x + b.x) / 2 - pinch.midX;
    const dy = (a.y + b.y) / 2 - pinch.midY;
    offset.value = clampOffset({ x: pinch.offset.x + dx, y: pinch.offset.y + dy });
    return;
  }

  // 单指 / 鼠标拖拽平移
  if (drag) {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      drag.moved = true;
      manual.value = true;
      dragging.value = true;
    }
    if (drag.moved) {
      offset.value = clampOffset({ x: drag.offset.x + dx, y: drag.offset.y + dy });
    }
  }
}

function onPointerUp(event: PointerEvent) {
  const had = activePointers.delete(event.pointerId);
  releasePointer(event.currentTarget as HTMLElement, event.pointerId);
  if (!had) return;

  if (activePointers.size === 0) {
    if (drag && !drag.moved) handleTap(event.clientX, event.clientY);
    drag = null;
    pinch = null;
    dragging.value = false;
  } else if (activePointers.size === 1 && pinch) {
    // 双指 → 单指：重置单指状态为一次已按住的拖拽，避免跳变或误触发点击
    const [p] = [...activePointers.values()];
    drag = { startX: p.x, startY: p.y, offset: { ...offset.value }, moved: true };
    pinch = null;
  }
}

// ---------- 点击区域翻页 ----------
function handleTap(x: number, y: number) {
  if (manual.value) return; // 手工操作后，点击区域翻页关闭（翻页/重置后恢复）
  const zone = zoneForClick(x, y);
  if (zone !== null) emit("zonePage", zone);
}

/** 左右 25% 区域 → 翻页方向；日漫模式镜像；工具栏热区与中带返回 null。 */
function zoneForClick(x: number, y: number): 1 | -1 | null {
  const vh = window.innerHeight;
  if (y <= HOTZONE || y >= vh - HOTZONE) return null;
  const w = window.innerWidth;
  const rtl = settings.settings.rtl;
  const inLeft = x <= w * 0.25;
  const inRight = x >= w * 0.75;
  if (inLeft) return rtl ? 1 : -1;
  if (inRight) return rtl ? -1 : 1;
  return null;
}

// ---------- 滚轮：Ctrl/Alt 修饰（缩放/旋转）；普通滚轮（翻页或滚动放大后的页面） ----------
function onWheel(event: WheelEvent) {
  const zoomKey = event.ctrlKey || event.metaKey;
  const rotateKey = event.altKey;
  if (zoomKey || rotateKey) {
    event.preventDefault();
    if (zoomKey) {
      if (event.deltaY < 0) reader.zoomIn();
      else reader.zoomOut();
    } else {
      manual.value = true;
      rotation.value += event.deltaY < 0 ? -15 : 15;
    }
    return;
  }

  if (!settings.settings.wheelPageTurn) {
    // 关闭滚轮翻页：放大后的页面用滚轮移动
    if (reader.fitScale > 1.001) {
      event.preventDefault();
      offset.value = clampOffset({ x: offset.value.x, y: offset.value.y - event.deltaY });
    }
    return;
  }

  // 滚轮翻页：放大后优先内部移动，到边界再翻页
  if (reader.fitScale > 1.001) {
    event.preventDefault();
    const max = maxOffsets();
    const before = offset.value.y;
    if (event.deltaY > 0 && before > -max.y + 2) {
      offset.value = clampOffset({ x: offset.value.x, y: before - event.deltaY });
      return;
    }
    if (event.deltaY < 0 && before < max.y - 2) {
      offset.value = clampOffset({ x: offset.value.x, y: before - event.deltaY });
      return;
    }
  }
  emit("wheelPage", event.deltaY > 0 ? 1 : -1);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
</script>

<template>
  <div
    ref="viewportEl"
    class="canvas"
    :style="{ background: bgColor }"
    :class="{ 'canvas--dragging': dragging }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="canvas__stage">
      <img
        v-if="props.pageUrl"
        ref="imgEl"
        class="canvas__img"
        :style="
          pageLoaded && renderBox.width > 0
            ? {
                width: `${renderBox.width}px`,
                height: `${renderBox.height}px`,
                transform: imgTransform,
              }
            : { visibility: 'hidden' }
        "
        :src="props.pageUrl"
        alt=""
        draggable="false"
        @load="onImgLoad"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas {
  position: absolute;
  inset: 0;
  overflow: hidden; // 不显示滚动条，位移由 transform 控制
  display: grid;
  place-items: center;
  transition: background 0.2s ease;
  touch-action: none; // 手势（拖拽/捏合/旋转）统一由指针事件处理
  cursor: default;

  &--dragging {
    cursor: grabbing;
  }

  &__stage {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  &__img {
    user-select: none;
    -webkit-user-drag: none;
    max-width: none;
    flex-shrink: 0;
    will-change: transform;
    transform-origin: center center;
  }
}
</style>
