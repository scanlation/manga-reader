<script setup lang="ts">
// 分段选择器（segmented control）：用于主题/背景色等互斥选项。
const props = defineProps<{
  options: { value: string; label?: string; swatch?: string; title?: string }[];
  modelValue: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ change: [value: string] }>();

function select(value: string) {
  emit("change", value);
}
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="opt in props.options"
      :key="opt.value"
      class="segmented__item"
      :class="{ 'segmented__item--active': opt.value === modelValue }"
      type="button"
      role="radio"
      :aria-checked="opt.value === modelValue"
      :title="opt.title"
      @click="select(opt.value)"
    >
      <span
        v-if="opt.swatch"
        class="segmented__swatch"
        :style="{ '--swatch': opt.swatch }"
      />
      <span v-if="opt.label">{{ opt.label }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  gap: 2px;

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    font-size: 13px;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      color: var(--text-1);
    }

    &--active {
      background: var(--bg-surface);
      color: var(--text-1);
      box-shadow: var(--shadow-1);
    }
  }

  &__swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--swatch);
    border: 1px solid var(--border-2);
  }
}
</style>
