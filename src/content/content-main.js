/**
 * src/content/content-main.js
 * Content Script 主控制器与 Shadow DOM UI 渲染层
 */
(function () {
  if (window.__BILI_SCRIPT_CONTENT_MOUNTED__) return;
  window.__BILI_SCRIPT_CONTENT_MOUNTED__ = true;

  // ==================== 1. 注入 MAIN World 探针脚本 ====================
  function injectMainWorldProbe() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/injected/page-probe.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  injectMainWorldProbe();

  // ==================== 2. 状态管理 ====================
  const state = {
    isOpen: false,
    loading: false,
    error: null,
    meta: null,
    subtitleTracks: [],
    activeTrackIndex: 0,
    subtitleBody: [], // [{ from, to, content }]
    aiConclusion: null,
    activeTab: 'subtitles', // 'subtitles' | 'ai' | 'export'
    exportFormat: 'txt', // 'txt' | 'srt' | 'md' | 'prompt' | 'json'
    mergeParagraphs: true,
    searchKeyword: '',
    autoScroll: true
  };

  let pendingRequests = new Map();
  let reqSeq = 0;

  function callMainProbe(action, payload = {}) {
    return new Promise((resolve) => {
      const requestId = `req_${++reqSeq}_${Date.now()}`;
      pendingRequests.set(requestId, resolve);
      window.postMessage({
        source: 'BILI_SCRIPT_CONTENT',
        action,
        requestId,
        payload
      }, '*');
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve({ ok: false, error: '请求页面探针超时' });
        }
      }, 12000);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'BILI_SCRIPT_PROBE') return;
    const { action, requestId, payload } = event.data;

    if (action === 'FETCH_BUNDLE_RESULT' && pendingRequests.has(requestId)) {
      const resolve = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      resolve(payload);
    } else if (action === 'ROUTE_CHANGED') {
      // 感知到 SPA 切P或切换视频，自动重新加载
      loadCurrentVideoTranscript();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'TOGGLE_DRAWER_PANEL') {
      togglePanel();
      sendResponse({ ok: true });
    }
  });

  // ==================== 3. 核心数据拉取流水线 ====================
  async function fetchSubtitleJsonContent(url) {
    // 优先通过 Background Service Worker 代理请求，规避 CORS
    try {
      const bgRes = await chrome.runtime.sendMessage({ type: 'FETCH_SUBTITLE_JSON', url });
      if (bgRes && bgRes.ok && bgRes.data) {
        return bgRes.data.body || [];
      }
    } catch (e) {
      // 降级：直接在前端无凭证拉取
    }
    const directRes = await fetch(url, { credentials: 'omit' });
    const json = await directRes.json();
    return json.body || [];
  }

  async function loadCurrentVideoTranscript() {
    state.loading = true;
    state.error = null;
    renderUI();

    const bundle = await callMainProbe('FETCH_BUNDLE');
    if (!bundle || !bundle.ok) {
      state.loading = false;
      state.error = bundle?.error || '未能获取视频字幕信息';
      state.meta = bundle?.meta || null;
      renderUI();
      return;
    }

    state.meta = bundle.meta;
    state.subtitleTracks = bundle.subtitleTracks || [];
    state.aiConclusion = bundle.aiConclusion || null;
    state.activeTrackIndex = 0;
    state.subtitleBody = [];

    if (state.subtitleTracks.length > 0) {
      try {
        state.subtitleBody = await fetchSubtitleJsonContent(state.subtitleTracks[0].url);
        state.activeTab = 'subtitles';
      } catch (err) {
        state.error = `字幕文件下载失败: ${err.message}`;
      }
    } else if (state.aiConclusion?.aiSubtitleBullets?.length > 0) {
      // 若无 CC 字幕但 Conclusion 接口返回了逐句字幕，自动平滑降级采用
      state.subtitleBody = state.aiConclusion.aiSubtitleBullets.map((item) => ({
        from: item.start_timestamp,
        to: item.end_timestamp,
        content: item.content
      }));
      state.activeTab = 'subtitles';
    } else if (state.aiConclusion) {
      state.activeTab = 'ai';
    }

    state.loading = false;
    renderUI();
  }

  async function switchSubtitleTrack(index) {
    const track = state.subtitleTracks[index];
    if (!track) return;
    state.activeTrackIndex = index;
    state.loading = true;
    renderUI();
    try {
      state.subtitleBody = await fetchSubtitleJsonContent(track.url);
    } catch (err) {
      state.error = `切换字幕轨失败: ${err.message}`;
    }
    state.loading = false;
    renderUI();
  }

  // ==================== 4. Shadow DOM UI 构建与样式自适应 ====================
  const hostEl = document.createElement('div');
  hostEl.id = 'bili-script-extract-host';
  document.body.appendChild(hostEl);
  const shadowRoot = hostEl.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    :host {
      --bili-pink: #FB7299;
      --bili-blue: #00AEEC;
      --bg-surface: #FFFFFF;
      --bg-secondary: #F6F7F8;
      --text-primary: #18191C;
      --text-secondary: #61666D;
      --border-color: #E3E5E7;
      --shadow-elevated: 0 12px 32px rgba(0, 0, 0, 0.14);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .theme-dark {
      --bg-surface: #18191C;
      --bg-secondary: #24262B;
      --text-primary: #F1F2F3;
      --text-secondary: #9499A0;
      --border-color: #2F3238;
      --shadow-elevated: 0 12px 36px rgba(0, 0, 0, 0.55);
    }
    .fab-trigger {
      position: fixed;
      top: 24%;
      right: 0;
      z-index: 99998;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 12px 9px 14px;
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-right: none;
      border-radius: 20px 0 0 20px;
      box-shadow: var(--shadow-elevated);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: transform 0.2s ease, background 0.2s ease;
      user-select: none;
    }
    .fab-trigger:hover {
      transform: translateX(-4px);
      color: var(--bili-pink);
    }
    .fab-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--bili-pink);
    }
    .drawer-panel {
      position: fixed;
      top: 72px;
      right: 16px;
      width: 410px;
      height: calc(100vh - 96px);
      max-height: 780px;
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      box-shadow: var(--shadow-elevated);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .drawer-panel.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateX(24px);
    }
    .drawer-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-secondary);
    }
    .drawer-title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge-p {
      background: var(--bili-pink);
      color: #fff;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 11px;
    }
    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .icon-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    .icon-btn:hover {
      color: var(--bili-blue);
      border-color: var(--bili-blue);
    }
    .toolbar-row {
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .select-box, .search-input {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
    }
    .search-input {
      flex: 1;
      min-width: 110px;
    }
    .tabs-bar {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }
    .tab-btn {
      flex: 1;
      padding: 9px 0;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
    }
    .tab-btn.active {
      color: var(--bili-pink);
      border-bottom-color: var(--bili-pink);
      background: var(--bg-surface);
    }
    .content-Viewport {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.6;
    }
    .sub-line {
      display: flex;
      gap: 10px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .sub-line:hover {
      background: var(--bg-secondary);
    }
    .sub-line.active-line {
      background: rgba(251, 114, 153, 0.14);
      border-left: 3px solid var(--bili-pink);
    }
    .sub-time {
      color: var(--bili-blue);
      font-family: monospace;
      font-size: 12px;
      flex-shrink: 0;
      padding-top: 1px;
    }
    .sub-text {
      color: var(--text-primary);
      word-break: break-word;
    }
    .export-preview {
      width: 100%;
      height: 100%;
      min-height: 320px;
      box-sizing: border-box;
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px;
      font-family: Consolas, Monaco, monospace;
      font-size: 12px;
      resize: none;
      outline: none;
    }
    .empty-state {
      text-align: center;
      padding: 36px 16px;
      color: var(--text-secondary);
    }
    .drawer-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .btn-primary {
      background: var(--bili-pink);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-secondary {
      background: var(--bili-blue);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .toast-tip {
      position: absolute;
      bottom: 58px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(24, 25, 28, 0.92);
      color: #fff;
      padding: 7px 16px;
      border-radius: 20px;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .toast-tip.show {
      opacity: 1;
    }
  `;

  const containerEl = document.createElement('div');
  shadowRoot.appendChild(styleEl);
  shadowRoot.appendChild(containerEl);

  function isHostDarkMode() {
    const html = document.documentElement;
    return (
      html.classList.contains('dark') ||
      html.classList.contains('bili_dark') ||
      html.getAttribute('data-dark') === 'true' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }

  function showToast(text) {
    const toast = shadowRoot.querySelector('.toast-tip');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function getFormattedOutput() {
    const fmt = window.BiliScriptFormatter;
    if (!fmt) return '';
    switch (state.exportFormat) {
      case 'txt':
        return fmt.toPlainText(state.subtitleBody, state.aiConclusion, {
          mergeParagraphs: state.mergeParagraphs,
          pauseThreshold: 1.1
        });
      case 'srt':
        return fmt.toSRT(state.subtitleBody);
      case 'md':
        return fmt.toMarkdown(state.subtitleBody, state.meta, state.aiConclusion);
      case 'prompt':
        return fmt.toAiPrompt(state.subtitleBody, state.meta, state.aiConclusion);
      case 'json':
        return fmt.toRawJson(
          state.subtitleBody,
          state.meta,
          state.aiConclusion,
          state.subtitleTracks[state.activeTrackIndex] || null
        );
      default:
        return '';
    }
  }

  async function handleCopyOutput() {
    const content = getFormattedOutput();
    if (!content) {
      showToast('当前无有效文稿可复制');
      return;
    }
    await navigator.clipboard.writeText(content);
    showToast(`已复制 ${state.exportFormat.toUpperCase()} 格式到剪贴板`);
  }

  function handleDownloadFile() {
    const content = getFormattedOutput();
    if (!content) {
      showToast('当前无有效文稿可导出');
      return;
    }
    const extMap = { txt: 'txt', srt: 'srt', md: 'md', prompt: 'prompt.txt', json: 'json' };
    const ext = extMap[state.exportFormat] || 'txt';
    const safeTitle = (state.meta?.title || 'bilibili_transcript')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 60);
    const filename = `${safeTitle}_P${state.meta?.p || 1}_${state.meta?.bvid || ''}.${ext}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`已导出文件: ${filename}`);
  }

  function togglePanel() {
    state.isOpen = !state.isOpen;
    if (state.isOpen && !state.meta && !state.loading) {
      loadCurrentVideoTranscript();
    } else {
      renderUI();
    }
  }

  function renderUI() {
    const darkClass = isHostDarkMode() ? 'theme-dark' : '';
    const pBadge = state.meta ? `P${state.meta.p}/${state.meta.totalPages}` : '就绪';

    const trackOptionsHtml = state.subtitleTracks.length > 0
      ? state.subtitleTracks
          .map((t, idx) => `<option value="${idx}" ${idx === state.activeTrackIndex ? 'selected' : ''}>${t.lanDoc} ${t.isAi ? '(AI)' : '(CC)'}</option>`)
          .join('')
      : `<option value="-1">无 CC/AI 字幕轨</option>`;

    let mainBodyHtml = '';
    if (state.loading) {
      mainBodyHtml = `<div class="empty-state">正在嗅探 BVID/CID 并提取字幕数据...</div>`;
    } else if (state.error) {
      mainBodyHtml = `<div class="empty-state">${state.error}</div>`;
    } else if (state.activeTab === 'subtitles') {
      const filtered = state.subtitleBody.filter((item) =>
        !state.searchKeyword || (item.content || '').toLowerCase().includes(state.searchKeyword.toLowerCase())
      );
      if (filtered.length === 0) {
        const loginHint = state.meta && !state.meta.isLoggedIn
          ? '<br><br>⚠️ 检测到当前未登录 B 站账号，B 站服务端对未登录访客默认隐藏 AI 字幕。请先登录后点击右上角「刷新」。'
          : '<br><br>可切换至上方「AI 总结」标签页查看是否有视频提纲。';
        mainBodyHtml = `<div class="empty-state">当前视频暂无逐句字幕数据。${loginHint}</div>`;
      } else {
        mainBodyHtml = filtered
          .map((item) => {
            const timeStr = window.BiliScriptFormatter.formatReadableTime(item.from);
            return `<div class="sub-line" data-sec="${item.from}">
              <span class="sub-time">[${timeStr}]</span>
              <span class="sub-text">${item.content}</span>
            </div>`;
          })
          .join('');
      }
    } else if (state.activeTab === 'ai') {
      if (!state.aiConclusion) {
        mainBodyHtml = `<div class="empty-state">当前视频暂无 B 站官方 AI 视频总结。</div>`;
      } else {
        const summaryHtml = state.aiConclusion.summary
          ? `<div style="margin-bottom:12px;padding:10px;background:var(--bg-secondary);border-radius:8px;"><strong>核心摘要：</strong>${state.aiConclusion.summary}</div>`
          : '';
        const outlineHtml = (state.aiConclusion.outline || [])
          .map((sec) => {
            const secTime = window.BiliScriptFormatter.formatReadableTime(sec.timestamp);
            const points = (sec.part_outline || [])
              .map((pt) => {
                const ptTime = window.BiliScriptFormatter.formatReadableTime(pt.timestamp);
                return `<div class="sub-line" data-sec="${pt.timestamp}">
                  <span class="sub-time">[${ptTime}]</span>
                  <span class="sub-text">${pt.content}</span>
                </div>`;
              })
              .join('');
            return `<div style="margin-bottom:10px;">
              <div class="sub-line" data-sec="${sec.timestamp}" style="font-weight:700;">
                <span class="sub-time">[${secTime}]</span>
                <span class="sub-text">${sec.title}</span>
              </div>
              ${points}
            </div>`;
          })
          .join('');
        mainBodyHtml = summaryHtml + outlineHtml;
      }
    } else if (state.activeTab === 'export') {
      const previewText = getFormattedOutput();
      mainBodyHtml = `<textarea class="export-preview" readonly>${previewText || '暂无可导出内容'}</textarea>`;
    }

    containerEl.className = darkClass;
    containerEl.innerHTML = `
      <div class="fab-trigger" id="bili-fab-btn" title="快捷键 Alt+S 打开/收起">
        <span class="fab-dot"></span>
        <span>提取文稿</span>
      </div>

      <div class="drawer-panel ${state.isOpen ? '' : 'hidden'}">
        <div class="drawer-header">
          <div class="drawer-title">
            <span>B站文稿提取器</span>
            <span class="badge-p">${pBadge}</span>
          </div>
          <div class="header-actions">
            <button class="icon-btn" id="btn-refresh" title="重新提取当前分P">刷新</button>
            <button class="icon-btn" id="btn-close">关闭</button>
          </div>
        </div>

        <div class="toolbar-row">
          <select class="select-box" id="select-track">${trackOptionsHtml}</select>
          <input class="search-input" id="input-search" type="text" placeholder="搜索字幕关键词..." value="${state.searchKeyword}" />
        </div>

        <div class="tabs-bar">
          <div class="tab-btn ${state.activeTab === 'subtitles' ? 'active' : ''}" data-tab="subtitles">
            逐句字幕 (${state.subtitleBody.length})
          </div>
          <div class="tab-btn ${state.activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
            AI 总结 ${state.aiConclusion ? '✓' : ''}
          </div>
          <div class="tab-btn ${state.activeTab === 'export' ? 'active' : ''}" data-tab="export">
            格式转换预览
          </div>
        </div>

        <div class="content-Viewport" id="viewport-body">
          ${mainBodyHtml}
        </div>

        <div class="drawer-footer">
          <div style="display:flex;gap:6px;align-items:center;">
            <select class="select-box" id="select-format">
              <option value="txt" ${state.exportFormat === 'txt' ? 'selected' : ''}>纯文本 (TXT)</option>
              <option value="md" ${state.exportFormat === 'md' ? 'selected' : ''}>笔记 (Markdown)</option>
              <option value="srt" ${state.exportFormat === 'srt' ? 'selected' : ''}>标准字幕 (SRT)</option>
              <option value="prompt" ${state.exportFormat === 'prompt' ? 'selected' : ''}>AI 提示词 (Prompt)</option>
              <option value="json" ${state.exportFormat === 'json' ? 'selected' : ''}>原始数据 (JSON)</option>
            </select>
            ${
              state.exportFormat === 'txt'
                ? `<label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;">
                    <input type="checkbox" id="chk-merge" ${state.mergeParagraphs ? 'checked' : ''}/>合并段落
                   </label>`
                : ''
            }
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-primary" id="btn-copy">一键复制</button>
            <button class="btn-secondary" id="btn-download">下载文件</button>
          </div>
        </div>

        <div class="toast-tip"></div>
      </div>
    `;

    // 绑定事件
    shadowRoot.getElementById('bili-fab-btn')?.addEventListener('click', togglePanel);
    shadowRoot.getElementById('btn-close')?.addEventListener('click', togglePanel);
    shadowRoot.getElementById('btn-refresh')?.addEventListener('click', () => loadCurrentVideoTranscript());

    shadowRoot.getElementById('select-track')?.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      if (idx >= 0) switchSubtitleTrack(idx);
    });

    shadowRoot.getElementById('input-search')?.addEventListener('input', (e) => {
      state.searchKeyword = e.target.value;
      renderUI();
      const input = shadowRoot.getElementById('input-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    shadowRoot.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.getAttribute('data-tab');
        renderUI();
      });
    });

    shadowRoot.querySelectorAll('.sub-line').forEach((row) => {
      row.addEventListener('click', () => {
        const sec = parseFloat(row.getAttribute('data-sec'));
        if (!Number.isNaN(sec)) {
          callMainProbe('SEEK_VIDEO', { seconds: sec });
        }
      });
    });

    shadowRoot.getElementById('select-format')?.addEventListener('change', (e) => {
      state.exportFormat = e.target.value;
      renderUI();
    });

    shadowRoot.getElementById('chk-merge')?.addEventListener('change', (e) => {
      state.mergeParagraphs = e.target.checked;
      renderUI();
    });

    shadowRoot.getElementById('btn-copy')?.addEventListener('click', handleCopyOutput);
    shadowRoot.getElementById('btn-download')?.addEventListener('click', handleDownloadFile);
  }

  renderUI();
})();
