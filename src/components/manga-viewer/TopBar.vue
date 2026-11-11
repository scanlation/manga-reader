<script setup lang="ts">
// 上工具条：返回（图标）、文件名（唯一文字、自动撑开）、目录、设置、最近打开（图标+tooltip）。
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Library,
  ListOrdered,
  Settings2,
} from "lucide-vue-next";

import IconButton from "@/components/ui/IconButton.vue";

const props = defineProps<{
  title: string;
  tocActive: boolean;
  settingsActive: boolean;
  /** 无目录信息的书籍隐藏目录按钮 */
  tocAvailable?: boolean;
}>();

const emit = defineEmits<{
  toggleToc: [];
  toggleSettings: [];
  openRecent: [];
}>();

const router = useRouter();

const shortTitle = computed(() => {
  // PC 文件夹/文件路径剥掉目录部分
  const name = props.title.split(/[\\/]/).filter(Boolean).pop() ?? props.title;
  return name;
});

function goBack() {
  void router.push("/");
}
</script>

<template>
  <div class="top-bar">
    <IconButton
      :icon="ArrowLeft"
      :label="$t('reader.back')"
      placement="bottom"
      @click="goBack"
    />
    <h1 class="top-bar__title" :title="props.title">{{ shortTitle }}</h1>
    <IconButton
      v-if="props.tocAvailable"
      :icon="ListOrdered"
      :label="$t('reader.toc')"
      placement="bottom"
      :active="props.tocActive"
      @click="emit('toggleToc')"
    />
    <IconButton
      :icon="Library"
      :label="$t('landing.historyTitle')"
      placement="bottom"
      @click="emit('openRecent')"
    />
    <IconButton
      :icon="Settings2"
      :label="$t('reader.settings')"
      placement="bottom"
      :active="props.settingsActive"
      @click="emit('toggleSettings')"
    />
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

// 定位由 AutoHideBars 的容器负责（fixed + 左右拉伸），
// 这里只负责自身样式，不写 fixed/宽度信息，避免与容器动画叠加失效。
.top-bar {
  @include panel-glass;

  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--bar-height);
  padding: 0 10px;
  width: 100%;
  border-bottom: 1px solid var(--border-1);
  border-radius: 0; // 贴边显示，去掉玻璃面板圆角

  &__title {
    @include ellipsis;

    flex: 1;
    margin: 0 8px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-1);
    text-align: left;
  }
}
</style>
