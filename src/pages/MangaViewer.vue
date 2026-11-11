<script setup lang="ts">
// 阅读页：画布 + 自动显隐双工具条 + 目录/设置面板 + 快捷键 + 进度恢复提示。
// 路由 `#/manga/:uuid/:page?`：UUID 对应历史记录；可被收藏/刷新直开并续读。
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { Loader2 } from "lucide-vue-next";

import AutoHideBars from "@/components/manga-viewer/AutoHideBars.vue";
import PageCanvas from "@/components/manga-viewer/PageCanvas.vue";
import WaterfallCanvas from "@/components/manga-viewer/WaterfallCanvas.vue";
import DualPageCanvas from "@/components/manga-viewer/DualPageCanvas.vue";
import PreviewPanel from "@/components/manga-viewer/PreviewPanel.vue";
import TopBar from "@/components/manga-viewer/TopBar.vue";
import BottomBar from "@/components/manga-viewer/BottomBar.vue";
import TocPanel from "@/components/manga-viewer/TocPanel.vue";
import SettingsPanel from "@/components/manga-viewer/SettingsPanel.vue";
import RecentPanel from "@/components/manga-viewer/RecentPanel.vue";
import { useToast } from "@/components/ui/useToast";
import { matchShortcut } from "@/lib/shortcuts";
import { IS_MOBILE } from "@/lib/capabilities";
import { usePortraitOrientation } from "@/lib/viewport";
import { useMangaViewerStore } from "@/stores/mangaViewer";
import { useSettingsStore } from "@/stores/settings";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const reader = useMangaViewerStore();
const settings = useSettingsStore();
const toast = useToast();

const tocOpen = ref(false);
const settingsOpen = ref(false);
const previewOpen = ref(false);
const recentOpen = ref(false);
const barsRef = ref<InstanceType<typeof AutoHideBars> | null>(null);
const bottomBarRef = ref<InstanceType<typeof BottomBar> | null>(null);

/** 工具条显隐：驱动左下角页码胶囊的联动动画 */
const barsVisible = computed(() => barsRef.value?.visible ?? false);

// ---------- 页码胶囊进度环 ----------
const RING_R = 15.5;
const ringCircumference = 2 * Math.PI * RING_R;
/** 已读比例：当前页 / 总页数 */
const ringProgress = computed(() => {
  if (!reader.pageCount) return 0;
  return reader.currentPage / reader.pageCount;
});

const bookTitle = computed(() => reader.book?.identity.title ?? "");
const hasToc = computed(() => reader.book?.hasToc ?? false);
const pageUrl = computed(
  () => reader.pageUrls.get(reader.pageIndex) ?? null,
);
/** 瀑布流（连续滚动）/ 双页（左右拼合）/ 单页（翻页）模式 */
const isWaterfall = computed(() => settings.settings.readMode === "waterfall");
// 手机端竖屏不支持双页（拼页宽度不够）：渲染回退为单页，设置面板选择时另行拦截提示
const isPortrait = usePortraitOrientation();
const isDual = computed(
  () => settings.settings.readMode === "dual" && !(IS_MOBILE && isPortrait.value),
);

// 手机竖屏 + 双页被回退时给一次性提示（旋转回横屏后恢复，再进竖屏仍会提示）
watch(
  () => IS_MOBILE && isPortrait.value && settings.settings.readMode === "dual",
  (blocked, prev) => {
    if (blocked && !prev) toast.show(t("settings.dualNeedsLandscape"));
  },
  { immediate: true },
);

// ---------- 守卫 + UUID 直开：无书时按路由 UUID 重开历史记录 ----------
const reopening = ref(false);
let reopenSeq = 0;

async function reopenFromRoute(force = false) {
  const seq = ++reopenSeq;
  // 已有书且与路由一致时不触发；路由换书（uuid 不同）时强制重开
  if (reader.book && !force && reader.bookUuid === route.params.uuid) return;
  const uuid = route.params.uuid;
  const hadBook = !!reader.book && !!reader.bookUuid;
  const fallbackPath = hadBook ? mangaPath(reader.bookUuid as string, reader.pageIndex + 1) : "/";
  if (typeof uuid !== "string" || uuid === "") {
    void router.replace(fallbackPath);
    return;
  }
  if (reader.book && !force) return;
  reopening.value = true;
  try {
    const rawPage = route.params.page;
    const requested = rawPage ? Math.max(1, Math.floor(Number(rawPage))) || undefined : undefined;
    const ok = await reader.openByUuid(uuid, requested);
    if (seq !== reopenSeq) return;
    if (!ok) {
      // 无记录或恢复失败；若正在看另一本书则留在原书并修正 URL（还能继续用 → 普通提示）
      if (hadBook) toast.show(t("errors.notFound"));
      else toast.show(t("errors.notFound"), { alert: true });
      void router.replace(fallbackPath);
      return;
    }
    // URL 无页码参数时归一化为当前页，方便收藏当前进度
    void syncRouteToPage();
  } catch {
    if (seq !== reopenSeq) return;
    if (hadBook) toast.show(t("errors.notFound"));
    else toast.show(t("errors.notFound"), { alert: true });
    void router.replace(fallbackPath);
  } finally {
    reopening.value = false;
  }
}

