<script setup lang="ts">
// 瀑布流画布：连续纵向滚动，当前页上下各拼接 N 页（N=预载设置，最小 1，保证
// 越过边缘时相邻页已拼接就绪）。与单页画布共用 store 与工具条：
// - 未进窗口的页用估算高度的占位（绝对定位，总高 = Σ各页高度），窗口增删页
//   不影响滚动位置；图片加载后以实测尺寸替换估算值。
// - 高度变化（图片加载/缩放/适配模式/容器尺寸）前快照视口锚点（页 idx + 页内
//   比例 + 视口内 y），重排后恢复 scrollTop，滚动位置不跳变。
// - 滚动时以"视口顶边所在页"为当前页（store.pageIndex），URL/进度/滑杆同步；
//   外部跳页（滑杆/输入框/快捷键/目录/恢复进度/点击翻页）→ 精确滚到该页顶边。
// - 缩放（fitScale）与 fitWidth/fitHeight 切换同样走锚点补偿；Ctrl/⌘+滚轮缩放；
//   普通滚轮/触摸原生滚动；点击左右 25% 区域翻页（日漫模式镜像，工具栏热区除外）。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { Loader2 } from "lucide-vue-next";

import { useMangaViewerStore } from "@/stores/mangaViewer";
import { useSettingsStore, BG_VALUES } from "@/stores/settings";

const emit = defineEmits<{
  /** 点击区域翻页：-1 = 上一页，1 = 下一页（日漫模式已在内部镜像） */
  zonePage: [direction: 1 | -1];
}>();

const reader = useMangaViewerStore();
const settings = useSettingsStore();

const scrollerEl = ref<HTMLElement | null>(null);
const containerW = ref(0);
const containerH = ref(0);

const bgColor = computed(() => BG_VALUES[settings.settings.readingBg]);
const bookId = computed(() => reader.book?.identity.id ?? "");

/** 工具栏热区：该纵向条带内点击不触发区域翻页 */
const HOTZONE = 72;
const DRAG_THRESHOLD = 6;
/** 未加载页的估算宽高比（w/h），加载后收敛为实测平均值 */
const DEFAULT_ASPECT = 0.707;
/** 窗口半径：上下各拼接 N 页（preloadCount=0 时保底 1） */
const N = computed(() => Math.max(1, Math.min(5, settings.settings.preloadCount)));

/** 安全区：两侧留白合计占窗口宽度的百分比（0–50），fitWidth 以有效宽度为基准 */
const contentWidth = computed(() => {
  const safe = Math.min(50, Math.max(0, settings.settings.safeAreaWidth)) / 100;
  return containerW.value * (1 - safe);
});

// ---------- 每页几何（实测尺寸存于 store.pageDims，双页模式共享） ----------
const avgAspect = ref(DEFAULT_ASPECT);
let aspectSum = 0;
let aspectCount = 0;

function pageBox(i: number): { w: number; h: number } {
  const d = reader.pageDims.get(i);
  const aspect = d ? d.w / d.h : avgAspect.value;
  if (reader.fitMode === "fitWidth") {
    const w = contentWidth.value * reader.fitScale;
    return { w, h: w / aspect };
  }
  const h = containerH.value * reader.fitScale;
  return { w: h * aspect, h };
}

// ---------- 偏移表（含未加载页的估算高度） ----------
const offsetsRef = ref<number[]>([0]);
const totalH = ref(0);
const sizerW = ref(0);
let offsetsArr: number[] = [0];

function rebuildOffsets() {
  const n = reader.pageCount;
  const arr = new Array<number>(n + 1);
  arr[0] = 0;
  let maxW = 0;
  for (let i = 0; i < n; i++) {
    const box = pageBox(i);
    if (box.w > maxW) maxW = box.w;
    arr[i + 1] = arr[i] + box.h;
  }
  offsetsArr = arr;
  offsetsRef.value = arr;
  totalH.value = arr[n];
  sizerW.value = Math.max(containerW.value, maxW);
}

