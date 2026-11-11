<script setup lang="ts">
// 应用根：路由出口 + Toast。
import ToastHost from "@/components/ui/ToastHost.vue";
</script>

<template>
  <router-view />
  <ToastHost />
</template>
