# 漫画阅读器

轻量级本地漫画阅读器，支持双端运行：

- **桌面端**（Tauri生成多平台程序端）：原生解压，速度快、内存占用低，支持 ZIP、CBZ、EPUB、RAR、CBR、7Z、TAR（含 .tar.gz / .tar.bz2）与文件夹；
- **网页端**（Vue 3 + Vite）：ZIP、CBZ、EPUB、文件夹拖拽直接阅读；RAR / 7Z / TAR 由浏览器内 WASM（libarchive.js）解压支持，大文件建议使用桌面端。

所有文件均在本地处理，不上传任何服务器。

## 功能

- 打开方式：选择文件 / 选择文件夹 / 拖拽（支持多文件二选一确认）
- 阅读进度自动记忆：路径可收藏，收藏链接 / 刷新直开即续读；Web 端经 FSA 句柄或 IndexedDB 文件缓存跨会话恢复
- 阅读页：左右 25% 点击翻页、自动显隐双工具条、目录、页码直达
- 图片预览：单列缩略图一览全部页面；图片下方显示页码（有标题时覆盖显示）
- 瀑布流模式：页面上下拼接为连续滚动，预载多页无缝衔接
- 缩放：按宽度 / 按高度两种基准模式； 相对倍率缩放，手工拖拽、捏合、旋转
- 日漫模式（RTL）：翻页方向与工具条按钮顺序按日漫习惯调整
- 独立阅读记录管理界面，支持按文件名 / 标题搜索和批量管理

## 待实现

1. 双端对于加密文件的支持（网页端只支持 ZIP 的加密文件）
2. 支持自定义快捷键
3. 拓展支持文件到 PDF、TXT、MD、MOBI、AWZ 等非漫画格式
4. 桌面端支持更换主题（伪装）
5. 桌面端支持老板键（全局注册按键控制）
6. 非漫画文件支持本地字体切换
7. 桌面端支持全透明伪装
8. 漫画支持任意点位文字批注、涂鸦批注
9. 非漫画支持选中文字批注、选中文字高亮、在段落前后添加批注

## 技术栈

- 前端：Vue 3（`<script setup>`）+ TypeScript + Pinia + vue-router + vue-i18n + SCSS 设计令牌（无 Tailwind）
- 桌面端：Tauri 2（Rust）
- 解压：fflate（ZIP 系）/ libarchive.js（RAR、7Z、TAR，Web 端）/ zip、unrar、sevenz-rust（桌面端原生）

## 开发

```bash
pnpm install        # 安装依赖
pnpm dev            # 网页端开发服务器（默认 1420）
pnpm build          # 类型检查 + 产物构建
pnpm tauri dev      # 桌面端开发
pnpm tauri build    # 桌面端打包
```

> IDE 推荐配置：[VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-analyzer)
