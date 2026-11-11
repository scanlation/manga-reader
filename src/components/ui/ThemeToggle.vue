<script setup lang="ts">
// 主题切换按钮：浅色/深色/跟随系统 循环切换，图标随状态变化。
import { computed } from "vue";
import { Moon, Sun, MonitorCog } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

import { useThemeStore, type ThemeMode } from "@/stores/theme";

const { t } = useI18n();
const themeStore = useThemeStore();

const icon = computed(() => {
  if (themeStore.mode === "light") return Sun;
  if (themeStore.mode === "dark") return Moon;
  return MonitorCog;
});

const label = computed(() => {
  if (themeStore.mode === "light") return t("settings.themeLight");
  if (themeStore.mode === "dark") return t("settings.themeDark");
  return t("settings.themeSystem");
});

const ORDER: ThemeMode[] = ["light", "dark", "system"];

function cycle() {
  const idx = ORDER.indexOf(themeStore.mode);
  themeStore.setMode(ORDER[(idx + 1) % ORDER.length]);
}
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="label"
    :data-tooltip="label"
    @click="cycle"
  >
    <component :is="icon" :size="18" />
  </button>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.theme-toggle {
  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  transition: background 0.15s ease, color 0.15s ease;
  @include focus-ring;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-1);
  }

  &::after {
    content: attr(data-tooltip);
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-surface-2);
    border: 1px solid var(--border-1);
    color: var(--text-1);
    font-size: 12px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease var(--tooltip-delay);
    box-shadow: var(--shadow-1);
  }

  &:hover::after {
    opacity: 1;
  }
}
</style>
