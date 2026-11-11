<script setup lang="ts">
// 最近打开弹出层：单列展示最近 10 条（条目样式与"最近打开"页一致），
// 点击条目续读（Tauri 路径 / Web FSA·缓存链路复用 useOpenFlow），
// 超过 10 条时底部出现"更多项目"按钮，跳转独立的最近打开页面。
import { computed } from "vue";
import { useRouter } from "vue-router";
import { FileArchive, BookOpen, FolderOpen, MoreHorizontal } from "lucide-vue-next";

import SidePanel from "@/components/ui/SidePanel.vue";
import { useOpenFlow } from "@/components/landing/useOpenFlow";
import { useHistoryStore } from "@/stores/history";
import { IS_TAURI } from "@/lib/platform";
import type { HistoryEntry } from "@/lib/history";

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const openFlow = useOpenFlow();
const historyStore = useHistoryStore();

/** 最近打开列表（按最近使用排序，最多 10 条） */
const recent = computed<HistoryEntry[]>(() => {
  if (!props.open) return [];
  return [...historyStore.entries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
});

const hasMore = computed(() => {
  if (!props.open) return false;
  return historyStore.entries.length > 10;
});

function formatIcon(format: string) {
  if (format === "folder") return FolderOpen;
  if (format === "epub") return BookOpen;
  return FileArchive;
}

function progressOf(entry: { lastPage: number; pageCount: number }): number {
  if (entry.pageCount <= 1) return 0;
  return Math.round(((entry.lastPage + 1) / entry.pageCount) * 100);
}

/** 续读：成功后弹出层关闭（路由跳转由 useOpenFlow 负责）。 */
async function openEntry(entry: HistoryEntry) {
  if (IS_TAURI && entry.path) {
    await openFlow.openTauriPaths([entry.path]);
  } else {
    await openFlow.reopenWeb(entry.id);
  }
  emit("close");
}

function openLibrary() {
  emit("close");
  void router.push("/library");
}
</script>

<template>
  <SidePanel :open="props.open" :title="$t('landing.historyTitle')" side="right" width="360px" @close="emit('close')">
    <p v-if="recent.length === 0" class="recent__empty">
      {{ $t("landing.historyEmpty") }}
    </p>

    <ul v-else class="recent-list">
      <li v-for="entry in recent" :key="entry.id">
        <button class="recent-card" type="button" @click="openEntry(entry)">
          <span class="recent-card__thumb">
            <img v-if="entry.cover" :src="entry.cover" alt="" />
            <component :is="formatIcon(entry.format)" v-else :size="22" />
          </span>
          <span class="recent-card__meta">
            <span class="recent-card__name">{{ entry.title }}</span>
            <span class="recent-card__progress">
              <span class="recent-card__bar" :style="{ '--p': `${progressOf(entry)}%` }" />
              <span class="num recent-card__pages">
                {{ entry.pageCount > 0 ? `${entry.lastPage + 1} / ${entry.pageCount}` : "—" }}
              </span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <button v-if="hasMore" class="recent__more" type="button" @click="openLibrary">
      <MoreHorizontal :size="15" />
      {{ $t("library.moreItems") }}
    </button>
  </SidePanel>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.recent {
  &__empty {
    color: var(--text-3);
    font-size: 13px;
    text-align: center;
    padding: 48px 0;
  }

  &__more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 14px;
    padding: 9px 12px;
    border-radius: var(--radius-md);
    border: 1px dashed var(--border-2);
    background: transparent;
    color: var(--text-2);
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
      color: var(--text-1);
    }
  }
}

// 条目样式与"最近打开"页的 lib-card 一致（单列布局）
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  background: var(--bg-surface);
  text-align: left;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
  @include focus-ring;

  &:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-1);
    background: var(--bg-hover);
  }

  &__thumb {
    display: grid;
    place-items: center;
    width: 44px;
    height: 58px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    background: var(--bg-surface-2);
    color: var(--text-3);
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &__name {
    @include ellipsis;

    font-size: 13px;
    font-weight: 500;
    color: var(--text-1);
  }

  &__progress {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__bar {
    position: relative;
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--bg-active);
    overflow: hidden;

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      width: var(--p, 0%);
      background: var(--accent);
      border-radius: 2px;
    }
  }

  &__pages {
    font-size: 11px;
    color: var(--text-3);
    flex-shrink: 0;
  }
}
</style>
