<script setup lang="ts">
// 设置面板：schema 驱动 —— 新增设置项只需扩展 settingSections 定义与渲染分支。
// 分区：外观（语言/主题）、阅读（背景/预加载/滚轮翻页/日漫模式）。
// 首页等无阅读上下文的页面传 appearanceOnly，只展示外观分区（语言/主题）。
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import SidePanel from "@/components/ui/SidePanel.vue";
import Segmented from "@/components/ui/Segmented.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import NumberInput from "@/components/ui/NumberInput.vue";
import AppModal from "@/components/ui/AppModal.vue";
import { useToast } from "@/components/ui/useToast";
import { Github, Info } from "lucide-vue-next";
import { IS_MOBILE } from "@/lib/capabilities";
import { usePortraitOrientation } from "@/lib/viewport";
import { GITHUB_URL, openExternal } from "@/lib/open-url";
import {
  BG_VALUES,
  useSettingsStore,
  type ReadMode,
  type ReadingBg,
} from "@/stores/settings";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  persistLocale,
  type AppLocale,
} from "@/locales";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 仅外观（语言/主题）：着陆页等无阅读上下文的页面复用同一面板 */
    appearanceOnly?: boolean;
  }>(),
  { appearanceOnly: false },
);

const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();
const settings = useSettingsStore();
const theme = useThemeStore();
const toast = useToast();

// 手机竖屏不支持双页模式：选择时弹提示要求横屏，且不应用选择
const isPortrait = usePortraitOrientation();

// 关于本项目弹窗
const aboutOpen = ref(false);
// vite define 注入的构建版本（package.json version）
const appVersion = __APP_VERSION__;

// ---------- schema ----------
interface SettingRow {
  kind: "segmented" | "toggle" | "select" | "number";
  labelKey: string;
  hintKey?: string;
  // segmented
  options?: { value: string; label?: string; swatch?: string }[];
  // toggle
  get?: () => boolean;
  set?: (v: boolean) => void;
  // segmented / select
  value?: () => string;
  change?: (v: string) => void;
  // number（步进输入框）
  numValue?: () => number;
  numChange?: (v: number) => void;
  numMin?: number;
  numMax?: number;
  numStep?: number;
  numSuffix?: string;
}

interface SettingSection {
  labelKey: string;
  rows: SettingRow[];
}

// 选项数组用 computed 跟随语言与文案变化（t() 不能在初始化时静态求值）
const bgOptions = computed(() =>
  (["black", "dark", "gray", "white"] as ReadingBg[]).map((key) => ({
    value: key,
    swatch: BG_VALUES[key],
    label: t(`settings.bg${key[0].toUpperCase()}${key.slice(1)}`),
  })),
);

const themeOptions = computed(() =>
  (["light", "dark", "system"] as ThemeMode[]).map((mode) => ({
    value: mode,
    label: t(
      mode === "light"
        ? "settings.themeLight"
        : mode === "dark"
          ? "settings.themeDark"
          : "settings.themeSystem",
    ),
  })),
);

const langOptions = computed(() =>
  SUPPORTED_LOCALES.map((loc) => ({
    value: loc,
    label: LOCALE_LABELS[loc],
  })),
);

const readModeOptions = computed(() => [
  { value: "single", label: t("settings.readModeSingle") },
  { value: "dual", label: t("settings.readModeDual") },
  { value: "waterfall", label: t("settings.readModeWaterfall") },
]);

/** 安全区宽度按 5% 递进：手输值四舍五入到最近的 5。 */
function setSafeArea(v: number) {
  settings.patch({ safeAreaWidth: Math.round(v / 5) * 5 });
}

function changeLocale(v: string) {
  locale.value = v as AppLocale;
  persistLocale(v as AppLocale);
}

function changeReadMode(v: string) {
  // 手机竖屏下双页（左右拼页）没有可用宽度：弹提示要求横屏，且不应用选择
  if (v === "dual" && IS_MOBILE && isPortrait.value) {
    toast.show(t("settings.dualNeedsLandscape"), { alert: true });
    return;
  }
  settings.patch({ readMode: v as ReadMode });
}

const appearanceSection = computed<SettingSection>(() => ({
  labelKey: "settings.appearance",
  rows: [
    {
      kind: "segmented",
      labelKey: "settings.language",
      options: langOptions.value,
      value: () => locale.value,
      change: (v) => changeLocale(v),
    },
    {
      kind: "segmented",
      labelKey: "settings.theme",
      options: themeOptions.value,
      // 展示当前选择模式；"跟随系统"是模式而非解析值
      value: () => theme.mode,
      change: (v) => theme.setMode(v as ThemeMode),
    },
  ],
}));

const readingSection = computed<SettingSection>(() => ({
  labelKey: "settings.reading",
  rows: [
    { kind: "segmented", labelKey: "settings.readMode", hintKey: "settings.readModeHint", options: readModeOptions.value, value: () => settings.settings.readMode, change: (v) => changeReadMode(v) },
    // 双页模式专属：页偏移（微调配对相位）
    ...(settings.settings.readMode === "dual"
      ? [
          {
            kind: "number" as const,
            labelKey: "settings.dualPageOffset",
            hintKey: "settings.dualPageOffsetHint",
            numValue: () => settings.settings.dualPageOffset,
            numChange: (v: number) => settings.patch({ dualPageOffset: v }),
            numMin: -1,
            numMax: 1,
            numStep: 1,
          },
        ]
      : []),
    { kind: "segmented", labelKey: "settings.readingBg", options: bgOptions.value, value: () => settings.settings.readingBg, change: (v) => settings.patch({ readingBg: v as ReadingBg }) },
    { kind: "number", labelKey: "settings.safeAreaWidth", hintKey: "settings.safeAreaHint", numValue: () => settings.settings.safeAreaWidth, numChange: setSafeArea, numMin: 0, numMax: 50, numStep: 5, numSuffix: "%" },
    { kind: "toggle", labelKey: "settings.wheelPageTurn", hintKey: "settings.wheelPageTurnHint", get: () => settings.settings.wheelPageTurn, set: (v) => settings.patch({ wheelPageTurn: v }) },
    { kind: "toggle", labelKey: "settings.rtl", hintKey: "settings.rtlHint", get: () => settings.settings.rtl, set: (v) => settings.patch({ rtl: v }) },
  ],
}));

