<script setup lang="ts">
// 开关（toggle switch）。
const props = defineProps<{
  modelValue: boolean;
  label?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ change: [value: boolean] }>();

function toggle() {
  if (!props.disabled) emit("change", !props.modelValue);
}
</script>

<template>
  <button
    class="toggle"
    :class="{ 'toggle--on': modelValue }"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="toggle__thumb" />
  </button>
</template>

<style scoped lang="scss">
.toggle {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--bg-active);
  transition: background 0.18s ease;
  flex-shrink: 0;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  &--on {
    background: var(--accent);
  }

  &__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg-surface);
    box-shadow: var(--shadow-1);
    transition: transform 0.18s ease;
  }

  &--on .toggle__thumb {
    transform: translateX(16px);
    background: #fff;
  }
}
</style>
