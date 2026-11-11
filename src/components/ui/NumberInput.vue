<script setup lang="ts">
// 数字输入框：Enter 提交，失焦提交。提供 step 时渲染为步进控件：
// [−] 输入区（可带单位后缀） [+]，按钮按 step 增减并钳制在 min/max。
import { computed, ref, watch } from "vue";
import { Minus, Plus } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    width?: number;
    ariaLabel?: string;
    disabled?: boolean;
    /** 提供即显示左右加减按钮（步进步长） */
    step?: number;
    /** 步进模式下的单位后缀（如 %、秒） */
    suffix?: string;
  }>(),
  { min: 1, max: 999999, width: 56, disabled: false, step: undefined, suffix: "" },
);

const emit = defineEmits<{
  update: [value: number];
  submit: [value: number];
}>();

const hasStepper = computed(() => props.step !== undefined);

const editing = ref(false);
const draft = ref(String(props.modelValue));

watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) draft.value = String(v);
  },
);

const parsed = computed(() => {
  const n = Number.parseInt(draft.value, 10);
  return Number.isNaN(n) ? null : n;
});

const canDec = computed(
  () => !props.disabled && (parsed.value ?? props.modelValue) > props.min,
);
const canInc = computed(
  () => !props.disabled && (parsed.value ?? props.modelValue) < props.max,
);

function commit() {
  // 只在编辑过时提交：Enter 提交后主动 blur 会再触发 @blur，
  // 此时 props.modelValue 尚未回流，旧值二次提交会把跳页"弹回去"。
  if (!editing.value) return;
  editing.value = false;
  if (parsed.value !== null) {
    const clamped = Math.min(props.max, Math.max(props.min, parsed.value));
    if (clamped !== props.modelValue) emit("update", clamped);
    emit("submit", clamped);
  }
  draft.value = String(props.modelValue);
}

function onEnter() {
  commit();
  (document.activeElement as HTMLElement | null)?.blur();
}

/** 步进按钮：基于当前草稿值（无效时取 modelValue）加减一步。 */
function nudge(dir: 1 | -1) {
  if (props.disabled) return;
  const base = parsed.value ?? props.modelValue;
  const clamped = Math.min(props.max, Math.max(props.min, base + dir * (props.step ?? 1)));
  editing.value = false;
  draft.value = String(clamped);
  if (clamped !== props.modelValue) emit("update", clamped);
  emit("submit", clamped);
}
</script>

<template>
  <span v-if="hasStepper" class="num-step" :class="{ 'num-step--disabled': disabled }">
    <button
      class="num-step__btn"
      type="button"
      :aria-label="$t('common.decrease')"
      :disabled="!canDec"
      @click="nudge(-1)"
    >
      <Minus :size="14" />
    </button>
    <input
      v-model="draft"
      class="num-step__input num"
      :style="{ width: `${width}px` }"
      :class="{ 'num-input--invalid': parsed === null }"
      type="text"
      inputmode="numeric"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @focus="editing = true"
      @blur="commit"
      @keydown.enter="onEnter"
    />
    <span v-if="suffix" class="num-step__suffix">{{ suffix }}</span>
    <button
      class="num-step__btn"
      type="button"
      :aria-label="$t('common.increase')"
      :disabled="!canInc"
      @click="nudge(1)"
    >
      <Plus :size="14" />
    </button>
  </span>
  <input
    v-else
    v-model="draft"
    class="num-input num"
    :style="{ width: `${width}px` }"
    :class="{ 'num-input--invalid': parsed === null }"
    type="text"
    inputmode="numeric"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @focus="editing = true"
    @blur="commit"
    @keydown.enter="onEnter"
  />
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.num-input {
  height: 30px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-1);
  background: var(--bg-surface-2);
  color: var(--text-1);
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease;
  @include focus-ring;

  &:focus {
    outline: none;
    border-color: var(--accent);
  }

  &--invalid {
    border-color: var(--danger);
  }
}

.num-step {
  display: inline-flex;
  align-items: center;
  height: 30px;
  flex-shrink: 0; // 布局挤压时保持完整，避免后缀/加号被裁剪
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-1);
  background: var(--bg-surface-2);
  overflow: hidden;
  transition: border-color 0.15s ease;

  &:focus-within {
    border-color: var(--accent);
  }

  &--disabled {
    opacity: 0.5;
  }

  &__btn {
    width: 26px;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--text-2);
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-1);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__input {
    height: 100%;
    padding: 0 2px;
    border: none;
    border-radius: 0;
    background: transparent;
    text-align: center;

    &:focus {
      outline: none;
      border: none;
    }
  }

  &__suffix {
    font-size: 12px;
    color: var(--text-3);
    padding-right: 6px;
    flex-shrink: 0;
    user-select: none;
  }
}
</style>
