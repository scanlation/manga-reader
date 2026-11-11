<script setup lang="ts">
// 最近打开独立页：搜索筛选 + 批量管理（多选、全选/反选、批量删除、归档文件夹）。
// 归档为一级文件夹（entry.folder 标签，无嵌套）；批量操作需在确认框二次确认。
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowLeft,
  BookOpen,
  CheckSquare,
  ChevronDown,
  FileArchive,
  Folder,
  FolderOpen,
  Library,
  Search,
  Square,
  X,
} from "lucide-vue-next";

import { useOpenFlow } from "@/components/landing/useOpenFlow";
import DropOverlay from "@/components/landing/DropOverlay.vue";
import AppModal from "@/components/ui/AppModal.vue";
import LangSwitcher from "@/components/ui/LangSwitcher.vue";
import ThemeToggle from "@/components/ui/ThemeToggle.vue";
import { useHistoryStore } from "@/stores/history";
import { deleteHandle } from "@/lib/fs-handles";
import { deleteCachedBook } from "@/lib/cached-books";
import { IS_TAURI } from "@/lib/platform";
import type { HistoryEntry } from "@/lib/history";
import type { OpenItem } from "@/lib/sources";

type BatchOp = "" | "batchDelete" | "archive";

interface Group {
  folder: string | null;
  entries: HistoryEntry[];
}

const { t } = useI18n();
const openFlow = useOpenFlow();
const historyStore = useHistoryStore();

const { showPickerModal, pendingItems } = openFlow;

// ---------- 搜索：仅匹配文件名 / 书籍标题（title 已包含两者来源） ----------
const query = ref("");
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const sorted = [...historyStore.entries].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!q) return sorted;
  return sorted.filter((e) => e.title.toLowerCase().includes(q));
});

// ---------- 分组：归档文件夹在前（按名排序），未归档殿后 ----------
const groups = computed<Group[]>(() => {
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of filtered.value) {
    const key = entry.folder ?? "";
    const bucket = map.get(key) ?? [];
    bucket.push(entry);
    map.set(key, bucket);
  }
  const out: Group[] = [...map.entries()]
    .filter(([key]) => key !== "")
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([folder, entries]) => ({ folder, entries }));
  const loose = map.get("");
  if (loose) out.push({ folder: null, entries: loose });
  return out;
});

const collapsedFolders = ref<Set<string>>(new Set());
function toggleGroup(folder: string) {
  const next = new Set(collapsedFolders.value);
  if (next.has(folder)) next.delete(folder);
  else next.add(folder);
  collapsedFolders.value = next;
}

// ---------- 批量管理 ----------
const manageMode = ref(false);
const selectedIds = ref<string[]>([]);
const chosenOp = ref<BatchOp>("");
const confirmOpen = ref(false);
const folderName = ref("");

const visibleIds = computed(() => filtered.value.map((e) => e.id));
const canExecute = computed(
  () => manageMode.value && selectedIds.value.length > 0 && chosenOp.value !== "",
);
const actionLabel = computed(() =>
  chosenOp.value === "archive"
    ? t("library.archive")
    : chosenOp.value === "batchDelete"
      ? t("library.batchDelete")
      : "",
);

const existingFolders = computed(() =>
  [...new Set(historyStore.entries.map((e) => e.folder).filter(Boolean) as string[])].sort(),
);

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function toggleSelect(id: string) {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id];
}

function exitManage() {
  manageMode.value = false;
  selectedIds.value = [];
  chosenOp.value = "";
}

function selectAll() {
  // 只作用于当前搜索结果里可见的条目
  selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds.value])];
}

function invertSelection() {
  const hide = new Set(selectedIds.value);
  selectedIds.value = visibleIds.value.filter((id) => !hide.has(id));
}

/** 打开第 M 步：弹确认框（归档时预填目标文件夹）。 */
function requestExecute() {
  if (!canExecute.value) return;
  if (chosenOp.value === "archive") {
    const selectedEntries = historyStore.entries.filter((e) => isSelected(e.id));
    const folders = new Set(selectedEntries.map((e) => e.folder ?? ""));
    folderName.value = folders.size === 1 ? [...folders][0] : "";
  }
  confirmOpen.value = true;
}

