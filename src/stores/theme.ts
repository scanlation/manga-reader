// 主题状态：跟随系统 + 手动切换，localStorage 持久化。
import { defineStore } from "pinia";
import { ref } from "vue";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "mtr:theme";

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const useThemeStore = defineStore("theme", () => {
  const mode = ref<ThemeMode>(
    (localStorage.getItem(STORAGE_KEY) as ThemeMode) ?? "system",
  );

  const resolved = ref<ResolvedTheme>(
    mode.value === "system" ? systemTheme() : mode.value,
  );

  function apply() {
    resolved.value = mode.value === "system" ? systemTheme() : mode.value;
    document.documentElement.dataset.theme = resolved.value;
  }

  function setMode(next: ThemeMode) {
    mode.value = next;
    localStorage.setItem(STORAGE_KEY, next);
    apply();
  }

  // 系统主题变化时联动
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (mode.value === "system") apply();
    });

  apply();

  return { mode, resolved, setMode };
});
