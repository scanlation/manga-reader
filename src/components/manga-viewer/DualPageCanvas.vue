<script setup lang="ts">
// 双页画布：左右拼合显示。视单元来自 store.dualUnits：
// - 封面（第 1 页）永远单独显示；其后按（1-based 偶, 奇）配对；
// - 开本异常（高宽比 > 1.8）的页单独显示，其配对页也单独显示以保持奇偶对位；
// - 单独显示与拼合页均按高度填充（与单页模式"按高度撑满"一致），拼合页无缝并排、整体居中；
// - 日漫（RTL）模式下右侧为偶数页、左侧为其下一个奇数页（flex 反转）；
// - 上一页/下一页以视单元为单位整体切换（store.nextPage/prevPage 已感知）；
// - 缩放 fitScale 作用于整个视单元，放大后可拖拽平移；点击左右 25% 区域翻页
//   （日漫模式镜像），滚轮按 wheelPageTurn 设置翻页，Ctrl/⌘+滚轮缩放。
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { Loader2 } from "lucide-vue-next";

import { useMangaViewerStore } from "@/stores/mangaViewer";
import { useSettingsStore, BG_VALUES } from "@/stores/settings";

const emit = defineEmits<{
  /** 非缩放滚轮（翻页意图）：deltaY > 0 = 下一页 */
  wheelPage: [direction: 1 | -1];
  /** 点击区域翻页：-1 = 上一页，1 = 下一页（日漫模式已在内部镜像） */
  zonePage: [direction: 1 | -1];
}>();

const reader = useMangaViewerStore();
const settings = useSettingsStore();

const stageEl = ref<HTMLElement | null>(null);
const containerW = ref(0);
const containerH = ref(0);

const bgColor = computed(() => BG_VALUES[settings.settings.readingBg]);
const bookId = computed(() => reader.book?.identity.id ?? "");

const HOTZONE = 72;
const DRAG_THRESHOLD = 6;
/** 未探明尺寸时的估算宽高比（w/h） */
const DEFAULT_ASPECT = 0.707;

// ---------- 当前视单元 ----------
const unit = computed<number[]>(() => {
  const idx = reader.unitIndexForPage(reader.pageIndex);
  return reader.dualUnits[idx] ?? [reader.pageIndex];
});

// 换书后重置已加载标记（索引相同也需重新等待图片解码）
watch(bookId, () => {
  loaded.value = new Set();
});

// ---------- 尺寸探测：当前单元 ±2 单元内未探明的页 ----------
const probing = new Set<number>();
const loaded = ref(new Set<number>());

function waitForUrl(idx: number, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const stop = watch(
      () => reader.pageUrls.get(idx),
      (url) => {
        if (!url) return;
        stop();
        clearTimeout(tid);
        resolve(url);
      },
    );
    const tid = window.setTimeout(() => {
      stop();
      resolve(null);
    }, timeoutMs);
  });
}

async function probePage(idx: number) {
  if (probing.has(idx) || reader.pageDims.has(idx)) return;
  probing.add(idx);
  try {
    const url = (await reader.ensurePage(idx)) ?? (await waitForUrl(idx, 8000));
    if (!url) return;
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!reader.pageDims.has(idx)) {
      reader.pageDims.set(idx, { w: img.naturalWidth, h: img.naturalHeight });
    }
  } catch {
    /* 探测失败保持估算，后续可重试 */
  } finally {
    probing.delete(idx);
  }
}

watchEffect(() => {
  if (!reader.book) return;
  const units = reader.dualUnits;
  const cur = reader.unitIndexForPage(reader.pageIndex);
  const from = Math.max(0, cur - 2);
  const to = Math.min(units.length - 1, cur + 2);
  for (let u = from; u <= to; u++) {
    for (const idx of units[u] ?? []) {
      if (!reader.pageDims.has(idx)) void probePage(idx);
    }
  }
});

// ---------- 布局（按高度填充 × fitScale） ----------
const offset = ref({ x: 0, y: 0 });
const manual = ref(false);

function pageW(idx: number): number {
  const d = reader.pageDims.get(idx);
  const aspect = d ? d.w / d.h : DEFAULT_ASPECT;
  return containerH.value * reader.fitScale * aspect;
}

const pageH = computed(() => containerH.value * reader.fitScale);
const unitWidth = computed(() => unit.value.reduce((sum, i) => sum + pageW(i), 0));

function maxOffsets(): { x: number; y: number } {
  if (containerW.value === 0) return { x: 0, y: 0 };
  return {
    x: Math.max(0, (unitWidth.value - containerW.value) / 2),
    y: Math.max(0, (pageH.value - containerH.value) / 2),
  };
}

function clampOffset(o: { x: number; y: number }): { x: number; y: number } {
  const m = maxOffsets();
  return {
    x: Math.min(m.x, Math.max(-m.x, o.x)),
    y: Math.min(m.y, Math.max(-m.y, o.y)),
  };
}

// 视单元变化 / 重置 → 回到基准居中
watch(
  () => unit.value.join(","),
  () => {
    offset.value = { x: 0, y: 0 };
    manual.value = false;
  },
);
watch(() => reader.resetEpoch, () => {
  offset.value = { x: 0, y: 0 };
  manual.value = false;
});
watch(() => reader.fitScale, (v) => {
  if (v !== 1) manual.value = true;
  offset.value = clampOffset(offset.value);
});
watch([containerW, containerH, unitWidth], () => {
  offset.value = clampOffset(offset.value);
});

