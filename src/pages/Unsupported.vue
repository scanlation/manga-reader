<script setup lang="ts">
// 「暂不支持」页：浏览器缺少网页端最低能力（Worker / WebAssembly 等）时由路由守卫切入，
// 建议改用桌面端或现代浏览器；提供"仍要继续访问"入口以兼容能力误判的极端情况。
import { MonitorX } from "lucide-vue-next";
import { useRouter } from "vue-router";

import LangSwitcher from "@/components/ui/LangSwitcher.vue";
import ThemeToggle from "@/components/ui/ThemeToggle.vue";
import { Image } from "lucide-vue-next";

const router = useRouter();
</script>

<template>
  <div class="page unsupported">
    <header class="unsupported__topbar">
      <div class="unsupported__brand">
        <Image :size="22" />
        <span class="unsupported__brand-name">{{ $t("common.appName") }}</span>
      </div>
      <div class="unsupported__topbar-actions">
        <LangSwitcher />
        <ThemeToggle />
      </div>
    </header>

    <main class="unsupported__content">
      <span class="unsupported__icon"><MonitorX :size="44" /></span>
      <h1 class="unsupported__title">{{ $t("landing.unsupportedTitle") }}</h1>
      <p class="unsupported__desc">{{ $t("landing.unsupportedDesc") }}</p>
      <button class="unsupported__retry" type="button" @click="router.push('/')">
        {{ $t("landing.unsupportedStillTry") }}
      </button>
    </main>
  </div>
</template>

<style scoped lang="scss">
.unsupported {
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

  &__content {
    max-width: 560px;
    margin: 0 auto;
    padding: 96px 24px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  &__icon {
    display: inline-grid;
    place-items: center;
    width: 84px;
    height: 84px;
    border-radius: var(--radius-lg, 16px);
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 24px;
  }

  &__title {
    font-size: 24px;
    font-weight: 800;
    color: var(--text-1);
  }

  &__desc {
    margin-top: 12px;
    color: var(--text-2);
    font-size: 14.5px;
    line-height: 1.7;
  }

  &__retry {
    margin-top: 28px;
    padding: 10px 20px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-2);
    color: var(--text-1);
    background: var(--bg-surface);
    font-weight: 600;
    font-size: 14px;

    &:hover {
      background: var(--bg-hover);
    }
  }
}
</style>
