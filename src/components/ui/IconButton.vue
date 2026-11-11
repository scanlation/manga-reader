<script setup lang="ts">
// 图标按钮 + 纯 CSS tooltip（data-tooltip 属性，hover/focus 显示）。
// placement: 上工具条按钮向下弹出，下工具条按钮向上弹出。
import type { FunctionalComponent } from "vue";

const props = withDefaults(
  defineProps<{
    icon: FunctionalComponent;
    label: string;
    placement?: "top" | "bottom";
    disabled?: boolean;
    active?: boolean;
  }>(),
  { placement: "top", disabled: false, active: false },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

function onClick(event: MouseEvent) {
  if (!props.disabled) emit("click", event);
}
</script>

<template>
  <button
    class="icon-btn"
    :class="{ 'icon-btn--active': active }"
    type="button"
    :data-tooltip="label"
    :data-placement="placement"
    :aria-label="label"
    :disabled="disabled"
    @click="onClick"
  >
    <component :is="icon" :size="18" />
  </button>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.icon-btn {
  --tooltip-opacity: 0;
  --tooltip-shift: 4px;

  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  @include focus-ring;

  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--bg-hover);
    color: var(--text-1);
    --tooltip-opacity: 1;
    --tooltip-shift: 0px;
  }

  &--active {
    color: var(--accent);
    background: var(--accent-soft);
  }

  &::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 50%;
    z-index: 10;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-surface-2);
    border: 1px solid var(--border-1);
    color: var(--text-1);
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    opacity: var(--tooltip-opacity);
    transform: translateX(-50%) translateY(var(--tooltip-shift));
    transition: opacity 0.12s ease var(--tooltip-delay), transform 0.12s ease
        var(--tooltip-delay);
    box-shadow: var(--shadow-1);
  }

  &[data-placement="top"]::after {
    bottom: calc(100% + 6px);
  }

  &[data-placement="bottom"]::after {
    top: calc(100% + 6px);
  }
}
</style>
