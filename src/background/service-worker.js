/**
 * src/background/service-worker.js
 * Manifest V3 Background Service Worker
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'FETCH_SUBTITLE_JSON' && message.url) {
    fetch(message.url, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || '字幕 CDN JSON 下载失败' });
      });
    return true; // 保持异步消息通道开启
  }
});

// 监听快捷键 Alt+S 切换文稿面板显示
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DRAWER_PANEL' }).catch(() => {});
    }
  }
});
