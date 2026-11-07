# Bilibili 视频文稿与 CC 字幕提取插件 (bilibili-script-extract) 系统架构与工程实施蓝图

本方案针对 `D:\file\Antigravity file\bilibili script extract` 项目编写，基于 Chrome Extension Manifest V3 标准，构建一套零外部构建依赖、支持在 `chrome://extensions/` 开发者模式下直接加载运行的生产级浏览器扩展。

---

## 1. B站数据接口与底层提取机理推演 (Data & API Analysis)

### 1.1 核心视频参数获取链路 (bvid, aid, cid, up_mid)
在 B 站视频播放页（`/video/BV...` 或 `/video/av...`）中，获取当前分 P 的真实参数存在多种途径，但单一途径在 SPA（单页应用）无刷新切 P 或点击右侧推荐视频时会出现状态滞后。生产环境采用三级联立嗅探机制：

| 数据源层级 | 宿主对象 / 位置 | 获取方式与字段路径 | 优势与局限性分析 |
| :--- | :--- | :--- | :--- |
| **L1：主世界全局状态 (首选)** | `window.__INITIAL_STATE__` | `state.bvid`、`state.aid`、`state.upData.mid`；当前分 P 的 `cid` 通过 `state.videoData.pages[state.p - 1].cid` 或 `state.cidMap` 获取 | 包含最完整的视频元数据（标题、UP主、分P列表、时长），但位于页面 MAIN 执行上下文，Content Script 默认的 ISOLATED 隔离世界无法直接读取。 |
| **L2：URL 路由与分 P 映射** | `window.location.href` | 正则提取路径中的 `BV[a-zA-Z0-9]{10}`，结合 `URLSearchParams` 读取 `?p=N`（缺省为 1） | 在用户点击选集切换分 P 时，URL 的 `?p=N` 最先更新，可通过 `pages[p - 1].cid` 瞬间映射出新分 P 的 `cid`，无需等待额外接口返回。 |
| **L3：视图详情 API (兜底)** | `api.bilibili.com/x/web-interface/view` | 请求 `?bvid={bvid}`，从返回体 `data.aid`、`data.owner.mid`、`data.pages` 获取全量分 P 的 `cid` 映射表 | 当页面结构改版或从番剧/活动特殊页面跳转导致 `window.__INITIAL_STATE__` 结构异化时，作为 100% 可靠的远端兜底数据源。 |

### 1.2 WBI 签名机制与请求鉴权体系
B 站 Web 端核心接口已全面强制启用 **WBI 签名鉴权** 与 `buvid3` / `SESSDATA` Cookie 校验。未携带有效签名或 Cookie 的裸请求会触发 HTTP 412 Precondition Failed 风控拦截，或导致接口返回空的字幕列表。

- **登录态 Cookie (SESSDATA) 的决定性作用**：未登录状态下调用播放器接口，B 站服务端会直接过滤掉 `ai-zh`（AI 自动生成字幕）及大多数 CC 字幕，返回 `subtitles: []`。
  - **架构对策**：在 MAIN 世界或同源 Content Script 中使用 `fetch(url, { credentials: 'include' })` 发起请求，浏览器会自动附带当前已登录的 `.bilibili.com` 域 Cookie（含 `SESSDATA`、`bili_jct`、`buvid3`），无需在插件中申请敏感的 `chrome.cookies` 权限，也无需用户手动复制粘贴 Cookie。
- **WBI 动态签名算法流程**：
  - **步骤 1（获取每日密钥）**：请求 `https://api.bilibili.com/x/web-interface/nav`，从 `data.wbi_img` 中提取 `img_url` 和 `sub_url` 的文件名主干作为 `img_key` 与 `sub_key`（可缓存在 `sessionStorage` 中避免重复请求）。
  - **步骤 2（生成混淆 Mixin Key）**：将 `img_key + sub_key` 拼接为 64 位字符串，按照固定的 64 位重排表 `MIXIN_KEY_ENC_TAB` 进行字符位置置换，并截取前 32 位作为 `mixin_key`。
  - **步骤 3（参数排序与 MD5 摘要）**：在请求参数中加入当前秒级时间戳 `wts = Math.round(Date.now() / 1000)`，将所有参数按 Key 的 ASCII 升序排列，过滤掉 Value 中的 `!'()*` 特殊字符，序列化为 Query String 后在末尾拼接 `mixin_key`，计算 MD5 值即为 `w_rid`。

### 1.3 字幕数据源（CC 字幕与 AI 生成字幕）深度解析

#### (1) 播放器信息接口 (`/x/player/wbi/v2`)
- **Endpoint**：`https://api.bilibili.com/x/player/wbi/v2?aid={aid}&cid={cid}&w_rid={w_rid}&wts={wts}`
- **人工 CC 字幕与 AI 字幕差异处理**：
  - **人工 CC 字幕**：`lan` 通常为 `zh-CN`、`zh-Hans`、`zh-Hant`、`en-US`、`ja` 等，`type === 0`，准确度高且自带标点或断句，优先级排在首位。
  - **AI 自动生成字幕**：`lan` 以 `ai-` 开头（如 `ai-zh`、`ai-en`），`type === 1`（当 `ai_type === 1` 时代表 AI 翻译字幕）。插件 UI 提供语言切换下拉框，默认按「人工中文 CC → AI 自动中文 (ai-zh) → 其他第一顺位字幕」的优先级自动选中。
  - **协议头修复**：返回的 `subtitle_url` 以双斜杠 `//` 开头，拉取前必须执行 `url.startsWith('//') ? 'https:' + url : url` 转换。

