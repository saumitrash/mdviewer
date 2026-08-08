/* Lightweight probe that runs on every page. Decides whether this document is a
   raw markdown file and, if so, asks the service worker to inject the viewer. */
(() => {
  if (window.__mdvProbe) return;
  window.__mdvProbe = true;

  const MD_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdx|qmd|rmd|text)(?:$|[?#])/i;

  function isMarkdownDocument() {
    const ct = (document.contentType || '').toLowerCase();
    const body = document.body;
    if (!body) return false;

    // Chrome renders text/plain documents as a single <pre> inside <body>.
    const kids = [...body.children].filter((n) => n.tagName !== 'SCRIPT');
    const pre = kids.length === 1 && kids[0].tagName === 'PRE' ? kids[0] : null;
    if (!pre) return false;

    if (ct.includes('markdown')) return true;
    if (ct === 'text/plain' || ct === '' || ct === 'application/octet-stream') {
      return MD_EXT.test(decodeURIComponent(location.pathname));
    }
    return false;
  }

  if (!isMarkdownDocument()) return;

  const source = document.body.querySelector('pre').textContent;
  window.__mdvSource = source;
  window.__mdvIsMarkdown = true;

  let injected = false;
  function inject(forceOn) {
    if (injected) {
      window.dispatchEvent(new CustomEvent('mdv:toggle'));
      return;
    }
    injected = true;
    chrome.runtime.sendMessage({ type: 'mdv:inject', forceOn: !!forceOn });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'mdv:toggle') {
      inject(true);
      sendResponse({ ok: true, markdown: true });
      return true;
    }
    if (msg?.type === 'mdv:probe') {
      sendResponse({ markdown: true, injected });
      return true;
    }
    if (msg?.type === 'mdv:settings-changed') {
      window.dispatchEvent(new CustomEvent('mdv:settings-changed', { detail: msg.settings }));
    }
  });

  chrome.storage.sync.get({ renderByDefault: true }).then(({ renderByDefault }) => {
    if (renderByDefault) inject(false);
  });
})();
