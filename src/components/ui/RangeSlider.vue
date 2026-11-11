<script setup lang="ts">
// 进度滑杆：原生 range 美化；拖动期间不触发自动隐藏逻辑（由父层监听 pointerdown/up）。
const props = withDefaults(
  defineProps<{
    min?: number;
    max: number;
    modelValue: number;
    ariaLabel?: string;
    disabled?: boolean;
  }>(),
  { min: 1, disabled: false },
);

const emit = defineEmits<{ update: [value: number] }>();

function onInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit("update", value);
}
</script>

<template>
  <input
    class="range-slider"
    :style="{ '--fill': `${((modelValue - min) / Math.max(1, max - min)) * 100}%` }"
    type="range"
    :min="min"
    :max="max"
    :value="modelValue"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @input="onInput"
  />
</template>

<style scoped lang="scss">
.range-slider {
  appearance: none;
  -webkit-appearance: none;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--fill, 0%),
    var(--bg-active) var(--fill, 0%),
    var(--bg-active) 100%
  );
  cursor: pointer;
  width: 100%;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg-glass);
    box-shadow: var(--shadow-1);
    transition: transform 0.12s ease;

    &:hover {
      transform: scale(1.15);
    }
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg-glass);
    box-shadow: var(--shadow-1);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
}
</style>
