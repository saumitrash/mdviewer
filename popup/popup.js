const DEFAULTS = {
  renderByDefault: true,
  fontTheme: 'modern',
  theme: 'auto',
  contentWidth: 'normal',
  fontSize: 17,
  lineHeight: 1.7,
  showToc: true,
  lineNumbers: false
};

const FONTS = [
  { id: 'modern', name: 'Inter', note: 'Modern' },
  { id: 'editorial', name: 'Source Serif', note: 'Editorial' },
  { id: 'book', name: 'Literata', note: 'Book' },
  { id: 'technical', name: 'IBM Plex', note: 'Technical' },
  { id: 'system', name: 'System UI', note: 'Native' }
];

const FONT_CSS = {
  modern: "'MDV Inter', sans-serif",
  editorial: "'MDV Source Serif', Georgia, serif",
  book: "'MDV Literata', Georgia, serif",
  technical: "'MDV Plex Sans', sans-serif",
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

let settings = { ...DEFAULTS };

function broadcast(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch);
  chrome.runtime.sendMessage({ type: 'mdv:broadcast-settings', settings });
}

function buildSpecimens() {
  const host = document.getElementById('specimens');
  host.replaceChildren(
    ...FONTS.map((f) => {
      const b = document.createElement('button');
      b.className = 'spec';
      b.type = 'button';
      b.dataset.value = f.id;
      b.innerHTML = `<span class="sample">Aa &mdash; the quick brown fox</span><span class="name">${f.note}</span>`;
      b.querySelector('.sample').style.fontFamily = FONT_CSS[f.id];
      b.title = f.name;
      b.addEventListener('click', () => {
        broadcast({ fontTheme: f.id });
        paint();
      });
      return b;
    })
  );
}

function paintGroup(id, value) {
  document.querySelectorAll(`#${id} button`).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.value === value));
  });
}

function paint() {
  document.querySelectorAll('.spec').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.fontTheme))
  );
  paintGroup('theme', settings.theme);
  paintGroup('contentWidth', settings.contentWidth);
  document.getElementById('renderByDefault').checked = settings.renderByDefault;
  document.getElementById('showToc').checked = settings.showToc;
  document.getElementById('lineNumbers').checked = settings.lineNumbers;
  document.getElementById('fontSize').value = settings.fontSize;
  document.getElementById('lineHeight').value = settings.lineHeight;
  document.getElementById('fontSizeVal').textContent = `${settings.fontSize}px`;
  document.getElementById('lineHeightVal').textContent = Number(settings.lineHeight).toFixed(2);
}

function wire() {
  for (const id of ['theme', 'contentWidth']) {
    document.getElementById(id).addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.value;
      if (!v) return;
      broadcast({ [id]: v });
      paint();
    });
  }
  for (const id of ['renderByDefault', 'showToc', 'lineNumbers']) {
    document.getElementById(id).addEventListener('change', (e) => {
      broadcast({ [id]: e.target.checked });
    });
  }
  document.getElementById('fontSize').addEventListener('input', (e) => {
    broadcast({ fontSize: +e.target.value });
    document.getElementById('fontSizeVal').textContent = `${e.target.value}px`;
  });
  document.getElementById('lineHeight').addEventListener('input', (e) => {
    broadcast({ lineHeight: +e.target.value });
    document.getElementById('lineHeightVal').textContent = Number(e.target.value).toFixed(2);
  });
  document.getElementById('reset').addEventListener('click', async () => {
    settings = { ...DEFAULTS };
    broadcast({ ...DEFAULTS });
    paint();
  });
}

async function reportStatus() {
  const el = document.getElementById('status');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'mdv:probe' });
    if (res?.markdown) {
      el.textContent = 'Markdown detected on this page';
      el.classList.add('ok');
      return;
    }
  } catch {
    /* no content script here */
  }
  if (tab.url?.startsWith('file:')) {
    el.textContent = 'Not a markdown file';
  } else {
    el.textContent = 'Settings apply to any .md page';
  }
}

(async () => {
  settings = await chrome.storage.sync.get(DEFAULTS);
  buildSpecimens();
  wire();
  paint();
  reportStatus();
})();