// ---------- 窗口（当前页 ±N）+ 预载 ----------
const windowIndices = computed(() => {
  const out: number[] = [];
  const from = Math.max(0, reader.pageIndex - N.value);
  const to = Math.min(reader.pageCount - 1, reader.pageIndex + N.value);
  for (let i = from; i <= to; i++) out.push(i);
  return out;
});

// 预载窗口 ±N（显式依赖：书/当前页/N；避免跟踪 pageUrls 导致的反复重跑）
watch(
  () => [bookId.value, reader.pageIndex, N.value] as const,
  () => {
    if (!reader.book) return;
    reader.preloadRange(reader.pageIndex, N.value, N.value);
  },
  { immediate: true },
);

// ---------- 锚点补偿 ----------
let anchor: { idx: number; ratio: number; viewportY: number } | null = null;
/** 跳页锚点：保持该页顶边贴视口顶（ratio=0），直到用户真实滚动才解除 */
let anchorPersistent = false;
/** 捏合等手势已显式指定锚点时，防止通用 watcher 覆盖 */
let anchorLocked = false;
/** 外部跳页目标；relayout 重建偏移表后精确落位 */
let pendingJumpIdx: number | null = null;
let relayoutQueued = false;

function findPageAt(y: number): number {
  const n = reader.pageCount;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsetsArr[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function snapshotAnchor(viewportY = containerH.value / 2) {
  if (anchorPersistent) return; // 跳页锚点优先，不被通用快照覆盖
  const el = scrollerEl.value;
  if (!el || reader.pageCount === 0 || offsetsArr.length < 2) return;
  const y = el.scrollTop + viewportY;
  const idx = findPageAt(y);
  const top = offsetsArr[idx];
  const h = Math.max(1, offsetsArr[idx + 1] - top);
  anchor = { idx, ratio: Math.min(1, Math.max(0, (y - top) / h)), viewportY };
}

/** 锚点对应的 scrollTop 预期值（供用户滚动检测）。 */
function anchorScrollTop(): number | null {
  if (!anchor || offsetsArr.length < 2) return null;
  const idx = Math.min(Math.max(0, anchor.idx), reader.pageCount - 1);
  const top = offsetsArr[idx];
  const h = Math.max(1, offsetsArr[idx + 1] - top);
  return top + anchor.ratio * h - anchor.viewportY;
}

function restoreAnchor() {
  const el = scrollerEl.value;
  if (!el || offsetsArr.length < 2) return;
  const a = anchor;
  if (!a) {
    anchorLocked = false;
    return;
  }
  const idx = Math.min(Math.max(0, a.idx), reader.pageCount - 1);
  const top = offsetsArr[idx];
  const h = Math.max(1, offsetsArr[idx + 1] - top);
  // 用数据而非 DOM 读取最大滚动距离：挂载初期 sizer 高度可能尚未写入 DOM
  const maxScroll = Math.max(0, totalH.value - containerH.value);
  el.scrollTop = Math.min(maxScroll, Math.max(0, top + a.ratio * h - a.viewportY));
  if (!anchorPersistent) {
    anchor = null;
    anchorLocked = false;
  }
}

function jumpTo(idx: number) {
  const el = scrollerEl.value;
  if (!el) return;
  const clamped = Math.min(Math.max(0, idx), reader.pageCount - 1);
  const top = offsetsArr[clamped] ?? 0;
  const maxScroll = Math.max(0, totalH.value - containerH.value);
  el.scrollTop = Math.min(maxScroll, Math.max(0, top));
}

function scheduleRelayout() {
  if (relayoutQueued) return;
  relayoutQueued = true;
  void nextTick(async () => {
    relayoutQueued = false;
    rebuildOffsets();
    // 等 sizer 高度写入 DOM 后再写 scrollTop，否则浏览器会按旧高度 clamp 到 0，
    // 初始定位失败会把画布"掉"回第 1 页（进度随之被滚动跟随改写）
    await nextTick();
    if (pendingJumpIdx !== null) {
      const idx = pendingJumpIdx;
      pendingJumpIdx = null;
      jumpTo(idx);
      // 跳页后锚定该页顶边：后续图片加载/容器变化不移动它，直到用户滚动
      anchor = { idx, ratio: 0, viewportY: 0 };
      anchorPersistent = true;
    } else {
      restoreAnchor();
    }
  });
}

// 基准几何变化（缩放/适配模式/容器尺寸）→ 旧几何快照 + 重排恢复
watch(
  () => [reader.fitScale, reader.fitMode, containerW.value, containerH.value] as const,
  () => {
    if (pendingJumpIdx === null && !anchorLocked && !anchorPersistent) snapshotAnchor();
    scheduleRelayout();
  },
);

// ---------- 滚动 → 当前页（视口顶边所在页） ----------
let scrollDriven = false;
let scrollRaf = 0;

function onScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const el = scrollerEl.value;
    if (!el || !reader.book || reader.pageCount === 0) return;
    // 初始定位/待重排期间忽略滚动跟随：避免挂载瞬间的钳制位置被当成真实阅读位置
    if (jumpWhenReady || pendingJumpIdx !== null || relayoutQueued) return;
    // 用户实际滚动偏离锚点位置 → 解除跳页锚定
    if (anchorPersistent) {
      const expected = anchorScrollTop();
      if (expected !== null && Math.abs(el.scrollTop - expected) > 1.5) {
        anchor = null;
        anchorPersistent = false;
      }
    }
    const idx = findPageAt(el.scrollTop + 1);
    if (idx !== reader.pageIndex) {
      scrollDriven = true;
      reader.setCurrentFromScroll(idx);
    }
  });
}