#### (2) 字幕 JSON 文件结构 (`aisubtitle.hdslb.com` / `i0.hdslb.com`)
请求 `subtitle_url` 时，注意拉取 CDN 字幕 JSON 时**不可**携带 `credentials: 'include'`，因为 CDN 节点的 `Access-Control-Allow-Origin` 为 `*`，若带 Cookie 会触发浏览器 CORS 报错拦截。
- `from` / `to`：以秒为单位的浮点数（如 `65.42` 代表 `01:05.420`）。
- `content`：单句字幕内容文本。

### 1.4 AI 视频总结 / AI 文稿接口（Conclusion API）解析
针对 B 站网页端的「AI 小助手视频总结 / 分段大纲」功能，其底层数据独立于播放器 CC 字幕接口：
- **Endpoint**：`https://api.bilibili.com/x/web-interface/view/conclusion/get`
- **请求参数**：`bvid={bvid}&cid={cid}&up_mid={up_mid}&w_rid={w_rid}&wts={wts}`（必须经过 WBI 签名并携带 Cookie）。
- **平滑降级与无数据状态机设计**：
  - **双通道并发采集**：切入视频或分 P 时，插件利用 `Promise.allSettled` 并发请求 `/x/player/wbi/v2`（CC/AI 字幕）与 `/x/web-interface/view/conclusion/get`（AI 总结大纲）。
  - **互补回退策略**：若 `player/wbi/v2` 无 subtitles，但 `conclusion/get` 的 `model_result.subtitle` 存在逐句文稿，则自动将 `model_result.subtitle` 映射为标准字幕时间轴。若只有大纲则展示「AI 总结提纲」视图；若两者均为空则提供登录或暂无字幕引导卡片。

### 1.5 SPA（单页应用）与切 P 动态感知方案
- **拦截 History API**：在注入到 MAIN 世界的脚本 (`page-probe.js`) 中，采用 AOP 装饰器模式包装 `window.history.pushState` 与 `window.history.replaceState`，并监听 `window.addEventListener('popstate')`。
- **状态指纹比对轮询（防漏网兜底）**：维护轻量级状态指纹 `${bvid}_${cid}_${p}`，每当路由事件触发或每 1000ms 比对一次指纹，一旦发现指纹变化，立即向 Content Script 派发事件触发重载。

---

## 2. 浏览器插件系统架构设计 (Chrome Extension Manifest V3 Architecture)

### 2.1 系统分层与通信拓扑
```
+-----------------------------------------------------------------------------------+
|                          Bilibili Web Page (Host Environment)                     |
|                                                                                   |
|  +-------------------------------------+     window.postMessage                   |
|  |   Injected Probe (MAIN World)       | <=====================================>  |
|  | - 读取 window.__INITIAL_STATE__     |                                          |
|  | - 劫持 history.pushState/replaceState|                                         |
|  | - 执行同源带 Cookie 的 WBI 签名请求 |                                          |
|  +-------------------------------------+                                          |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                 Content Script (ISOLATED World)                             |  |
|  | - 管理生命周期与请求调度                                                    |  |
|  | - 调用 Formatter 引擎生成 TXT / SRT / MD / Prompt / JSON                    |  |
|  | - 控制原生 <video> 元素跳帧播放 (currentTime)                                |  |
|  | - 挂载 Shadow DOM (隔离宿主样式) 渲染悬浮触发按钮与侧边抽屉工作台           |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------|-----------------------------------------+
                                          | chrome.runtime.sendMessage
                                          v
+-----------------------------------------------------------------------------------+
|                     Background Service Worker (Extension Context)                 |
| - 代理拉取跨域字幕 CDN JSON (aisubtitle.hdslb.com / i0.hdslb.com)，彻底规避 CORS  |
| - 监听全局快捷键 (Alt+S 唤起/收起文稿面板)                                         |
+-----------------------------------------------------------------------------------+
```

---

## 3. 数据转换引擎与导出格式矩阵

1. **纯文本 (TXT)**：快速阅读、全文检索，支持逐句与智能自然段合并（停顿间隔 > 1.1s 或满 180 字分段）。
2. **标准字幕 (SRT)**：标准序号 + `00:01:15,340 --> 00:01:18,500` 时间轴，适配剪映 / Premiere / PotPlayer。
3. **时间戳笔记 (Markdown)**：带 YAML Frontmatter、原视频跳转链接 `[MM:SS](url&t=sec)`，适配 Obsidian / Notion。
4. **AI 提示词优化 (Prompt)**：包含核心总结指导语、视频元数据、紧凑型时间轴，开箱直接喂给 Gemini / ChatGPT / Claude。
5. **原始数据 (JSON)**：包含完整结构与时间标记，方便二次分析与开发者调试。

---

## 4. 工程目录结构
```plaintext
bilibili script extract/
├── manifest.json                 # Manifest V3 核心配置文件
├── PLAN.md                       # 本架构设计与施工蓝图文档
└── src/
    ├── background/
    │   └── service-worker.js     # 后台服务工作线程（跨域字幕下载代理、快捷键分发）
    ├── injected/
    │   └── page-probe.js         # 注入页面 MAIN 世界的探针（状态提取、SPA 路由劫持、WBI 签名请求）
    ├── utils/
    │   └── formatter.js          # 多格式转换引擎（TXT / SRT / Markdown / Prompt / JSON）
    ├── content/
    │   └── content-main.js       # Content Script 核心控制器与 Shadow DOM 交互面板
    └── popup/
        ├── popup.html            # 浏览器右上角插件图标弹窗界面
        └── popup.js              # 弹窗快捷控制脚本
```
