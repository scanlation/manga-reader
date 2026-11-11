# 漫画阅读器（Vue3 + Tauri）v1 实施计划（含补充需求）

## Context

在空目录 `E:\project\manga-tools-reader` 从零搭建网页端 + PC 端（Tauri v2）双端漫画阅读器。已确认：**pnpm**、**双主题**（跟随系统+手动切换）、**v1 仅单页模式**、设置面板含 **预加载数量/阅读背景色/滚轮翻页/日漫右开本**，另有四项补充需求：**四语言 i18n**、**纯 SCSS（禁 Tailwind，内联样式仅用于设置 CSS 变量值）**、**组件化+扩展点**、**打开历史与阅读进度持久化**。页面：着陆页 + 阅读页。本机 Node v22.20 / Rust 已就绪。

## 技术选型

| 层 | 选择 |
|---|---|
| 脚手架 | `pnpm create tauri-app`（vue-ts 模板） |
| 前端 | Vue 3.5 `<script setup>`、vue-router 4、pinia、**vue-i18n 11**（zh-CN/zh-TW/en/ja）、lucide-vue-next 图标 |
| 样式 | **SCSS**（`sass-embedded` dev 依赖）：`_tokens.scss` 设计令牌 → CSS 自定义属性、`_mixins.scss`（滚动条/玻璃面板/焦点环）；组件 `<style scoped lang="scss">` BEM 命名；**禁 Tailwind；内联 style 仅允许写 CSS 变量**（如 `:style="{ '--scale': s }"`，动态宽度走 `--fill` 等变量） |
| Web 解压 | `fflate`（zip/cbz/epub）；`libarchive.js`（cbr/rar/7z/tar，懒加载，dist 复制到 `public/vendor/libarchive/`，`Archive.init({ workerUrl })`） |
| Rust 解压 | `zip`（随机访问）、`unrar`（整包解压临时目录，备选 `unrar-rs`）、`sevenz-rust`（随机访问）、`tar`+`flate2`+`bzip2`（整包解压）、`walkdir`（文件夹） |
| Tauri | v2 + dialog 插件；拖放用 `tauri://drag-drop` 事件 |

## 项目结构（组件化 + 扩展点）

```
manga-tools-reader/
├─ public/vendor/libarchive/          # postinstall 从 node_modules 复制
├─ scripts/make-fixtures.mjs          # 测试夹具：SVG 漫画页 + cbz/epub/文件夹
├─ src/
│  ├─ main.ts / App.vue / router/index.ts
│  ├─ locales/{zh-CN,zh-TW,en,ja}.ts  # 以 zh-CN 为 schema 源，类型约束其他语言
│  ├─ assets/styles/{_tokens.scss, _mixins.scss, theme.scss, base.scss}
│  ├─ stores/{theme.ts, settings.ts, history.ts, reader.ts}   # settings/history 持久化 localStorage
│  ├─ lib/
│  │  ├─ platform.ts / images.ts（自然排序）
│  │  ├─ sources/{types.ts, registry.ts, fflate.ts, libarchive.ts, web-folder.ts, tauri.ts}
│  │  ├─ epub.ts / book.ts / history.ts（记录模型与 id 计算）
│  │  └─ shortcuts.ts                 # 快捷键表（数据驱动，可注册）
│  ├─ pages/{Landing.vue, Reader.vue} # 轻量页面壳，内容全在组件里
│  ├─ components/
│  │  ├─ ui/      # IconButton(icon+tooltip)、Tooltip、NumberInput、RangeSlider、Toggle、Segmented、Panel、Modal、Toast/useToast、LangSwitcher、ThemeToggle
│  │  ├─ landing/ # HeroSection、UsageSteps、FormatCards、FilePicker(web/tauri 选择+拖放封装)、DropOverlay、HistoryList
│  │  └─ reader/  # TopBar、BottomBar、Pager、ProgressSlider、ZoomControls、PageCanvas、TocPanel、SettingsPanel、AutoHideBars(悬浮显隐容器)
│  └─ plugins/    # 预留：README 说明扩展点（Source 注册表/设置 schema/快捷键表/i18n 命名空间）
└─ src-tauri/
   ├─ Cargo.toml / tauri.conf.json / capabilities/default.json
   └─ src/{main.rs, lib.rs, commands.rs, state.rs, sources/{mod,zip_s,rar_s,sevenz_s,tar_s,dir_s}.rs}
```

**扩展点设计**（满足"可复用组件+插件空间"）：
- `SourceProvider` 注册表：`{ id, canOpen(item), create(item): BookSource }[]`，新增格式=新增一个文件并 register，不改分发逻辑
- 设置面板 **schema 驱动**：`SettingDef[]`（toggle/select/number/segmented）渲染通用控件，加设置项零 UI 代码
- 快捷键映射表数据化；i18n 按命名空间组织（reader/landing/settings/errors）便于插件追加词条
- ui 组件不依赖业务，Panel/Modal/IconButton 均可复用

## 核心架构