async function confirmExecute() {
  const ids = [...selectedIds.value];
  confirmOpen.value = false;
  if (chosenOp.value === "batchDelete") {
    historyStore.remove(ids);
    // 顺带清理 FSA 句柄与拖放缓存，避免留下孤儿数据
    for (const id of ids) {
      void deleteHandle(id);
      void deleteCachedBook(id);
    }
  } else if (chosenOp.value === "archive") {
    const name = folderName.value.trim() || t("library.archiveFolderDefault");
    for (const id of ids) historyStore.setFolder(id, name);
  }
  exitManage();
  manageMode.value = true; // 执行完批量操作后保持管理模式（清空选中即可）
}

// ---------- 打开条目（非管理模式点击即续读） ----------
async function openEntry(entry: HistoryEntry) {
  if (IS_TAURI && entry.path) {
    await openFlow.openTauriPaths([entry.path]);
    return;
  }
  await openFlow.reopenWeb(entry.id);
}

function onCardClick(entry: HistoryEntry) {
  if (manageMode.value) toggleSelect(entry.id);
  else void openEntry(entry);
}

// ---------- 视图助手 ----------
function progressOf(entry: { lastPage: number; pageCount: number }): number {
  if (entry.pageCount <= 1) return 0;
  return Math.round(((entry.lastPage + 1) / entry.pageCount) * 100);
}

function formatIcon(format: string) {
  if (format === "folder") return FolderOpen;
  if (format === "epub") return BookOpen;
  return FileArchive;
}

/** PC 端条目所在文件夹路径（卡片上直接展示）。 */
function sourcePathOf(entry: HistoryEntry): string | null {
  if (!IS_TAURI || !entry.path) return null;
  const trimmed = entry.path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return idx > 0 ? trimmed.slice(0, idx) : null;
}

function pendingLabel(item: OpenItem): string {
  if (item.type === "path") return item.path.split(/[\\/]/).pop() ?? item.path;
  if (item.type === "file") return item.file.name;
  const first = item.entries[0] as (File & { _mtrPath?: string }) | undefined;
  return first?._mtrPath?.split("/")[0] ?? t("landing.chooseFolder");
}

// ---------- 拖放（与着陆页一致的打开链路） ----------
function onWebDrop(event: DragEvent) {
  if (event.dataTransfer) void openFlow.openDropped(event.dataTransfer);
}

async function setupTauriDragDrop() {
  if (!IS_TAURI) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const unlisten = await win.onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      void openFlow.openTauriPaths(event.payload.paths);
    }
  });
  onBeforeUnmount(() => unlisten());
}

onMounted(() => {
  void setupTauriDragDrop();
});
</script>