void reopenFromRoute();

// ---------- 页码 ↔ 路由 ----------
function mangaPath(uuid: string, page: number): string {
  return `/manga/${uuid}/${page}`;
}

/** 阅读器内发生翻页 → replace 到对应路由（收藏/刷新可恢复）。 */
function syncRouteToPage() {
  const uuid = reader.bookUuid;
  if (!uuid || route.name !== "manga" || route.params.uuid !== uuid) return;
  const target = reader.pageIndex + 1;
  if (Number(route.params.page ?? 1) === target) return;
  void router.replace(mangaPath(uuid, target));
}

// 阅读页码变化 → 同步 URL
watch(
  () => reader.pageIndex,
  () => {
    if (!reader.book) return;
    syncRouteToPage();
  },
);

// 格外监理：路由换书（uuid 与当前书不符）→ 按路由强制重开
watch(
  () => [route.name, route.params.uuid] as const,
  ([name, uuid]) => {
    if (name !== "manga") return;
    if (reader.book && reader.bookUuid === uuid) return;
    if (typeof uuid === "string" && uuid) void reopenFromRoute(true);
  },
);

// 浏览器前进/后退（同一 uuid 内带页码的变化）→ 同步画布
watch(
  () => [route.name, route.params.uuid, route.params.page] as const,
  ([name, uuid, page]) => {
    if (name !== "manga" || !reader.book || reader.bookUuid !== uuid) return;
    if (!page) return; // 无页码参数（undefined/空串）：不干预（保持当前页/进度恢复语义）
    const target = Math.max(1, Math.floor(Number(page ?? 1))) - 1;
    if (target !== reader.pageIndex) reader.goTo(target);
  },
);

// 无目录的书籍打开时收起目录面板
watch(hasToc, (v) => {
  if (!v) tocOpen.value = false;
});

// ---------- 恢复进度提示 ----------
const restoreToastShown = ref(false);

watch(
  () => reader.restoredPage,
  (page) => {
    if (page === null || restoreToastShown.value || page === 0) return;
    restoreToastShown.value = true;
    toast.show(t("reader.restoredProgress", { page: page + 1 }), {
      actionLabel: t("reader.startOver"),
      action: () => reader.goTo(0),
      duration: 6000,
    });
  },
  { immediate: true },
);

// 纯文字页跳过提示（EPUB）
const skippedShown = ref(false);
watch(
  () => reader.book?.skippedTextPages,
  (count) => {
    if (!count || skippedShown.value) return;
    skippedShown.value = true;
    toast.show(t("reader.textPageSkipped", { count }), { duration: 5000 });
  },
  { immediate: true },
);

// ---------- 翻页 + 工具条联动 ----------
function goToWithFlash(index: number) {
  reader.goTo(index);
  barsRef.value?.flash();
}

function onWheelPage(direction: 1 | -1) {
  bottomBarRef.value?.onWheelPage(direction);
  barsRef.value?.flash();
}

/** 点击左右 25% 区域翻页（方向已按日漫模式在画布内镜像完毕） */
function onZonePage(direction: 1 | -1) {
  if (direction > 0) reader.nextPage();
  else reader.prevPage();
  barsRef.value?.flash();
}

// ---------- 快捷键 ----------

/** 页面卸载（刷新/关闭）时强制写入当前进度，收藏链接可精确续读。 */
function onPageHide() {
  reader.flushProgressNow();
}

function onKeydown(event: KeyboardEvent) {
  // 输入框聚焦时不处理（页码输入等）
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    return;
  }
  const action = matchShortcut(event);
  if (!action) return;
  if (event.ctrlKey || event.metaKey) event.preventDefault();

  switch (action) {
    case "prevPage":
      goToWithFlash(reader.pageIndex - 1);
      break;
    case "nextPage":
      goToWithFlash(reader.pageIndex + 1);
      break;
    case "zoomIn":
      reader.zoomIn();
      break;
    case "zoomOut":
      reader.zoomOut();
      break;
    case "zoomReset":
      reader.zoomReset();
      break;
    case "fitWidth":
      reader.setMode("fitWidth");
      break;
    case "fitHeight":
      reader.setMode("fitHeight");
      break;
    case "back":
      void router.push("/");
      break;
    case "toggleToc":
      if (hasToc.value) tocOpen.value = !tocOpen.value;
      break;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  // 刷新/关闭时不走 beforeunload 阻塞逻辑，pagehide 里强制冲刷进度
  window.addEventListener("pagehide", onPageHide);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("pagehide", onPageHide);
  void reader.close();
});
</script>

