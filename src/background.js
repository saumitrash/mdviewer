const VIEWER_FILES = [
  'vendor/marked.min.js',
  'vendor/purify.min.js',
  'vendor/highlight.min.js',
  'vendor/katex.min.js',
  'src/viewer.js'
];

const VIEWER_CSS = ['styles/fonts.css', 'vendor/katex.min.css', 'styles/viewer.css'];

async function injectViewer(tabId, frameId = 0) {
  // insertCSS is applied by the extension itself, so a restrictive page CSP
  // (raw.githubusercontent.com sends `default-src 'none'`) cannot block it.
  await chrome.scripting.insertCSS({
    target: { tabId, frameIds: [frameId] },
    files: VIEWER_CSS
  });
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: VIEWER_FILES,
    world: 'ISOLATED'
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'mdv:inject' && sender.tab) {
    injectViewer(sender.tab.id, sender.frameId ?? 0)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === 'mdv:inject-mermaid' && sender.tab) {
    chrome.scripting
      .executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
        files: ['vendor/mermaid.min.js'],
        world: 'ISOLATED'
      })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === 'mdv:broadcast-settings') {
    chrome.tabs.query({}).then((tabs) => {
      for (const t of tabs) {
        chrome.tabs
          .sendMessage(t.id, { type: 'mdv:settings-changed', settings: msg.settings })
          .catch(() => {});
      }
    });
  }
});

async function toggleActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'mdv:toggle' });
  } catch {
    /* not a markdown page */
  }
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'toggle-view') toggleActiveTab();
});