<template>
  <DropOverlay @drop="onWebDrop">
    <div class="page lib">
      <header class="lib__topbar">
        <div class="lib__brand">
          <RouterLink to="/" class="lib__back" :aria-label="$t('reader.back')">
            <ArrowLeft :size="17" />
          </RouterLink>
          <Library :size="20" class="lib__brand-icon" />
          <span class="lib__brand-name">{{ $t("library.title") }}</span>
        </div>
        <div class="lib__topbar-actions">
          <LangSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main class="lib__content">
        <div class="lib-head">
          <h1 class="lib-head__title">{{ $t("library.title") }}</h1>

          <div class="lib-toolbar">
            <button
              class="lib-btn"
              :class="{ 'lib-btn--on': manageMode }"
              type="button"
              @click="manageMode ? exitManage() : (manageMode = true)"
            >
              {{ manageMode ? $t("library.done") : $t("library.manage") }}
            </button>

            <div class="lib-search">
              <Search :size="15" class="lib-search__icon" />
              <input
                v-model="query"
                class="lib-search__input"
                type="text"
                :placeholder="$t('library.searchPlaceholder')"
              />
              <button
                v-if="query"
                class="lib-search__clear"
                type="button"
                :aria-label="$t('common.close')"
                @click="query = ''"
              >
                <X :size="13" />
              </button>
            </div>

            <template v-if="manageMode">
              <button class="lib-btn" type="button" @click="selectAll">
                {{ $t("library.selectAll") }}
              </button>
              <button class="lib-btn" type="button" @click="invertSelection">
                {{ $t("library.invert") }}
              </button>
              <select v-model="chosenOp" class="lib-select" :aria-label="$t('library.chooseAction')">
                <option value="" disabled>{{ $t("library.chooseAction") }}</option>
                <option value="batchDelete">{{ $t("library.batchDelete") }}</option>
                <option value="archive">{{ $t("library.archive") }}</option>
              </select>
              <button
                class="lib-btn lib-btn--primary"
                type="button"
                :disabled="!canExecute"
                @click="requestExecute"
              >
                {{ $t("library.execute") }}
              </button>
            </template>
          </div>
        </div>

        <!-- 空态 -->
        <p v-if="historyStore.entries.length === 0" class="lib__empty">
          {{ $t("landing.historyEmpty") }}
        </p>
        <p v-else-if="filtered.length === 0 && query" class="lib__empty">
          {{ $t("library.searchEmpty") }}
        </p>

        <!-- 分组列表 -->
        <section
          v-for="group in groups"
          :key="group.folder ?? '__loose'"
          class="group"
        >
          <h2
            v-if="group.folder"
            class="group__title group__title--folder"
            type="button"
            @click="toggleGroup(group.folder)"
          >
            <Folder :size="15" class="group__folder-icon" />
            <span>{{ group.folder }}</span>
            <span class="num group__count">（{{ group.entries.length }}）</span>
            <ChevronDown
              :size="14"
              class="group__chevron"
              :class="{ 'group__chevron--collapsed': collapsedFolders.has(group.folder) }"
            />
          </h2>
          <h2 v-else class="group__title">
            <span>{{ $t("library.unarchived") }}</span>
            <span class="num group__count">（{{ group.entries.length }}）</span>
            <span class="group__hint">{{ $t("library.unarchivedHint") }}</span>
          </h2>

          <ul
            v-show="!(group.folder && collapsedFolders.has(group.folder))"
            class="group__list"
          >
            <li v-for="entry in group.entries" :key="entry.id">
              <button
                class="lib-card"
                :class="{ 'lib-card--selected': manageMode && isSelected(entry.id) }"
                type="button"
                @click="onCardClick(entry)"
              >
                <span
                  v-if="manageMode"
                  class="lib-card__check"
                  :class="{ 'lib-card__check--on': isSelected(entry.id) }"
                >
                  <CheckSquare v-if="isSelected(entry.id)" :size="16" />
                  <Square v-else :size="16" />
                </span>
                <span class="lib-card__thumb">
                  <img v-if="entry.cover" :src="entry.cover" alt="" />
                  <component :is="formatIcon(entry.format)" v-else :size="22" />
                </span>
                <span class="lib-card__meta">
                  <span class="lib-card__name">{{ entry.title }}</span>
                  <span v-if="group.folder" class="lib-card__chip">
                    <Folder :size="11" />
                    {{ group.folder }}
                  </span>
                  <span v-else-if="sourcePathOf(entry)" class="lib-card__chip">
                    <FolderOpen :size="11" />
                    {{ sourcePathOf(entry) }}
                  </span>
                  <span class="lib-card__progress">
                    <span
                      class="lib-card__bar"
                      :style="{ '--p': `${progressOf(entry)}%` }"
                    />
                    <span class="num lib-card__pages">
                      {{ entry.pageCount > 0 ? `${entry.lastPage + 1} / ${entry.pageCount}` : "—" }}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </main>

      <footer class="lib__footer">
        <span>{{ $t("landing.privacyNote") }}</span>
      </footer>
    </div>

    <!-- 批量操作确认框 -->
    <AppModal
      :open="confirmOpen"
      :title="$t('library.confirmTitle')"
      :max-width="400"
      @close="confirmOpen = false"
    >
      <p class="batch-confirm__msg">
        {{ $t("library.confirmMessage", { action: actionLabel }) }}
      </p>
      <div v-if="chosenOp === 'archive'" class="batch-confirm__archive">
        <label class="batch-confirm__label" for="mtr-archive-folder">
          {{ $t("library.archiveFolderLabel") }}
        </label>
        <input
          id="mtr-archive-folder"
          v-model="folderName"
          class="batch-confirm__input"
          type="text"
          :placeholder="$t('library.archiveFolderPlaceholder')"
          list="mtr-existing-folders"
        />
        <datalist id="mtr-existing-folders">
          <option v-for="f in existingFolders" :key="f" :value="f" />
        </datalist>
      </div>
      <div class="batch-confirm__actions">
        <button class="lib-btn" type="button" @click="confirmOpen = false">
          {{ $t("common.cancel") }}
        </button>
        <button class="lib-btn lib-btn--primary" type="button" @click="confirmExecute">
          {{ $t("common.confirm") }}
        </button>
      </div>
    </AppModal>

    <!-- 多文件选择弹窗（拖入多个文件时二选一） -->
    <AppModal
      :open="showPickerModal"
      :title="$t('landing.historyTitle')"
      :max-width="480"
      @close="openFlow.cancelPending"
    >
      <ul class="picker-list">
        <li v-for="(item, i) in pendingItems" :key="i">
          <button
            class="picker-list__item"
            type="button"
            @click="openFlow.confirmPending(item)"
          >
            <FolderOpen v-if="item.type === 'webDir' || item.type === 'path'" :size="18" />
            <FileArchive v-else :size="18" />
            <span class="picker-list__name">{{ pendingLabel(item) }}</span>
          </button>
        </li>
      </ul>
    </AppModal>
  </DropOverlay>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.lib {
  &__topbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 28px;
    background: var(--bg-glass);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border-1);
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent);
  }

  &__back {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }
  }

  &__brand-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--text-1);
  }

  &__topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__content {
    max-width: 880px;
    margin: 0 auto;
    padding: 28px 24px 60px;
  }

  &__empty {
    color: var(--text-3);
    font-size: 13px;
    text-align: center;
    padding: 48px 0;
  }

  &__footer {
    max-width: 880px;
    margin: 0 auto;
    padding: 0 24px 32px;
    color: var(--text-3);
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
}

