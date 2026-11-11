<script setup lang="ts">
// 居中模态框：文件选择（多文件拖入时）、确认等。
const props = defineProps<{
  open: boolean;
  title: string;
  /** 宽度上限 */
  maxWidth?: number;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="pop">
      <div v-if="open" class="modal-root">
        <div class="modal-root__mask" @click="emit('close')" />
        <div
          class="modal"
          :style="{ '--modal-max-w': `${maxWidth ?? 420}px` }"
          role="dialog"
          :aria-label="title"
        >
          <header class="modal__header">
            <h3 class="modal__title">{{ title }}</h3>
          </header>
          <div class="modal__body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: grid;
  place-items: center;

  &__mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
  }
}

.modal {
  position: relative;
  width: calc(100vw - 48px);
  max-width: var(--modal-max-w);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);

  &__header {
    padding: 16px 20px 8px;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
  }

  &__body {
    padding: 8px 20px 20px;
    overflow-y: auto;
  }
}
</style>