const autoSection = computed<SettingSection>(() => ({
  labelKey: "settings.autoAndPreload",
  rows: [
    { kind: "number", labelKey: "settings.autoPageInterval", hintKey: "settings.autoPageHint", numValue: () => settings.settings.autoPageInterval, numChange: (v) => settings.patch({ autoPageInterval: v }), numMin: 0, numMax: 600, numStep: 1, numSuffix: t("settings.unitSeconds") },
    { kind: "number", labelKey: "settings.preloadCount", hintKey: "settings.preloadHint", numValue: () => settings.settings.preloadCount, numChange: (v) => settings.patch({ preloadCount: v }), numMin: 0, numMax: 5, numStep: 1 },
  ],
}));

const sections = computed<SettingSection[]>(() =>
  props.appearanceOnly
    ? [appearanceSection.value]
    : [appearanceSection.value, readingSection.value, autoSection.value],
);
</script>

<template>
  <SidePanel :open="props.open" :title="$t('settings.title')" side="right" width="420px" @close="emit('close')">
    <section v-for="(section, si) in sections" :key="si" class="settings-section">
      <h4 class="settings-section__title">{{ $t(section.labelKey) }}</h4>
      <div v-for="(row, ri) in section.rows" :key="ri" class="settings-row">
        <div class="settings-row__main">
          <span class="settings-row__label">{{ $t(row.labelKey) }}</span>

          <Segmented
            v-if="row.kind === 'segmented' && row.options"
            :options="row.options"
            :model-value="row.value?.() ?? ''"
            :aria-label="$t(row.labelKey)"
            @change="row.change?.($event)"
          />
          <NumberInput
            v-else-if="row.kind === 'number'"
            :model-value="row.numValue?.() ?? 0"
            :min="row.numMin ?? 0"
            :max="row.numMax ?? 999999"
            :step="row.numStep"
            :suffix="row.numSuffix"
            :width="46"
            :aria-label="$t(row.labelKey)"
            @submit="row.numChange?.($event)"
          />
          <ToggleSwitch
            v-else-if="row.kind === 'toggle'"
            :model-value="row.get?.() ?? false"
            :aria-label="$t(row.labelKey)"
            @change="row.set?.($event)"
          />
        </div>

        <!-- 说明信息独立一行，不挤占操作项空间 -->
        <span v-if="row.hintKey" class="settings-row__hint">{{ $t(row.hintKey) }}</span>
      </div>
    </section>

    <!-- 关于本项目：所有页面（含仅外观模式）都展示 -->
    <div class="settings-about">
      <button class="settings-about__btn" type="button" @click="aboutOpen = true">
        <Info :size="15" />
        <span>{{ $t("about.title") }}</span>
      </button>
    </div>
  </SidePanel>

  <!-- 关于本项目弹窗 -->
  <AppModal :open="aboutOpen" :title="$t('about.title')" :max-width="420" @close="aboutOpen = false">
    <div class="about">
      <img class="about__icon" src="/icon-512.png" alt="" />
      <p class="about__name">{{ $t("common.appName") }}</p>
      <p class="about__version num">v{{ appVersion }}</p>
      <p class="about__desc">{{ $t("about.desc") }}</p>
      <button class="about__github" type="button" @click="openExternal(GITHUB_URL)">
        <Github :size="15" />
        <span>{{ $t("about.github") }}</span>
      </button>
      <p class="about__privacy">{{ $t("landing.privacyNote") }}</p>
    </div>
  </AppModal>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.settings-section {
  margin-bottom: 20px;

  &__title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-3);
    margin-bottom: 8px;
  }
}

.settings-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;

  // 第一行：标签 + 操作项两端对齐
  &__main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 30px;
  }

  &__label {
    font-size: 13.5px;
    color: var(--text-1);
    min-width: 0;
  }

  &__hint {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-3);
  }
}

// ---------- 关于本项目 ----------
.settings-about {
  border-top: 1px solid var(--border-1);
  padding-top: 12px;
  margin-top: 4px;

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-2);
    background: var(--bg-surface);
    color: var(--text-1);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.15s ease, border-color 0.15s ease;
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
    }
  }
}

.about {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  padding: 8px 0 4px;

  &__icon {
    width: 64px;
    height: 64px;
    margin-bottom: 8px;
    border-radius: 14px;
  }

  &__name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-1);
  }

  &__version {
    font-size: 12px;
    color: var(--text-3);
  }

  &__desc {
    font-size: 13px;
    color: var(--text-2);
    line-height: 1.6;
    margin-top: 6px;
  }

  &__github {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-2);
    background: var(--bg-surface);
    color: var(--text-1);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.15s ease, border-color 0.15s ease;
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
    }
  }

  &__privacy {
    font-size: 12px;
    color: var(--text-3);
    margin-top: 8px;
  }
}
</style>