// ---------- 标题 + 工具条 ----------
.lib-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;

  &__title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-1);
  }
}

.lib-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.lib-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-2);
  background: var(--bg-surface);
  color: var(--text-1);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  @include focus-ring;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  &--on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }

  &--primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--text-on-accent);

    &:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

.lib-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-2);
  background: var(--bg-surface);
  width: 220px;

  &:focus-within {
    border-color: var(--accent);
  }

  &__icon {
    color: var(--text-3);
    flex-shrink: 0;
  }

  &__input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-1);
    font-size: 13px;

    &::placeholder {
      color: var(--text-3);
    }
  }

  &__clear {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    color: var(--text-3);
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }
  }
}

.lib-select {
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-2);
  background: var(--bg-surface);
  color: var(--text-1);
  font-size: 13px;
  font-weight: 500;
  @include focus-ring;

  &:focus {
    border-color: var(--accent);
  }
}

// ---------- 分组 ----------
.group {
  margin-bottom: 28px;

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14.5px;
    font-weight: 700;
    color: var(--text-1);
    margin-bottom: 12px;
    width: fit-content;

    &--folder {
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--radius-sm);
      @include focus-ring;

      &:hover {
        background: var(--bg-hover);
      }
    }
  }

  &__folder-icon {
    color: var(--warning);
  }

  &__count {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-3);
  }

  &__hint {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-3);
    margin-left: 6px;
  }

  &__chevron {
    color: var(--text-3);
    transition: transform 0.15s ease;

    &--collapsed {
      transform: rotate(-90deg);
    }
  }

  &__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
}

// ---------- 条目卡片 ----------
.lib-card {
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
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
  @include focus-ring;

  &:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-1);
    transform: translateY(-1px);
  }

  &--selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  &__check {
    display: grid;
    place-items: center;
    color: var(--text-3);
    flex-shrink: 0;

    &--on {
      color: var(--accent);
    }
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

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    align-self: flex-start;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--bg-surface-2);
    border: 1px solid var(--border-1);
    font-size: 11px;
    color: var(--text-2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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

// ---------- 确认弹窗 ----------
.batch-confirm {
  &__msg {
    font-size: 14px;
    color: var(--text-1);
    line-height: 1.6;
    padding: 8px 0;
  }

  &__archive {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 6px 0 0;
  }

  &__label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
  }

  &__input {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-2);
    background: var(--bg-surface);
    color: var(--text-1);
    font-size: 13px;
    outline: none;

    &:focus {
      border-color: var(--accent);
    }
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }
}

.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-1);
    color: var(--text-1);
    text-align: left;
    @include focus-ring;

    &:hover {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
  }

  &__name {
    @include ellipsis;

    font-size: 13.5px;
  }
}
</style>
