# Bilibili 视频文稿与 CC 字幕提取器 (bilibili-script-extract)

<p align="center">
  <strong>一键提取 B站 (Bilibili) 视频 CC 字幕、AI 自动字幕与 AI 视频总结大纲的 Chrome 扩展 (Manifest V3)</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-brightgreen.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge-blue.svg" alt="Chrome / Edge" />
  <img src="https://img.shields.io/badge/Dependencies-Zero-orange.svg" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
</p>

---

## ✨ 核心特性

- 🎯 **双轨数据源嗅探**：
  - 自动捕获视频官方 **人工 CC 字幕** 与 **AI 自动生成字幕**（`ai-zh`、`ai-en` 等）；
  - 深度解析并提取 B 站网页版 **「AI 小助手视频总结 / 分段大纲」**；
  - 智能降级策略：无 CC 字幕时自动以 AI 逐句提纲或核心摘要补位。
- ⚡ **零构建依赖 · 即改即用**：
  - 纯原生 ES6+ 模块化实现，无需 Node/Webpack/Vite 构建流程；
  - 直接在 Chrome / Edge `chrome://extensions/` 开发者模式下一键载入。
- 📦 **多格式转换引擎**：
  - **纯文本 (TXT)**：支持逐句模式与智能自然段合并（依据语意停顿与字数自动断句）；
  - **标准字幕 (SRT)**：标准序号与毫秒级时间轴，开箱导入剪映、Premiere、Final Cut、PotPlayer；
  - **笔记格式 (Markdown)**：内嵌 YAML Frontmatter、章节大纲以及可点击的跳帧跳转链接，适配 Obsidian、Notion、Logseq；
  - **AI 提示词优化 (Prompt-Ready)**：自动组装结构化 System Instruction 与视频上下文，直接喂给 Gemini、ChatGPT、Claude 产出研报；
  - **原始数据 (JSON)**：供开发者进行二次开发或归档。
- 🎨 **非侵入式优雅 UI**：
  - 采用 **Shadow DOM** 完全隔离页面样式，绝不影响 B 站原生播放器；
  - 页面右侧边缘半透明磁吸触发胶囊 + 侧边抽屉面板；
  - 完美自适应 B 站浅色 / 深色（Dark Mode）主题；
  - 点击文稿任意时间戳，播放器毫秒级跳帧播放与同步跟随。
- 🔄 **SPA 单页切P无感刷新**：
  - AOP 劫持 `history.pushState` / `replaceState` 结合状态指纹巡检；
  - 选集切换（P1 → P2）、切视频或自动连播时，100% 自动对齐重载字幕。
- ⌨️ **快捷键支持**：随时按下 `Alt + S` 快速唤起或隐藏面板。

---

## 🚀 安装与使用指南

### 1. 下载或克隆项目
```bash
git clone https://github.com/kopfkinoqwq/bilibili-script-extract.git
```

### 2. 在浏览器中加载
1. 打开基于 Chromium 的浏览器（Google Chrome、Microsoft Edge、Brave 等）；
2. 在地址栏输入 `chrome://extensions/` 并回车；
3. 打开右上角的 **「开发者模式 (Developer mode)」**；
4. 点击左上角的 **「加载已解压的扩展程序 (Load unpacked)」**；
5. 选择本项目所在根目录（包含 `manifest.json` 的目录）即可完成安装。

### 3. 开始使用
1. 打开任意一个 [哔哩哔哩 (Bilibili)](https://www.bilibili.com/) 视频播放页；
2. 页面右侧中上方会出现 **「提取文稿」** 胶囊浮钮，点击即可展开侧边抽屉；
3. 或使用全局快捷键 **`Alt + S`** 随时唤起/收起面板；
4. 选择需要的导出格式，点击 **「一键复制」** 或 **「下载文件」**。

> ⚠️ **使用提示**：B 站官方对未登录访客默认不返回 AI 生成字幕轨（`ai-zh`）。建议在已登录 B 站账号的浏览器窗口中使用，以获取最佳提取效果。

---

## 🛠️ 项目目录结构

```plaintext
bilibili-script-extract/
├── manifest.json                 # Manifest V3 核心配置文件
├── README.md                     # 项目使用与架构说明
├── LICENSE                       # MIT 开源许可证
├── PLAN.md                       # 系统架构设计与实施蓝图
└── src/
    ├── background/
    │   └── service-worker.js     # 后台服务工作线程（跨域字幕下载代理、快捷键监听）
    ├── injected/
    │   └── page-probe.js         # 注入 MAIN 世界探针（纯JS WBI签名、嗅探元数据、SPA 路由劫持）
    ├── utils/
    │   └── formatter.js          # 多格式转换引擎（TXT / SRT / Markdown / Prompt / JSON）
    ├── content/
    │   └── content-main.js       # Content Script 主控与 Shadow DOM 交互抽屉面板
    └── popup/
        ├── popup.html            # 扩展图标弹窗界面
        └── popup.js              # 弹窗交互脚本
```

---

## 🔒 隐私与安全性

- **无隐私数据收集**：插件不向任何第三方服务器回传任何用户数据与播放记录；
- **同源凭证安全**：利用浏览器原生的同源 Cookie 机制发起请求，无需申请敏感的 `cookies` 权限；
- **最小化权限原则**：仅声明必要的宿主通信与存储权限。

---

## 📄 开源许可证

本项目采用 [MIT 许可证](LICENSE)。