**BookSource 抽象**：`list(): Entry[]`、`read(path): ArrayBuffer`、`close()`。按平台+扩展名/魔数经注册表分发；Web 文件夹用 `webkitGetAsEntry` 递归；PC 全走 Rust 命令（`open_source/read_entry/close_source/is_dir`，`tauri::ipc::Response` 传字节；rar/tar 打开时解压到 `temp/mtr-*`，zip/7z 随机访问按需读）。

**书籍构建**：图片过滤（jpg/png/webp/gif/avif/bmp/svg）→ 自然排序 → 一级目录分章节（单层包装目录下钻）；EPUB 走 `epub.ts`（container.xml→OPF→spine 顺序提取 xhtml 内图片，纯文字页跳过并提示）。多文件拖入→选择列表弹窗。

**历史与进度**（`stores/history.ts` + `lib/history.ts`）：
- 记录：`{ id: hash(path 或 name+size+lastModified), title, sourceKind, pageCount, lastPage, updatedAt, path?(PC), cover?(首页 96px 缩略 dataURL) }`，localStorage `mtr:history`，上限 50
- 打开时命中历史 → **自动跳转到 lastPage** + toast 提示（含"从头开始"按钮）；阅读中翻页/关闭时节流更新 lastPage
- 着陆页"最近打开"卡片（缩略图+标题+进度条）：**PC 端点击直接按 path 重开**；Web 端无法重持文件句柄，条目仅展示，重新选择同文件后凭 id 命中自动续读（File System Access 持久句柄列为后续演进）；提供清空历史
- 阅读进度与设置均按文件 id 独立记录

## 页面设计

**着陆页**：顶栏（Logo + ThemeToggle + LangSwitcher）→ Hero（标题/简介）→ 使用方法三步卡 → 支持格式双卡（网页端：ZIP/CBZ/CBR/EPUB/文件夹；PC 端额外：RAR/7Z/TAR 等）→ 最近打开 → **开始使用**（web: hidden input；PC: dialog）+ 选择文件夹按钮；全页拖放覆盖层。

**阅读页**：全屏画布居中单页、背景色可设置；**AutoHideBars**：鼠标进入顶部/底部 72px 热区或工具条内→显示，离开 600ms 淡出；翻页短暂显示；输入框聚焦/拖滑块期间不隐藏。
- **上工具条**：返回（图标）、文件名（唯一文字，flex:1 撑开+ellipsis）、目录、设置（图标+tooltip）
- **下工具条**三段：左=Pager（上一页图标钮、页码 NumberInput、总页数、下一页图标钮）；中=ProgressSlider（range 1..N）；右=ZoomControls（放大、百分比、缩小、重置、按宽撑满、按高撑满）
- 缩放：mode=fitWidth|fitHeight|custom；±×1.25（clamp 10–800%），重置=100%；放大溢出滚动+拖拽平移；Ctrl+滚轮缩放；滚轮翻页默认开
- 快捷键：←/→（RTL 感知）、+/-/0；日漫模式镜像按钮图标与方向语义
- 预加载：前 N 后 2 页 blob URL，LRU 24；设置面板含语言切换入口

## 实施步骤

1. 脚手架 + 依赖（vue-i18n、sass-embedded 等）+ libarchive 复制脚本
2. Rust 端：六种 source、命令、conf/capabilities（CSP 允许 blob: img）
3. styles 令牌/主题/混入（`[data-theme]`，index.html 内联脚本防闪白）+ i18n 四语言 + ui 组件
4. `lib/`：platform/images/sources(+registry)/epub/book/history/shortcuts + stores
5. 着陆页组件（含历史列表、拖放）
6. 阅读页组件（画布、双工具条、目录、设置、自动隐藏、预加载、进度写入）
7. 夹具 + 验证 + 中文 README（含扩展点说明）

## 验证方案

- **Web**：`make-fixtures.mjs` 生成文件夹/.cbz/.epub；`pnpm dev` + browser-use 实测：四语言切换全量生效（着陆页/工具条 tooltip/toast/设置）、三种夹具打开与翻页/滑杆/页码输入、缩放六按钮与百分比、工具条自动隐藏、双主题、设置与进度持久化（翻到第 N 页→返回→重开同文件自动跳回 + toast）、历史列表展示与清空、SCSS 规范自查（无内联非变量样式）
- **PC**：`cargo test`（zip/rar/7z/tar 源单测）+ `cargo check` + `pnpm tauri dev` 冒烟（GUI 交互由用户抽验，PC 端重点验证 rar/7z/tar 与历史按路径重开）
- 边界：加密/损坏压缩包、无图片文件夹→中文/当前语言错误 toast

## 风险与对策

- libarchive.js 集成：官方路径=dist 复制 public + `Archive.init({ workerUrl })`，不依赖打包器；失败给明确 toast
- `unrar` crate 需 MSVC C++（Tauri Windows 构建本就依赖）；受阻则换纯 Rust `unrar-rs`
- Rust ≥1.77.2，实施首步 `cargo --version` 验证，不足先征求同意再 `rustup update`