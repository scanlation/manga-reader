<script setup lang="ts">
// 着陆页：顶栏、Hero（含品牌域名徽标）、亮点卡、底部悬浮信息条（桌面端 / 开源）、选择弹窗、拖放。"最近打开"已拆到 /library 页。
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  BookOpenText,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  Github,
  Image,
  Library,
  Monitor,
  Rocket,
  Settings2,
  ShieldCheck,
} from "lucide-vue-next";

import { useOpenFlow } from "@/components/landing/useOpenFlow";
import DropOverlay from "@/components/landing/DropOverlay.vue";
import IconButton from "@/components/ui/IconButton.vue";
import SettingsPanel from "@/components/manga-viewer/SettingsPanel.vue";
import WindowControls from "@/components/ui/WindowControls.vue";
import AppModal from "@/components/ui/AppModal.vue";
import { SUPPORTS_FOLDER } from "@/lib/capabilities";
import { IS_TAURI } from "@/lib/platform";
import { GITHUB_URL, openExternal } from "@/lib/open-url";
import type { OpenItem } from "@/lib/sources";

const { t } = useI18n();
const openFlow = useOpenFlow();

// 设置面板（仅外观：语言/主题）。语言切换与主题设置从顶栏收进面板，与阅读页一致。
const settingsOpen = ref(false);

// 模板需要解包的响应式状态（嵌套在 composable 返回对象中的 ref 不自动解包）
const { showPickerModal, pendingItems } = openFlow;

// DEV 专用：`?fixture=<文件名>` 自动打开 test-fixtures 下的样例（自动化测试用）。
// 仅在着陆页挂载时执行一次 —— Library / 面板等同样调用 useOpenFlow，不能挂在那里；
// import.meta.env.DEV 在生产构建中被替换为 false，分支整体被 tree-shake 掉。
if (import.meta.env.DEV) {
  const name = new URLSearchParams(window.location.search).get("fixture");
  if (name) {
    void (async () => {
      try {
        const res = await fetch(`/test-fixtures/${encodeURIComponent(name)}`);
        if (!res.ok) return;
        // 固定 lastModified：身份 id 含该值，保证跨刷新命中同一历史记录
        const file = new File([await res.arrayBuffer()], name, { lastModified: 0 });
        await openFlow.openAndNavigate({ type: "file", file });
      } catch {
        /* 测试钩子失败不影响正常使用 */
      }
    })();
  }
}

// 亮点卡：把使用方式融进亮点说明（拖入即读 / 格式与文件夹直读 / 模式与翻页习惯随意调）
// 不支持文件夹读取的浏览器自动隐藏文件夹相关文案
const highlights = computed(() => [
  { icon: ShieldCheck, title: t("landing.highlights.localTitle"), desc: t("landing.highlights.localDesc") },
  {
    icon: FileArchive,
    title: t("landing.highlights.formatsTitle"),
    desc: t(
      SUPPORTS_FOLDER
        ? "landing.highlights.formatsDesc"
        : "landing.highlights.formatsDescNoFolder",
    ),
  },
  { icon: BookOpenText, title: t("landing.highlights.modesTitle"), desc: t("landing.highlights.modesDesc") },
]);

// ---------- Tauri 拖放 ----------
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

function onWebDrop(event: DragEvent) {
  if (event.dataTransfer) void openFlow.openDropped(event.dataTransfer);
}

function pendingLabel(item: OpenItem): string {
  if (item.type === "path") return item.path.split(/[\\/]/).pop() ?? item.path;
  if (item.type === "file") return item.file.name;
  const first = item.entries[0] as (File & { _mtrPath?: string }) | undefined;
  return first?._mtrPath?.split("/")[0] ?? t("landing.chooseFolder");
}
</script>

