document.getElementById('btn-open')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DRAWER_PANEL' }).catch(() => {});
    window.close();
  }
});