// ---------- 缩放反馈（供工具条百分比展示） ----------
watchEffect(() => {
  if (!reader.book || reader.pageCount === 0) return;
  const idx = unit.value[0];
  const d = reader.pageDims.get(idx);
  if (!d || d.w === 0) return;
  reader.canvasPercent = (pageW(idx) / d.w) * 100;
});

// ---------- 指针：拖拽平移 / 点击区域翻页 ----------
const dragging = ref(false);
const activePointers = new Map<number, { x: number; y: number }>();
let drag: { startX: number; startY: number; offset: { x: number; y: number }; moved: boolean } | null = null;

function capturePointer(el: HTMLElement, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* 指针可能已失效，忽略 */
  }
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  capturePointer(event.currentTarget as HTMLElement, event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    drag = { startX: event.clientX, startY: event.clientY, offset: { ...offset.value }, moved: false };
  }
}

function onPointerMove(event: PointerEvent) {
  const p = activePointers.get(event.pointerId);
  if (!p || !drag) return;
  p.x = event.clientX;
  p.y = event.clientY;
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

function onPointerUp(event: PointerEvent) {
  const had = activePointers.delete(event.pointerId);
  if (!had) return;
  if (activePointers.size === 0) {
    if (drag && !drag.moved) handleTap(event.clientX, event.clientY);
    drag = null;
    dragging.value = false;
  }
}

function onPointerCancel(event: PointerEvent) {
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) {
    drag = null;
    dragging.value = false;
  }
}

/** 左右 25% 区域 → 翻页方向；日漫模式镜像；工具栏热区与中带不翻页。 */
function handleTap(x: number, y: number) {
  if (manual.value) return; // 手工操作后点击翻页关闭（切页/重置后恢复）
  const vh = window.innerHeight;
  if (y <= HOTZONE || y >= vh - HOTZONE) return;
  const w = window.innerWidth;
  const rtl = settings.settings.rtl;
  const inLeft = x <= w * 0.25;
  const inRight = x >= w * 0.75;
  if (inLeft) {
    emit("zonePage", rtl ? 1 : -1);
  } else if (inRight) {
    emit("zonePage", rtl ? -1 : 1);
  }
}

// ---------- 滚轮：Ctrl/⌘ 缩放；普通滚轮按设置翻页或滚动放大后的画面 ----------
function onWheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    if (event.deltaY < 0) reader.zoomIn();
    else reader.zoomOut();
    return;
  }
  if (!settings.settings.wheelPageTurn) {
    // 关闭滚轮翻页：放大后的画面用滚轮移动
    if (reader.fitScale > 1.001) {
      event.preventDefault();
      offset.value = clampOffset({ x: offset.value.x, y: offset.value.y - event.deltaY });
    }
    return;
  }
  // 滚轮翻页：放大后优先内部移动，到边界再切换视单元
  if (reader.fitScale > 1.001) {
    event.preventDefault();
    const max = maxOffsets();
    if (event.deltaY > 0 && offset.value.y > -max.y + 2) {
      offset.value = clampOffset({ x: offset.value.x, y: offset.value.y - event.deltaY });
      return;
    }
    if (event.deltaY < 0 && offset.value.y < max.y - 2) {
      offset.value = clampOffset({ x: offset.value.x, y: offset.value.y - event.deltaY });
      return;
    }
  }
  emit("wheelPage", event.deltaY > 0 ? 1 : -1);
}

// ---------- 图片加载兜底：探测未及时写入时补记实测尺寸 ----------
function onImgLoad(idx: number, e: Event) {
  loaded.value.add(idx);
  const img = e.target as HTMLImageElement;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h || reader.pageDims.has(idx)) return;
  reader.pageDims.set(idx, { w, h });
}

// ---------- 容器尺寸 ----------
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = stageEl.value;
  if (!el) return;
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (!rect) return;
    containerW.value = rect.width;
    containerH.value = rect.height;
  });
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function pageStyle(idx: number) {
  return {
    width: `${pageW(idx)}px`,
    height: `${pageH.value}px`,
  };
}
</script>

<template>
  <div
    ref="stageEl"
    class="dual"
    :class="{ 'dual--dragging': dragging }"
    :style="{ background: bgColor }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div class="dual__stage">
      <div
        class="dual__spread"
        :class="{ 'dual__spread--rtl': settings.settings.rtl }"
        :style="{ transform: `translate(${offset.x}px, ${offset.y}px)` }"
      >
        <div
          v-for="idx in unit"
          :key="`${bookId}:${idx}`"
          class="dual__page"
          :style="pageStyle(idx)"
        >
          <div v-if="!reader.pageUrls.get(idx) || !loaded.has(idx)" class="dual__loading">
            <Loader2 class="dual__spin" :size="24" />
          </div>
          <img
            v-if="reader.pageUrls.get(idx)"
            class="dual__img"
            :src="reader.pageUrls.get(idx)!"
            :style="{ visibility: loaded.has(idx) ? 'visible' : 'hidden' }"
            alt=""
            draggable="false"
            @load="onImgLoad(idx, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dual {
  position: absolute;
  inset: 0;
  overflow: hidden; // 无滚动条，缩放平移由 transform 控制
  display: grid;
  place-items: center;
  touch-action: none; // 手势统一由指针事件处理
  cursor: default;
  transition: background 0.2s ease;

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

  &__spread {
    display: flex;
    will-change: transform;

    // 日漫模式：DOM 顺序（偶, 奇）反转 → 偶数页在右、奇数页在左
    &--rtl {
      flex-direction: row-reverse;
    }
  }

  &__page {
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
  }

  &__img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-drag: none;
  }

  &__loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-3);
  }

  &__spin {
    animation: dual-spin 1s linear infinite;
    color: var(--accent);
  }
}

@keyframes dual-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