<template>
  <DropOverlay @drop="onWebDrop">
    <div class="page landing">
      <!-- 桌面端无边框：顶栏 deep 拖拽区（按钮/链接仍可点击）；右侧为窗口控制按钮 -->
      <header class="landing__topbar" data-tauri-drag-region="deep">
        <div class="landing__brand">
          <Image :size="22" class="landing__brand-icon" />
          <span class="landing__brand-name">{{ $t("common.appName") }}</span>
        </div>
        <div class="landing__topbar-actions">
          <RouterLink to="/library" class="landing__nav">
            <Library :size="16" />
            <span>{{ $t("landing.historyTitle") }}</span>
          </RouterLink>
          <IconButton
            :icon="Settings2"
            :label="$t('reader.settings')"
            placement="bottom"
            :active="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          />
          <WindowControls />
        </div>
      </header>

      <main class="landing__content">
        <!-- Hero -->
        <section class="hero">
          <p class="hero__domain">{{ $t("common.appName") }} · mhydq.com</p>
          <h1 class="hero__title">{{ $t("landing.heroTitle") }}</h1>
          <p class="hero__subtitle">
            {{ $t(SUPPORTS_FOLDER ? "landing.heroSubtitle" : "landing.heroSubtitleNoFolder") }}
          </p>
          <div class="hero__actions">
            <button class="btn btn--primary btn--lg" type="button" @click="openFlow.pickFiles()">
              <Rocket :size="18" />
              <span>{{ $t("landing.startReading") }}</span>
            </button>
            <button
              v-if="SUPPORTS_FOLDER"
              class="btn btn--ghost btn--lg"
              type="button"
              @click="openFlow.pickFolder()"
            >
              <Folder :size="18" />
              <span>{{ $t("landing.chooseFolder") }}</span>
            </button>
          </div>
          <p class="hero__hint">
            {{ $t(SUPPORTS_FOLDER ? "landing.orDragHere" : "landing.orDragHereNoFolder") }}
          </p>
        </section>

        <!-- 亮点（使用方式融入亮点说明） -->
        <section class="highlights">
          <h2 class="section-title">{{ $t("landing.highlightsTitle") }}</h2>
          <div class="highlights__grid">
            <article v-for="item in highlights" :key="item.title" class="highlight-card">
              <span class="highlight-card__icon"><component :is="item.icon" :size="20" /></span>
              <h3 class="highlight-card__title">{{ item.title }}</h3>
              <p class="highlight-card__desc">{{ item.desc }}</p>
            </article>
          </div>
        </section>
      </main>
    </div>

    <!-- 底部悬浮信息条：桌面端 / 开源（桌面应用内不再宣传桌面端） -->
    <footer class="landing__dock">
      <template v-if="!IS_TAURI">
        <span class="landing__dock-item">
          <Monitor :size="14" />
          <span>{{ $t("landing.footerDesktop") }}</span>
        </span>
        <span class="landing__dock-divider" aria-hidden="true"></span>
      </template>
      <span class="landing__dock-item">
        <a class="landing__dock-link" :href="GITHUB_URL" @click.prevent="openExternal(GITHUB_URL)">
          <Github :size="14" />
          <span>{{ $t("landing.footerOpenSource") }}</span>
        </a>
      </span>
    </footer>

    <!-- 设置面板：仅外观（语言/主题），不展示漫画专用设置项 -->
    <SettingsPanel
      :open="settingsOpen"
      appearance-only
      @close="settingsOpen = false"
    />

    <!-- 多文件选择弹窗 -->
    <AppModal
      :open="showPickerModal"
      :title="t('landing.historyTitle')"
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
            <FileText v-else :size="18" />
            <span class="picker-list__name">{{ pendingLabel(item) }}</span>
          </button>
        </li>
      </ul>
    </AppModal>
  </DropOverlay>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.landing {
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

  &__nav {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none; // 全局 a:hover 下划线对导航按钮不适用
    transition: background 0.15s ease, color 0.15s ease;
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
      text-decoration: none;
    }
  }

  &__content {
    max-width: 880px;
    margin: 0 auto;
    // 底部留出悬浮信息条的高度，避免遮挡最后一屏内容
    padding: 40px 24px 96px;
    display: flex;
    flex-direction: column;
    gap: 48px;
  }

  // 底部悬浮信息条：居中悬浮胶囊
  &__dock {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    max-width: calc(100vw - 32px);
    padding: 9px 18px;
    border-radius: 999px;
    background: var(--bg-glass);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-1);
    box-shadow: var(--shadow-2);
    color: var(--text-2);
    font-size: 12.5px;
    text-align: center;
  }

  &__dock-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &__dock-divider {
    flex: none;
    width: 1px;
    height: 14px;
    background: var(--border-2);
  }

  &__dock-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: inherit;
    text-decoration: none; // 全局 a:hover 下划线对链接条目不适用
    @include focus-ring;

    &:hover {
      color: var(--text-1);
      text-decoration: none;
    }
  }

  // 窄屏下悬浮条改为贴底信息栏，避免换行成团遮挡内容
  @media (max-width: 640px) {
    &__dock {
      left: 12px;
      right: 12px;
      bottom: 12px;
      transform: none;
      flex-direction: column;
      gap: 4px;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      font-size: 12px;
    }

    &__dock-divider {
      display: none;
    }
  }
}

.hero {
  text-align: center;
  padding-top: 32px;

  &__domain {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--border-1);
    background: var(--bg-surface);
    color: var(--text-2);
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  &__title {
    font-size: clamp(26px, 4.5vw, 40px);
    font-weight: 800;
    letter-spacing: -0.5px;
    color: var(--text-1);
  }

  &__subtitle {
    max-width: 560px;
    margin: 14px auto 0;
    color: var(--text-2);
    font-size: 15px;
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 28px;
    flex-wrap: wrap;
  }

  &__hint {
    margin-top: 14px;
    color: var(--text-3);
    font-size: 12.5px;
  }
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-1);
}

.highlights {
  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
  }
}

.highlight-card {
  @include card;

  padding: 18px;

  &__icon {
    display: inline-grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 12px;
  }

  &__title {
    font-size: 14.5px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  &__desc {
    font-size: 13px;
    color: var(--text-2);
    line-height: 1.6;
  }
}

// 通用按钮
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 14px;
  transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
  @include focus-ring;

  &--lg {
    padding: 12px 26px;
    font-size: 15px;
  }

  &--primary {
    background: var(--accent);
    color: var(--text-on-accent);
    box-shadow: var(--shadow-1);

    &:hover {
      background: var(--accent-hover);
    }

    &:active {
      transform: translateY(1px);
    }
  }

  &--ghost {
    border: 1px solid var(--border-2);
    color: var(--text-1);
    background: var(--bg-surface);

    &:hover {
      background: var(--bg-hover);
    }
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
