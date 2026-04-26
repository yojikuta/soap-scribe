chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (request.action === 'checkCuronTab') {
    chrome.tabs.query({ url: ['*://curon.co/*', '*://*.curon.co/*'] }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn('[SoapScribe] tabs.query error:', chrome.runtime.lastError.message);
        sendResponse({ streamId: null, tabFound: false });
        return;
      }
      if (!tabs.length) {
        sendResponse({ streamId: null, tabFound: false });
        return;
      }
      console.log('[SoapScribe] curonタブ発見:', tabs[0].id, tabs[0].url);
      chrome.tabCapture.getMediaStreamId(
        { targetTabId: tabs[0].id, consumerTabId: sender.tab.id },
        (streamId) => {
          if (chrome.runtime.lastError) {
            console.warn('[SoapScribe] getMediaStreamId error:', chrome.runtime.lastError.message);
            sendResponse({ streamId: null, tabFound: true });
          } else {
            console.log('[SoapScribe] streamId取得:', streamId ? '成功' : '空');
            sendResponse({ streamId: streamId || null, tabFound: true });
          }
        }
      );
    });
    return true;
  }

  if (request.action !== 'callClaudeAPI') return false;

  // API key uses sync storage so it follows the user's Google account across devices
  chrome.storage.sync.get(['claudeApiKey'], async (result) => {
    if (!result.claudeApiKey) {
      sendResponse({ error: 'Claude APIキーが未設定です。⚙️ 設定からAPIキーを入力してください。' });
      return;
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': result.claudeApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: [
            {
              type: 'text',
              text: request.systemPrompt,
              cache_control: { type: 'ephemeral' }
            }
          ],
          messages: [{ role: 'user', content: request.userMessage }]
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      sendResponse({ text: data.content[0].text });
    } catch (e) {
      sendResponse({ error: e.message });
    }
  });

  return true; // keep message channel open for async response
});
