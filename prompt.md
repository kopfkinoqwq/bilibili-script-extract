# 需求背景与任务目标

用户希望在当前目录开发一个**提取 B站（Bilibili）视频文稿（AI总结/文稿）和 CC 字幕的浏览器插件（Chrome Extension Manifest V3）**。

请作为云端首席架构师（Gemini 4 Argon），对该插件进行完整、高深度、零省略的系统架构设计，并给出详尽的工程落地实施步骤。

---

## 需深度推演的核心议题

### 1. B站数据接口与底层提取机理推演 (Data & API Analysis)
- **参数获取链路**：在 B站视频播放页（如 `https://www.bilibili.com/video/BV...`），如何精准、稳定地获取当前视频的 `bvid`、`aid` 以及当前分P的 `cid`？（分析 `window.__INITIAL_STATE__`、DOM 播放器注入属性、以及 SPA 切P场景下的动态获取方案）。
- **字幕数据源（CC字幕）**：
  - B站官方播放器接口（如 `api.bilibili.com/x/player/v2` 或 `api.bilibili.com/x/player/wbi/v2` 等）中 `subtitle` 字段的返回结构；
  - 字幕 JSON 文件（如 `aisubtitle.hdslb.com` 或 `i0.hdslb.com`）的数据格式（`from`, `to`, `content`）与解析方式；
  - 多语言/AI生成字幕与人工CC字幕的处理差异。
- **AI文稿 / 视频总结（AI Transcript / Conclusion）**：
  - 针对 B站网页版上线的“AI视频总结 / 文稿”功能，其背后 API 是什么？（如 `api.bilibili.com/x/web-interface/view/conclusion/get` 等），如何提取完整的大纲与文稿时间点？
  - 如果视频既没有 CC 字幕也没有 AI 文稿，如何做平滑降级与友好的状态提示？
- **SPA（单页应用）与切P动态感知**：
  - 用户在同一个页面点击选集（P1 -> P2 -> P3）或切换相关视频时，URL 与内部状态发生变化，Content Script 如何做到 100% 准确监听并自动重新加载字幕数据？（`history.pushState`、`popstate`、DOM 监听等最佳实践）。

### 2. 浏览器插件系统架构设计 (Chrome Extension Manifest V3 Architecture)
- **Manifest V3 规范与权限最小化**：
  - `manifest.json` 配置规范（`permissions`, `host_permissions`, `action`, `background`, `content_scripts`, `web_accessible_resources`）；
  - 是否需要 Background Service Worker 进行网络中继或跨域请求（Host Permissions）？
- **组件划分与通信机制**：
  - **Content Script**：负责页面宿主环境探针、浮动快捷操作按钮/侧边抽屉面板注入、DOM 事件监听；
  - **Injected Script (MAIN world)**：是否需要注入到页面主执行上下文读取 `window.__INITIAL_STATE__`？（MV3 `world: "MAIN"` 或 DOM script 标签注入最佳实践）；
  - **Popup / Drawer UI**：轻量交互界面，支持预览、选择语言/分P、自定义格式导出；
  - **Background Worker**：后台数据管道与持久化（可选配置保存、快捷键监听）。

### 3. 数据转换引擎与导出格式矩阵 (Data Transformation & Formats)
请设计一个灵活的字幕/文稿转换引擎，支持将 B站原始字幕/文稿转换为以下格式：
1. **纯文本 (TXT)**：自动去除冗余换行、可按时间间隔分段合并成自然段落；
2. **标准 SRT 格式**：带标准序号与 `00:00:01,234 --> 00:00:04,567` 时间戳；
3. **带时间戳的 Markdown (MD)**：如 `[01:23] 文稿内容`，方便配合笔记软件（如 Obsidian, Notion）；
4. **AI 提示词优化格式 (Prompt-Ready)**：自动附带视频标题、时长信息，并包装成适合直接丢给 LLM（Gemini/ChatGPT/Claude）进行深度总结或知识提取的 Prompt 模板；
5. **原始 JSON**：供开发者排查或二次开发。

### 4. 交互设计与 UI 最佳实践
- 浮动按钮（Floating Action Button）在 B站播放器界面的优雅植入位置（避免遮挡弹幕开关、画质选择、全屏按钮等原生控件）；
- 暗黑模式（Dark Mode）与 B站官方风格自适应；
- 一键复制（带复制成功 Toast 视觉反馈）与一键文件导出下载。

### 5. 详细工程目录结构与分步施工路线 (Step-by-Step Implementation Plan)
- 给出清晰、现代的前端目录结构（纯原生 JS/CSS 方案 vs Vite+TypeScript 现代打包方案的权衡建议，推荐最适合快速落地且便于用户在 Chrome `chrome://extensions/` 开发者模式下一键加载的方案）；
- 给出分步开发步骤：
  - 第 1 步：环境准备与 Manifest V3 骨架搭建；
  - 第 2 步：页面数据提取器（Extractor）实现（AID/CID/BVID 嗅探与字幕 API 交互）；
  - 第 3 步：文本格式化与转换器（Formatter）实现；
  - 第 4 步：注入层与 UI 渲染（UI & Injected Script）；
  - 第 5 步：打包、加载调试与常见踩坑指南（防盗链、Cookie/CORS、B站反爬与接口时效性）。

---
请输出一份极尽详尽、条理分明、具备生产落地水准的架构设计方案与施工蓝图（PLAN.md）。
