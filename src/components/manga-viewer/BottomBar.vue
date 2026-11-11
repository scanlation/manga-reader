<script setup lang="ts">
// 下工具条。桌面端单行：左=分页器（上/下页图标钮+页码输入+总页数）；中=进度滑杆；右=缩放组。
// 手机窄屏（≤640px）改两行：下=翻页按钮+进度滑杆；上=页码/总页数+缩略图预览+缩放组。
// 分页器图标固定按位置方向：左钮 ChevronLeft、右钮 ChevronRight；
// 日漫（RTL）模式只切换提示文字、禁用条件与功能，不换图标。
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Minus,
  Plus,
  RotateCcw,
  UnfoldVertical,
  UnfoldHorizontal,
} from "lucide-vue-next";

import IconButton from "@/components/ui/IconButton.vue";
import NumberInput from "@/components/ui/NumberInput.vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";
import { useMangaViewerStore } from "@/stores/mangaViewer";
import { useSettingsStore } from "@/stores/settings";

const { t } = useI18n();
const reader = useMangaViewerStore();
const settings = useSettingsStore();

// ---------- 手机窄屏判定（与着陆页 640px 断点一致） ----------
const mobileMql = window.matchMedia("(max-width: 640px)");
const isMobile = ref(mobileMql.matches);
function onMobileChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches;
}
onMounted(() => mobileMql.addEventListener("change", onMobileChange));
onBeforeUnmount(() => mobileMql.removeEventListener("change", onMobileChange));

const emit = defineEmits<{
  /** 打开图片预览面板 */
  openPreview: [];
}>();

const rtl = computed(() => settings.settings.rtl);

const percentLabel = computed(() => `${reader.percentLabel()}%`);

// 分页器两端按钮：图标固定，RTL 只交换功能/文案/禁用条件
// 禁用判定走 store 的 atStart/atEnd（双页模式按视单元判定）
const leftLabel = computed(() => t(rtl.value ? "reader.nextPage" : "reader.prevPage"));
const leftDisabled = computed(() => (rtl.value ? reader.navAtEnd : reader.navAtStart));
function onLeftClick() {
  if (rtl.value) reader.nextPage();
  else reader.prevPage();
}

const rightLabel = computed(() => t(rtl.value ? "reader.prevPage" : "reader.nextPage"));
const rightDisabled = computed(() => (rtl.value ? reader.navAtStart : reader.navAtEnd));
function onRightClick() {
  if (rtl.value) reader.prevPage();
  else reader.nextPage();
}

function onPageSubmit(value: number) {
  reader.goTo(value - 1);
}

function onSliderUpdate(value: number) {
  reader.goTo(value - 1);
}

function onWheelPage(direction: 1 | -1) {
  // 画布转发的翻页意图：1=下一页，-1=上一页（页码方向语义，不随 RTL 镜像）
  if (direction > 0) reader.nextPage();
  else reader.prevPage();
}

defineExpose({ onWheelPage });
</script>

