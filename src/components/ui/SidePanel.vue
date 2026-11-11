<script setup lang="ts">
// 侧挂面板：从边缘滑出，带遮罩；Esc 关闭。目录/设置共用。
// 标题行最右侧提供显式"关闭"图标按钮（遮罩点击 / Esc 之外的可发现关闭入口）。
import { X } from "lucide-vue-next";

import IconButton from "@/components/ui/IconButton.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    side?: "left" | "right";
    /** 面板宽度（CSS 尺寸） */
    width?: string;
  }>(),
  { side: "right", width: "320px" },
);

const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && props.open) emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="panel-root"
      @keydown="onKeydown"
    >
      <div class="panel-root__mask" @click="emit('close')" />
      <aside
        class="panel"
        :class="`panel--${side}`"
        :style="{ width: `min(${width}, 92vw)` }"
        role="dialog"
        :aria-label="title"
      >
        <header class="panel__header">
          <h3 class="panel__title">{{ title }}</h3>
          <slot name="header-extra" />
          <IconButton
            :icon="X"
            :label="$t('common.close')"
            placement="bottom"
            @click="emit('close')"
          />
        </header>
        <div class="panel__body">
          <slot />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.panel-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;

  &__mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    animation: fade-in 0.18s ease;
  }
}

.panel {
  position: relative;
  width: min(320px, 92vw); // 默认值；实例用 :style 覆盖
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-color: var(--border-1);
  box-shadow: var(--shadow-2);
  animation: slide-in 0.2s ease;

  &--right {
    margin-left: auto;
    border-left: 1px solid var(--border-1);
  }

  &--left {
    margin-right: auto;
    border-right: 1px solid var(--border-1);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-1);
    flex-shrink: 0;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    @include thin-scrollbar;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slide-in {
  from {
    transform: translateX(var(--slide-from, 24px));
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.panel--right {
  --slide-from: 24px;
}

.panel--left {
  --slide-from: -24px;
}
</style>
