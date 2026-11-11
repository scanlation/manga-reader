<script setup lang="ts">
// 图片预览面板：左侧单列缩略图，图片下方显示页码；目录中该页所属章节有标题时
// 覆盖页码展示。当前阅读页高亮，打开时自动滚动到其附近；点击行跳页并关闭。
// 缩略图按可视区域懒生成（IntersectionObserver）：ensurePage → canvas 缩放 →
// dataURL —— 与 blob LRU 解耦，缓存挂在模块级（换书失效），重开面板即时复用。
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "lucide-vue-next";

import SidePanel from "@/components/ui/SidePanel.vue";
import { useMangaViewerStore } from "@/stores/mangaViewer";

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const reader = useMangaViewerStore();

const title = computed(() => t("reader.previewPageCount", { total: reader.pageCount }));
const bookId = computed(() => reader.book?.identity.id ?? "");

// ---------- 模块级缩略图缓存（按书失效） ----------
let cacheBookId = "";
const thumbCache = new Map<number, string>();
const thumbs = ref(new Map<number, string>());
const thumbPending = new Set<number>();

watch(bookId, (id) => {
  if (id === cacheBookId) return;
  cacheBookId = id;
  thumbCache.clear();
  thumbs.value = new Map();
});

// ---------- 懒生成 ----------
const listEl = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;

function rowLabel(idx: number): string {
  const page = reader.book?.pages[idx];
  const chapter = page ? reader.book?.chapters[page.chapterIndex] : undefined;
  if (chapter?.title) return chapter.title;
  return String(idx + 1);
}

function isCurrent(idx: number): boolean {
  return idx === reader.pageIndex;
}

/** 等待某页 blob URL 就绪（ensurePage 已在加载中时返回 null）。 */
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

async function genThumb(idx: number) {
  if (thumbCache.has(idx) || thumbPending.has(idx)) return;
  thumbPending.add(idx);
  try {
    const url = (await reader.ensurePage(idx)) ?? (await waitForUrl(idx, 8000));
    if (!url) return;
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = 150;
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    thumbCache.set(idx, dataUrl);
    thumbs.value.set(idx, dataUrl);
  } catch {
    /* 生成失败保持占位，重开面板可重试 */
  } finally {
    thumbPending.delete(idx);
  }
}

function attachObserver() {
  io?.disconnect();
  const list = listEl.value;
  if (!list) return;
  // 以视口为 root：面板是 fixed 全高布局，行在视口内即面板可视，
  // 无需耦合 SidePanel 的内部滚动容器
  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const idx = Number((entry.target as HTMLElement).dataset.idx);
        if (!Number.isNaN(idx)) void genThumb(idx);
        io?.unobserve(entry.target);
      }
    },
    { rootMargin: "400px 0px" },
  );
  for (const el of list.querySelectorAll<HTMLElement>("[data-idx]")) {
    io.observe(el);
  }
}

/** 打开时把当前页滚动到面板可视区中部（行高一致，scrollIntoView 落在面板滚动容器）。 */
function scrollToCurrent() {
  const row = listEl.value?.querySelector<HTMLElement>(`[data-idx="${reader.pageIndex}"]`);
  row?.scrollIntoView({ block: "center" });
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      io?.disconnect();
      io = null;
      return;
    }
    await nextTick();
    scrollToCurrent();
    attachObserver();
  },
);

function jump(idx: number) {
  reader.goTo(idx);
  emit("close");
}

onBeforeUnmount(() => {
  io?.disconnect();
  io = null;
});
</script>

<template>
  <SidePanel :open="props.open" :title="title" side="left" width="300px" @close="emit('close')">
    <ul ref="listEl" class="preview-list">
      <li v-for="i in reader.pageCount" :key="i">
        <button
          class="preview-row"
          :class="{ 'preview-row--current': isCurrent(i - 1) }"
          type="button"
          :data-idx="i - 1"
          @click="jump(i - 1)"
        >
          <span class="preview-row__thumb">
            <img v-if="thumbs.get(i - 1)" :src="thumbs.get(i - 1)" alt="" draggable="false" />
            <Loader2 v-else class="preview-row__spin" :size="16" />
          </span>
          <span class="preview-row__label" :title="rowLabel(i - 1)">{{ rowLabel(i - 1) }}</span>
        </button>
      </li>
    </ul>
  </SidePanel>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
  @include focus-ring;

  &:hover {
    background: var(--bg-hover);
  }

  &--current {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  &__thumb {
    width: 150px;
    height: 200px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--bg-surface-2);

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      user-select: none;
      -webkit-user-drag: none;
    }
  }

  &__spin {
    animation: preview-spin 1s linear infinite;
    color: var(--text-3);
  }

  &__label {
    @include ellipsis;

    max-width: 100%;
    font-size: 12px;
    color: var(--text-2);
  }

  &--current &__label {
    color: var(--accent);
    font-weight: 600;
  }
}

@keyframes preview-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
