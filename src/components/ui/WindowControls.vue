<script setup lang="ts">
// Tauri 无边框窗口控制按钮：最小化 / 最大化(还原) / 关闭，仅桌面端渲染。
// 依赖 capabilities 中的 core:window:allow-minimize / allow-toggle-maximize / allow-close
// （core:default 已含 allow-is-maximized 查询权限）。
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Copy, Minus, Square, X } from "lucide-vue-next";

import { IS_TAURI } from "@/lib/platform";

const { t } = useI18n();

const maximized = ref(false);
let unlistenResized: (() => void) | null = null;

onMounted(() => {
  if (!IS_TAURI) return;
  void (async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    maximized.value = await win.isMaximized();
    // 最大化状态变化（含双击标题栏 / 系统贴靠）→ 同步还原图标
    unlistenResized = await win.onResized(async () => {
      maximized.value = await win.isMaximized();
    });
  })();
});

onBeforeUnmount(() => {
  unlistenResized?.();
  unlistenResized = null;
});

function minimize() {
  if (!IS_TAURI) return;
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
    getCurrentWindow().minimize(),
  );
}

function toggleMaximize() {
  if (!IS_TAURI) return;
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
    getCurrentWindow().toggleMaximize(),
  );
}

function close() {
  if (!IS_TAURI) return;
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
    getCurrentWindow().close(),
  );
}
</script>

<template>
  <div v-if="IS_TAURI" class="win-controls">
    <button
      class="win-controls__btn"
      type="button"
      :aria-label="t('common.minimize')"
      :title="t('common.minimize')"
      @click="minimize"
    >
      <Minus :size="15" />
    </button>
    <button
      class="win-controls__btn"
      type="button"
      :aria-label="t(maximized ? 'common.restore' : 'common.maximize')"
      :title="t(maximized ? 'common.restore' : 'common.maximize')"
      @click="toggleMaximize"
    >
      <Copy v-if="maximized" :size="13" />
      <Square v-else :size="13" />
    </button>
    <button
      class="win-controls__btn win-controls__btn--close"
      type="button"
      :aria-label="t('common.close')"
      :title="t('common.close')"
      @click="close"
    >
      <X :size="15" />
    </button>
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.win-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;

  &__btn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    transition: background 0.15s ease, color 0.15s ease;
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }

    // 关闭：图标常驻红色，悬停底色变红、图标反白，略凸显危险操作
    &--close {
      color: var(--danger);

      &:hover {
        background: var(--danger);
        color: #fff;
      }
    }
  }
}
</style>
