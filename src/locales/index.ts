// i18n 入口：以 zh-CN 的结构为 schema 源，其余语言用类型约束保证词条齐全。
import { createI18n } from "vue-i18n";

import en from "./en";
import ja from "./ja";
import zhCN from "./zh-CN";
import zhTW from "./zh-TW";

export const SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en", "ja"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
};

// schema 源类型：新增词条先在 zh-CN.ts 加，其他语言缺失/多出的 key 会在编译期报错。
// 值统一放宽为 string（不同语言文案长度不同），只校验结构。
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};
export type MessageSchema = DeepStringify<typeof zhCN>;

const STORAGE_KEY = "mtr:locale";

export function detectLocale(): AppLocale {
  const saved = localStorage.getItem(STORAGE_KEY) as AppLocale | null;
  if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) {
    return saved;
  }
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("zh-tw") || nav.startsWith("zh-hant")) return "zh-TW";
  if (nav.startsWith("zh")) return "zh-CN";
  if (nav.startsWith("ja")) return "ja";
  return "en";
}

export function persistLocale(locale: AppLocale) {
  localStorage.setItem(STORAGE_KEY, locale);
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
    "zh-TW": zhTW,
    en,
    ja,
  },
});

export default i18n;
