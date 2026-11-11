<script setup lang="ts">
// 全页拖放覆盖层：拖入时显示提示，松手交给上层处理。
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { UploadCloud } from "lucide-vue-next";

import { SUPPORTS_FOLDER } from "@/lib/capabilities";

const emit = defineEmits<{
  drop: [event: DragEvent];
}>();

const { t } = useI18n();

// 不支持文件夹读取的浏览器隐藏"文件夹"字样
const hint = computed(() =>
  t(SUPPORTS_FOLDER ? "landing.orDragHere" : "landing.orDragHereNoFolder"),
);

const dragging = ref(false);
let depth = 0;

function onEnter(event: DragEvent) {
  event.preventDefault();
  depth++;
  dragging.value = true;
}

function onLeave(event: DragEvent) {
  event.preventDefault();
  depth = Math.max(0, depth - 1);
  if (depth === 0) dragging.value = false;
}

function onOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  depth = 0;
  dragging.value = false;
  emit("drop", event);
}
</script>

<template>
  <!-- 覆盖全页：拖放检测层（不拦截点击） -->
  <div
    class="drop-overlay"
    @dragenter="onEnter"
    @dragleave="onLeave"
    @dragover="onOver"
    @drop="onDrop"
  >
    <Transition name="fade">
      <div v-if="dragging" class="drop-overlay__hint">
        <UploadCloud :size="42" />
        <p class="drop-overlay__text">{{ hint }}</p>
      </div>
    </Transition>
    <slot />
  </div>
</template>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as *;

.drop-overlay {
  display: contents;
}

.drop-overlay__hint {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: grid;
  place-items: center;
  place-content: center;
  gap: 12px;
  background: color-mix(in srgb, var(--bg-page) 72%, transparent);
  backdrop-filter: blur(6px);
  border: 2px dashed var(--accent);
  color: var(--accent);
  pointer-events: none;

  svg {
    opacity: 0.9;
  }
}

.drop-overlay__text {
  font-size: 15px;
  font-weight: 600;
}
</style>
