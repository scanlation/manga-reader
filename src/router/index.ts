import { createRouter, createWebHashHistory } from "vue-router";

import Landing from "@/pages/Landing.vue";
import MangaViewer from "@/pages/MangaViewer.vue";
import Library from "@/pages/Library.vue";
import Unsupported from "@/pages/Unsupported.vue";
import { SUPPORTS_WEB_READING } from "@/lib/capabilities";

// Hash 路由：Tauri 生产环境 file:// 协议下无需服务端回退。
// 阅读路由 `/manga/:uuid/:page?` 可收藏：UUID ↔ 历史记录，直开即续读对应页。
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "landing", component: Landing },
    { path: "/library", name: "library", component: Library },
    { path: "/manga/:uuid/:page(\\d+)?", name: "manga", component: MangaViewer },
    { path: "/unsupported", name: "unsupported", component: Unsupported },
    { path: "/reader", redirect: "/" },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

// 网页端最低能力（Worker / WebAssembly / Blob 读取）不满足时，整个网页模式不可用，
// 统一拦到「暂不支持」页（建议桌面端）；Tauri 桌面端始终通过。
router.beforeEach((to) => {
  if (to.name === "unsupported") {
    return SUPPORTS_WEB_READING ? { name: "landing" } : true;
  }
  return SUPPORTS_WEB_READING ? true : { name: "unsupported" };
});

export default router;
