import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import i18n from "./locales";
import router from "./router";
import { registerServiceWorker } from "./lib/pwa";
import "./assets/styles/base.scss";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(i18n);

app.mount("#app");

// 生产构建 + 浏览器安全上下文时注册离线 Service Worker（内部自判断，无条件调用）
registerServiceWorker();