// 外部跳页（store.goTo：滑杆/输入框/快捷键/目录/恢复进度/点击翻页）
watch(
  () => reader.pageIndex,
  (idx) => {
    if (scrollDriven) {
      scrollDriven = false;
      return;
    }
    if (!reader.book) return;
    pendingJumpIdx = idx;
    jumpTo(idx); // 立即按旧偏移表粗定位，relayout 后精确校正
    scheduleRelayout();
  },
);

// ---------- 打开/换书后落位 ----------
const ready = computed(() => !!reader.book && containerW.value > 0 && reader.pageCount > 0);
let jumpWhenReady = false;

watch(
  () => reader.book?.identity.id ?? null,
  () => {
    reader.clearPageDims();
    aspectSum = 0;
    aspectCount = 0;
    avgAspect.value = DEFAULT_ASPECT;
    pendingJumpIdx = null;
    anchor = null;
    jumpWhenReady = true;
    if (ready.value) {
      jumpWhenReady = false;
      pendingJumpIdx = reader.pageIndex;
      scheduleRelayout();
    }
  },
  { immediate: true },
);

watch(ready, (r) => {
  if (!r || !jumpWhenReady) return;
  jumpWhenReady = false;
  pendingJumpIdx = reader.pageIndex;
  scheduleRelayout();
});

// ---------- 图片加载 → 实测尺寸（写入共享 store.pageDims） ----------
function onImgLoad(idx: number, e: Event) {
  const img = e.target as HTMLImageElement;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const prev = reader.pageDims.get(idx);
  if (prev && prev.w === w && prev.h === h) return;
  if (pendingJumpIdx === null && !anchorLocked && !anchorPersistent) snapshotAnchor();
  reader.pageDims.set(idx, { w, h });
  if (!prev) {
    aspectSum += w / h;
    aspectCount++;
    avgAspect.value = aspectSum / aspectCount;
  }
  scheduleRelayout();
}

// ---------- 缩放反馈（供工具条百分比展示） ----------
watchEffect(() => {
  if (!reader.book || reader.pageCount === 0) return;
  const idx = reader.pageIndex;
  const d = reader.pageDims.get(idx);
  if (!d || d.w === 0) return;
  reader.canvasPercent = (pageBox(idx).w / d.w) * 100;
});