<template>
  <div class="reader" :data-rtl="settings.settings.rtl">
    <PageCanvas
      v-if="isWaterfall === false && isDual === false"
      :page-url="pageUrl"
      @wheel-page="onWheelPage"
      @zone-page="onZonePage"
    />
    <WaterfallCanvas v-else-if="isWaterfall" @zone-page="onZonePage" />
    <DualPageCanvas v-else @wheel-page="onWheelPage" @zone-page="onZonePage" />

    <!-- 加载占位（瀑布流/双页的逐页加载由画布内占位呈现） -->
    <div
      v-if="!reader.book || (!isWaterfall && !isDual && pageUrl === null)"
      class="reader__loading"
    >
      <Loader2 class="reader__spinner" :size="28" />
      <span class="reader__loading-text">
        {{ reader.book ? t("common.loading") : t("reader.loading", { name: "" }) }}
      </span>
    </div>

    <AutoHideBars ref="barsRef">
      <template #top>
        <TopBar
          :title="bookTitle"
          :toc-active="tocOpen"
          :settings-active="settingsOpen"
          :toc-available="hasToc"
          @toggle-toc="tocOpen = !tocOpen"
          @toggle-settings="settingsOpen = !settingsOpen"
          @open-recent="recentOpen = true"
        />
      </template>
      <template #bottom>
        <BottomBar ref="bottomBarRef" @open-preview="previewOpen = true" />
      </template>
    </AutoHideBars>

    <!-- 工具条隐藏时的左下角页码指示（纯展示，不响应鼠标）：文字 + 已读进度环 -->
    <div
      v-if="reader.book"
      class="reader__pagepill num"
      :class="{ 'reader__pagepill--hidden': barsVisible }"
      aria-hidden="true"
    >
      <span>{{ reader.currentPage }} / {{ reader.pageCount }}</span>
      <svg class="reader__pillring" viewBox="0 0 36 36">
        <circle class="reader__pillring-track" cx="18" cy="18" :r="RING_R" />
        <circle
          class="reader__pillring-bar"
          cx="18"
          cy="18"
          :r="RING_R"
          :stroke-dasharray="ringCircumference"
          :stroke-dashoffset="ringCircumference * (1 - ringProgress)"
        />
      </svg>
    </div>

    <PreviewPanel :open="previewOpen" @close="previewOpen = false" />
    <RecentPanel :open="recentOpen" @close="recentOpen = false" />
    <TocPanel :open="tocOpen" @close="tocOpen = false" />
    <SettingsPanel :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.reader {
  position: relative;
  height: 100%;
  overflow: hidden;

  &__loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    color: var(--text-3);
    pointer-events: none;
  }

  &__spinner {
    animation: spin 1s linear infinite;
    color: var(--accent);
  }

  &__loading-text {
    font-size: 13px;
  }

  // 工具条隐藏时的左下角页码胶囊：左侧贴屏幕边缘无圆角，右侧圆角；
  // 工具条出现 → 向左边缘 FadeOut，工具条淡出 → 从左边缘 FadeIn。
  &__pagepill {
    position: fixed;
    left: 0;
    bottom: 10px;
    z-index: calc(var(--z-bars) - 10); // 位于工具条层之下
    display: flex;
    align-items: center;
    gap: 10px; // 进度环与文字的间距
    padding: 6px 8px 6px 16px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 12.5px;
    line-height: 1.5;
    border-radius: 0 16px 16px 0;
    pointer-events: none;
    opacity: 0.6;
    transform: translateX(0);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  // 已读进度环：整圈 20% 白为轨道，已读部分 80% 白加粗描边，
  // 从 12 点位置起顺时针延伸（svg 整体旋转 -90°）。
  &__pillring {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    transform: rotate(-90deg);

    &-track {
      fill: none;
      stroke: rgba(255, 255, 255, 0.2);
      stroke-width: 3;
    }

    &-bar {
      fill: none;
      stroke: rgba(255, 255, 255, 0.8);
      stroke-width: 4.5;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s ease;
    }
  }

  &__pagepill--hidden {
    opacity: 0;
    transform: translateX(-100%);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
