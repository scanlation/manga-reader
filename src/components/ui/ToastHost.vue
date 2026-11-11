<script setup lang="ts">
// Toast 容器：左上角提示条 + 阻塞性错误 Alert 对话框（全屏遮罩，点关闭才消失）。
import { computed } from "vue";
import { TriangleAlert, X } from "lucide-vue-next";

import { toastState, useToast } from "./useToast";

const { dismiss } = useToast();

const toasts = computed(() => toastState.items.filter((t) => !t.alert));
const alert = computed(() => toastState.items.find((t) => t.alert) ?? null);
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="pop">
      <div v-for="item in toasts" :key="item.id" class="toast">
        <span class="toast__message">{{ item.message }}</span>
        <button
          v-if="item.actionLabel && item.action"
          class="toast__action"
          type="button"
          @click="item.action(); dismiss(item.id)"
        >
          {{ item.actionLabel }}
        </button>
        <button
          class="toast__close"
          type="button"
          :aria-label="$t('common.close')"
          @click="dismiss(item.id)"
        >
          <X :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>

  <!-- 阻塞性错误 Alert：遮罩 + 居中卡片 -->
  <Transition name="pop">
    <div v-if="alert" class="alert" role="alertdialog" aria-modal="true">
      <div class="alert__mask" />
      <div class="alert__card">
        <TriangleAlert class="alert__icon" :size="28" aria-hidden="true" />
        <p class="alert__message">{{ alert.message }}</p>
        <button class="alert__close" type="button" @click="dismiss(alert.id)">
          {{ $t("common.close") }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.toast-host {
  position: fixed;
  top: 16px;
  left: 16px;
  right: auto;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  pointer-events: none;
}

.toast {
  @include panel-glass;

  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(90vw, 480px);
  padding: 10px 14px;
  border-radius: var(--radius-md);
  pointer-events: auto;

  &__message {
    @include ellipsis;
  }

  &__action {
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
    @include focus-ring;

    &:hover {
      text-decoration: underline;
    }
  }

  &__close {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    color: var(--text-3);
    @include focus-ring;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-1);
    }
  }
}

// ---------- 阻塞性错误 Alert ----------
.alert {
  position: fixed;
  inset: 0;
  // 与 toast 同层级，靠 DOM 顺序（渲染在 toast-host 之后）盖在上面
  z-index: var(--z-toast);
  display: grid;
  place-items: center;
  pointer-events: auto;

  &__mask {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--bg-page) 55%, transparent);
    backdrop-filter: blur(2px);
  }

  &__card {
    @include panel-glass;

    box-shadow: var(--shadow-2);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: min(88vw, 360px);
    padding: 24px 22px;
    border-radius: var(--radius-lg);
    text-align: center;
  }

  &__icon {
    color: var(--danger);
  }

  &__message {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    color: var(--text-1);
    line-height: 1.5;
  }

  &__close {
    padding: 6px 22px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--text-on-accent);
    font-weight: 600;
    @include focus-ring;

    &:hover {
      background: var(--accent-hover);
    }
  }
}
</style>
