<script setup lang="ts">
// 目录面板：章节列表（单章节时显示“全部页面”），点击跳页。
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import SidePanel from "@/components/ui/SidePanel.vue";
import { useMangaViewerStore } from "@/stores/mangaViewer";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const reader = useMangaViewerStore();

const chapters = computed(() => props.open ? (reader.book?.chapters ?? []) : []);

function chapterTitle(chapter: { title: string; pageStart: number; pageCount: number }, index: number): string {
  if (!chapter.title) return t("common.empty") === chapter.title ? "" : t("reader.toc");
  return `${t("reader.chapterPrefix")} ${index + 1} · ${chapter.title}`;
}

function displayTitle(chapter: { title: string }, index: number): string {
  return chapter.title || `${t("reader.toc")} ${index + 1}`;
}

function isCurrentChapter(pageStart: number, pageCount: number): boolean {
  const idx = reader.pageIndex;
  return idx >= pageStart && idx < pageStart + pageCount;
}

function jump(pageStart: number) {
  reader.goTo(pageStart);
  emit("close");
}

const singleChapter = computed(() => chapters.value.length === 1);
</script>

<template>
  <SidePanel :open="props.open" :title="$t('reader.toc')" side="right" @close="emit('close')">
    <ul class="toc-list">
      <li v-if="singleChapter">
        <button class="toc-list__item toc-list__item--single" type="button" @click="jump(0)">
          <span class="toc-list__name">{{ $t("reader.toc") }}</span>
          <span class="toc-list__range num">1 – {{ reader.pageCount }}</span>
        </button>
      </li>
      <li v-for="(chapter, i) in chapters" v-else :key="i">
        <button
          class="toc-list__item"
          :class="{ 'toc-list__item--current': isCurrentChapter(chapter.pageStart, chapter.pageCount) }"
          type="button"
          @click="jump(chapter.pageStart)"
        >
          <span class="toc-list__name" :title="displayTitle(chapter, i)">
            {{ chapterTitle(chapter, i) }}
          </span>
          <span class="toc-list__range num">
            {{ chapter.pageStart + 1 }} – {{ chapter.pageStart + chapter.pageCount }}
          </span>
        </button>
      </li>
    </ul>
  </SidePanel>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    text-align: left;
    color: var(--text-2);
    transition: background 0.15s ease, color 0.15s ease;
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }

    &--current {
      background: var(--accent-soft);
      color: var(--accent);
    }

    &--single {
      color: var(--text-1);
    }
  }

  &__name {
    @include ellipsis;

    font-size: 13.5px;
  }

  &__range {
    font-size: 12px;
    color: var(--text-3);
    flex-shrink: 0;
  }
}
</style>
