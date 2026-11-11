<script setup lang="ts">
// 语言切换器：下拉选择四语言，选择即切换并持久化。
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Languages } from "lucide-vue-next";

import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  persistLocale,
  type AppLocale,
} from "@/locales";

const { locale } = useI18n();
const open = ref(false);

function pick(next: AppLocale) {
  locale.value = next;
  persistLocale(next);
  open.value = false;
}
</script>

<template>
  <div class="lang-switcher">
    <button
      class="lang-switcher__trigger"
      type="button"
      :aria-label="$t('settings.language')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Languages :size="18" />
      <span class="lang-switcher__current">{{ LOCALE_LABELS[locale as AppLocale] }}</span>
    </button>
    <Transition name="pop">
      <ul v-if="open" class="lang-switcher__menu" role="listbox">
        <li v-for="loc in SUPPORTED_LOCALES" :key="loc">
          <button
            class="lang-switcher__item"
            :class="{ 'lang-switcher__item--active': loc === locale }"
            type="button"
            role="option"
            :aria-selected="loc === locale"
            @click="pick(loc)"
          >
            {{ LOCALE_LABELS[loc] }}
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.lang-switcher {
  position: relative;

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }
  }

  &__current {
    font-size: 13px;
  }

  &__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    min-width: 140px;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--bg-surface);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-2);
  }

  &__item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    font-size: 13px;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }

    &--active {
      color: var(--accent);
      background: var(--accent-soft);
    }
  }
}
</style>