// ---------- 滚轮：Ctrl/⌘ 缩放；普通滚轮原生滚动 ----------
function onWheel(event: WheelEvent) {
  if (!(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  if (event.deltaY < 0) reader.zoomIn();
  else reader.zoomOut();
}

// ---------- 指针：点击区域翻页 / 双指捏合缩放 ----------
interface ActivePointer {
  x: number;
  y: number;
}
const activePointers = new Map<number, ActivePointer>();
let tap: { x: number; y: number; moved: boolean } | null = null;
let pinch: { dist: number; scale: number } | null = null;

function twoPointers(): [ActivePointer, ActivePointer] {
  return [...activePointers.values()].slice(0, 2) as [ActivePointer, ActivePointer];
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    tap = { x: event.clientX, y: event.clientY, moved: false };
  } else if (activePointers.size === 2) {
    tap = null;
    const [a, b] = twoPointers();
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    pinch = { dist, scale: reader.fitScale };
    // 以捏合中点为缩放锚点（比例与等比缩放无关，快照一次即可）
    const rect = scrollerEl.value?.getBoundingClientRect();
    if (rect && dist > 0) {
      snapshotAnchor((a.y + b.y) / 2 - rect.top);
      anchorLocked = true;
      scheduleRelayout();
    }
  }
}

function onPointerMove(event: PointerEvent) {
  const p = activePointers.get(event.pointerId);
  if (!p) return;
  p.x = event.clientX;
  p.y = event.clientY;
  if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > DRAG_THRESHOLD) {
    tap.moved = true;
  }
  if (activePointers.size >= 2 && pinch && pinch.dist > 0) {
    const [a, b] = twoPointers();
    reader.setFitScale(pinch.scale * (Math.hypot(b.x - a.x, b.y - a.y) / pinch.dist));
  }
}

function onPointerUp(event: PointerEvent) {
  if (!activePointers.delete(event.pointerId)) return;
  if (activePointers.size === 0) {
    if (!pinch && tap && !tap.moved) handleTap(event.clientX, event.clientY);
    pinch = null;
    tap = null;
  } else if (activePointers.size === 1) {
    // 双指 → 单指：不触发点击
    pinch = null;
    tap = null;
  }
}

function onPointerCancel(event: PointerEvent) {
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) {
    pinch = null;
    tap = null;
  }
}

/** 左右 25% 区域 → 翻页方向；日漫模式镜像；工具栏热区与中带不翻页。 */
function handleTap(x: number, y: number) {
  const vh = window.innerHeight;
  if (y <= HOTZONE || y >= vh - HOTZONE) return;
  const w = window.innerWidth;
  const rtl = settings.settings.rtl;
  if (x <= w * 0.25) {
    emit("zonePage", rtl ? 1 : -1);
  } else if (x >= w * 0.75) {
    emit("zonePage", rtl ? -1 : 1);
  }
}

// ---------- 容器尺寸 ----------
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = scrollerEl.value;
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
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
});

function pageStyle(idx: number) {
  const box = pageBox(idx);
  return {
    top: `${offsetsRef.value[idx] ?? 0}px`,
    width: `${box.w}px`,
    height: `${box.h}px`,
  };
}
</script>

<template>
  <div
    ref="scrollerEl"
    class="wf"
    tabindex="0"
    :style="{ background: bgColor }"
    @scroll="onScroll"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div class="wf__sizer" :style="{ width: `${sizerW}px`, height: `${totalH}px` }">
      <div
        v-for="idx in windowIndices"
        :key="`${bookId}:${idx}`"
        class="wf__page"
        :style="pageStyle(idx)"
      >
        <div v-if="!reader.pageUrls.get(idx) || !reader.pageDims.get(idx)" class="wf__loading">
          <Loader2 class="wf__spinner" :size="24" />
        </div>
        <img
          v-if="reader.pageUrls.get(idx)"
          class="wf__img"
          :src="reader.pageUrls.get(idx)!"
          :style="{ visibility: reader.pageDims.get(idx) ? 'visible' : 'hidden' }"
          alt=""
          draggable="false"
          @load="onImgLoad(idx, $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wf {
  position: absolute;
  inset: 0;
  overflow: auto;
  overflow-anchor: none; // 位置稳定性由锚点补偿负责，禁用浏览器滚动锚定
  overscroll-behavior: contain;
  touch-action: pan-x pan-y; // 滚动交给原生，手势只处理点按/捏合
  outline: none;
  transition: background 0.2s ease;

  &__sizer {
    position: relative;
  }

  &__page {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
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

  &__spinner {
    animation: wf-spin 1s linear infinite;
    color: var(--accent);
  }
}

@keyframes wf-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