<template>
  <!-- 手机窄屏：两行布局 —— 下行=翻页+进度；上行=页码/总页数+缩略图预览+缩放组 -->
  <div v-if="isMobile" class="bottom-bar bottom-bar--mobile">
    <div class="bottom-bar__row">
      <span class="bottom-bar__page num">{{ reader.currentPage }}</span>
      <span class="bottom-bar__total num" :title="t('reader.totalPages')">
        / {{ reader.pageCount }}
      </span>
      <IconButton
        :icon="Images"
        :label="$t('reader.imagePreview')"
        placement="top"
        :disabled="!reader.book"
        @click="emit('openPreview')"
      />
      <span class="bottom-bar__spacer" />
      <IconButton
        :icon="Plus"
        :label="$t('reader.zoomIn')"
        placement="top"
        @click="reader.zoomIn()"
      />
      <span class="bottom-bar__percent num" data-testid="zoom-percent">
        {{ percentLabel }}
      </span>
      <IconButton
        :icon="Minus"
        :label="$t('reader.zoomOut')"
        placement="top"
        @click="reader.zoomOut()"
      />
      <IconButton
        :icon="RotateCcw"
        :label="$t('reader.zoomReset')"
        placement="top"
        @click="reader.zoomReset()"
      />
    </div>
    <div class="bottom-bar__row bottom-bar__row--pager">
      <IconButton
        :icon="ChevronLeft"
        :label="leftLabel"
        placement="top"
        :disabled="leftDisabled"
        @click="onLeftClick"
      />
      <div class="bottom-bar__slider">
        <RangeSlider
          :model-value="reader.currentPage"
          :min="1"
          :max="Math.max(1, reader.pageCount)"
          :aria-label="t('reader.pageInput')"
          :disabled="!reader.book || reader.pageCount <= 1"
          @update="onSliderUpdate"
        />
      </div>
      <IconButton
        :icon="ChevronRight"
        :label="rightLabel"
        placement="top"
        :disabled="rightDisabled"
        @click="onRightClick"
      />
    </div>
  </div>

  <!-- 桌面端：单行布局 -->
  <div v-else class="bottom-bar">
    <!-- 左：分页器 -->
    <div class="bottom-bar__pager">
      <IconButton
        :icon="ChevronLeft"
        :label="leftLabel"
        placement="top"
        :disabled="leftDisabled"
        @click="onLeftClick"
      />
      <NumberInput
        :model-value="reader.currentPage"
        :min="1"
        :max="Math.max(1, reader.pageCount)"
        :width="52"
        :aria-label="t('reader.pageInput')"
        :disabled="!reader.book"
        @submit="onPageSubmit"
      />
      <span class="bottom-bar__total num" :title="t('reader.totalPages')">
        / {{ reader.pageCount }}
      </span>
      <IconButton
        :icon="Images"
        :label="$t('reader.imagePreview')"
        placement="top"
        :disabled="!reader.book"
        @click="emit('openPreview')"
      />
      <IconButton
        :icon="ChevronRight"
        :label="rightLabel"
        placement="top"
        :disabled="rightDisabled"
        @click="onRightClick"
      />
    </div>

    <!-- 中：进度滑杆 -->
    <div class="bottom-bar__slider">
      <RangeSlider
        :model-value="reader.currentPage"
        :min="1"
        :max="Math.max(1, reader.pageCount)"
        :aria-label="t('reader.pageInput')"
        :disabled="!reader.book || reader.pageCount <= 1"
        @update="onSliderUpdate"
      />
    </div>

    <!-- 右：缩放 -->
    <div class="bottom-bar__zoom">
      <IconButton
        :icon="Plus"
        :label="$t('reader.zoomIn')"
        placement="top"
        @click="reader.zoomIn()"
      />
      <span class="bottom-bar__percent num" data-testid="zoom-percent">
        {{ percentLabel }}
      </span>
      <IconButton
        :icon="Minus"
        :label="$t('reader.zoomOut')"
        placement="top"
        @click="reader.zoomOut()"
      />
      <IconButton
        :icon="RotateCcw"
        :label="$t('reader.zoomReset')"
        placement="top"
        @click="reader.zoomReset()"
      />
      <span class="bottom-bar__divider" />
      <IconButton
        :icon="UnfoldHorizontal"
        :label="$t('reader.fitWidth')"
        placement="top"
        :active="reader.fitMode === 'fitWidth'"
        @click="reader.setMode('fitWidth')"
      />
      <IconButton
        :icon="UnfoldVertical"
        :label="$t('reader.fitHeight')"
        placement="top"
        :active="reader.fitMode === 'fitHeight'"
        @click="reader.setMode('fitHeight')"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.bottom-bar {
  @include panel-glass;

  display: flex;
  align-items: center;
  gap: 16px;
  height: var(--bar-height);
  padding: 0 12px;
  width: 100%;
  border-top: 1px solid var(--border-1);
  border-radius: 0; // 贴边显示，去掉玻璃面板圆角

  // 手机窄屏：两行布局（上行信息+缩放组，下行翻页+进度）
  &--mobile {
    height: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 4px 6px 6px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;

    // 翻页行：两端按钮固定，中间进度条撑满
    &--pager .bottom-bar__slider {
      flex: 1;
      min-width: 0;
    }
  }

  &__page {
    min-width: 34px;
    text-align: right;
    font-size: 13px;
    color: var(--text-1);
  }

  &__spacer {
    flex: 1;
  }

  &__pager {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  &__total {
    font-size: 12.5px;
    color: var(--text-3);
    margin: 0 2px;
    min-width: 34px;
    text-align: left;
  }

  &__slider {
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: center;
  }

  &__zoom {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  &__percent {
    min-width: 46px;
    text-align: center;
    font-size: 12.5px;
    color: var(--text-2);
  }

  &__divider {
    width: 1px;
    height: 20px;
    background: var(--border-1);
    margin: 0 6px;
    flex-shrink: 0;
  }
}
</style>
