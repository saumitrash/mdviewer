/* Enriched markdown viewer. Injected on demand into raw .md documents. */
(() => {
  if (window.__mdvViewer) {
    window.dispatchEvent(new CustomEvent('mdv:toggle'));
    return;
  }
  window.__mdvViewer = true;

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

  const SENT = '\u0000';

  const SOURCE =
    window.__mdvSource ??
    (document.querySelector('pre') ? document.querySelector('pre').textContent : '');

  let settings = { ...DEFAULTS };
  let enriched = true;

  /* ------------------------------------------------------------------ *
   * Source preprocessing
   * ------------------------------------------------------------------ */

  function splitFrontMatter(src) {
    const m = /^\ufeff?(?:---|\+\+\+)\r?\n([\s\S]*?)\r?\n(?:---|\+\+\+)[ \t]*(?:\r?\n|$)/.exec(src);
    if (!m) return { meta: null, body: src };
    return { meta: m[1], body: src.slice(m[0].length) };
  }

  /* Swap fenced/inline code out so later regexes never touch it. */
  function protectCode(src) {
    const store = [];
    const out = src.replace(
      /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[ \t]*(?=\n|$)|`+[^`\n]*`+/g,
      (m) => {
        store.push(m);
        return SENT + 'C' + (store.length - 1) + SENT;
      }
    );
    return { src: out, store };
  }

  const restoreCode = (src, store) =>
    src.replace(new RegExp(SENT + 'C(\\d+)' + SENT, 'g'), (_, i) => store[+i]);

  const mathStore = [];

  function extractMath(src) {
    const put = (tex, display) => {
      mathStore.push({ tex, display });
      const i = mathStore.length - 1;
      return display
        ? `\n\n<div class="mdv-math" data-mdv-math="${i}"></div>\n\n`
        : `<span class="mdv-math" data-mdv-math="${i}"></span>`;
    };
    return src
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => put(t, true))
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => put(t, true))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => put(t, false))
      .replace(
        /(^|[^\\$\w])\$(?![\s$])((?:[^$\n\\]|\\.)+?)(?<![\s\\])\$(?!\$|\w)/g,
        (_m, pre, t) => pre + put(t, false)
      );
  }

  /* Footnotes: [^id] references plus [^id]: definition blocks. */
  function extractFootnotes(src) {
    const defs = new Map();
    const lines = src.split('\n');
    const kept = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(lines[i]);
      if (!m) {
        kept.push(lines[i]);
        continue;
      }
      const parts = [m[2]];
      // Continuation lines are indented; a blank line ends the definition.
      while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
        parts.push(lines[i + 1].replace(/^(?: {1,4}|\t)/, ''));
        i++;
      }
      defs.set(m[1], parts.join('\n').trim());
    }
    if (!defs.size) return { src, footnotes: [] };

    const order = [];
    const body = kept.join('\n').replace(/\[\^([^\]\s]+)\]/g, (m, id) => {
      if (!defs.has(id)) return m;
      let idx = order.indexOf(id);
      if (idx === -1) {
        order.push(id);
        idx = order.length - 1;
      }
      const n = idx + 1;
      return `<sup class="mdv-fnref" id="fnref-${n}"><a href="#fn-${n}" aria-label="Footnote ${n}">${n}</a></sup>`;
    });

    const footnotes = order.map((id, i) => ({ n: i + 1, id, text: defs.get(id) }));
    return { src: body, footnotes };
  }

  /* ------------------------------------------------------------------ *
   * Markdown -> HTML
   * ------------------------------------------------------------------ */

  const SANITIZE = {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ADD_ATTR: [
      'target',
      'rel',
      'checked',
      'disabled',
      'align',
      'colspan',
      'rowspan',
      'start',
      'loading'
    ],
    FORBID_TAGS: ['style', 'form'],
    ALLOW_DATA_ATTR: true
  };

  function toHtml(markdown) {
    marked.setOptions({ gfm: true, breaks: false, pedantic: false });
    return DOMPurify.sanitize(marked.parse(markdown), SANITIZE);
  }

  function renderFootnotes(footnotes) {
    if (!footnotes.length) return '';
    const items = footnotes
      .map((f) => {
        const inner = DOMPurify.sanitize(marked.parse(f.text), SANITIZE);
        return `<li id="fn-${f.n}">${inner}<a class="mdv-fnback" href="#fnref-${f.n}" aria-label="Back to reference">&#8617;</a></li>`;
      })
      .join('');
    return `<section class="mdv-footnotes"><h2 id="footnotes">Footnotes</h2><ol>${items}</ol></section>`;
  }

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderFrontMatter(meta) {
    if (!meta) return '';
    const rows = [];
    let key = null;
    let buf = [];
    const flush = () => {
      if (key !== null) rows.push([key, buf.join(' ').trim()]);
      key = null;
      buf = [];
    };
    for (const line of meta.split('\n')) {
      const m = /^([A-Za-z0-9_.\- ]+):\s*(.*)$/.exec(line);
      if (m && !/^\s/.test(line)) {
        flush();
        key = m[1].trim();
        buf = [m[2]];
      } else if (line.trim()) {
        buf.push(line.trim().replace(/^-\s*/, '• '));
      }
    }
    flush();
    if (!rows.length) return '';
    const body = rows
      .map(
        ([k, v]) =>
          `<div class="mdv-fm-row"><dt>${esc(k)}</dt><dd>${esc(v.replace(/^["']|["']$/g, ''))}</dd></div>`
      )
      .join('');
    return `<dl class="mdv-frontmatter">${body}</dl>`;
  }

  /* ------------------------------------------------------------------ *
   * DOM enhancement
   * ------------------------------------------------------------------ */

  const slugCounts = new Map();
  function slugify(text) {
    let s = text
      .toLowerCase()
      .trim()
      .replace(/['"!#$%&()*+,./:;<=>?@[\]^`{|}~\\]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!s) s = 'section';
    const n = slugCounts.get(s) || 0;
    slugCounts.set(s, n + 1);
    return n ? `${s}-${n}` : s;
  }

  const ALERTS = {
    NOTE: 'Note',
    TIP: 'Tip',
    IMPORTANT: 'Important',
    WARNING: 'Warning',
    CAUTION: 'Caution'
  };

  function enhanceHeadings(root, toc) {
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (!h.id) h.id = slugify(h.textContent);
      const text = h.textContent.trim();
      const a = document.createElement('a');
      a.className = 'mdv-anchor';
      a.href = `#${h.id}`;
      a.setAttribute('aria-label', 'Link to this section');
      a.textContent = '#';
      h.appendChild(a);
      const level = +h.tagName[1];
      if (level <= 4 && !h.closest('.mdv-footnotes')) toc.push({ id: h.id, level, text });
    });
  }

  function enhanceAlerts(root) {
    root.querySelectorAll('blockquote').forEach((bq) => {
      const first = bq.firstElementChild;
      if (!first || first.tagName !== 'P') return;
      const m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(first.textContent);
      if (!m) return;
      const kind = m[1].toUpperCase();
      const walker = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
      const t = walker.nextNode();
      if (t) t.nodeValue = t.nodeValue.replace(/^\s*\[![A-Za-z]+\]\s*/, '');
      if (!first.textContent.trim() && !first.querySelector('img, code')) first.remove();
      bq.classList.add('mdv-alert', `mdv-alert-${kind.toLowerCase()}`);
      const head = document.createElement('div');
      head.className = 'mdv-alert-head';
      head.innerHTML = `<span class="mdv-alert-icon"></span><span>${ALERTS[kind]}</span>`;
      bq.prepend(head);
    });
  }

  function enhanceCode(root) {
    root.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      const cls = [...code.classList].find((c) => c.startsWith('language-'));
      const lang = cls ? cls.slice(9).toLowerCase() : '';

      if (lang === 'mermaid') {
        const holder = document.createElement('div');
        holder.className = 'mdv-mermaid';
        holder.textContent = code.textContent;
        pre.replaceWith(holder);
        return;
      }
      if (lang === 'math' || lang === 'katex') {
        const holder = document.createElement('div');
        holder.className = 'mdv-math';
        holder.dataset.mdvMath = String(
          mathStore.push({ tex: code.textContent, display: true }) - 1
        );
        pre.replaceWith(holder);
        return;
      }

      let label = lang;
      if (lang && hljs.getLanguage(lang)) {
        try {
          code.innerHTML = hljs.highlight(code.textContent, {
            language: lang,
            ignoreIllegals: true
          }).value;
          label = hljs.getLanguage(lang).name || lang;
        } catch {
          /* leave plain */
        }
      } else if (!lang) {
        const auto = hljs.highlightAuto(code.textContent, [
          'javascript',
          'typescript',
          'python',
          'bash',
          'json',
          'go',
          'rust',
          'sql',
          'yaml',
          'xml'
        ]);
        if (auto.relevance > 8) {
          code.innerHTML = auto.value;
          label = auto.language || '';
        }
      }
      code.classList.add('hljs');

      const wrap = document.createElement('figure');
      wrap.className = 'mdv-code';
      pre.replaceWith(wrap);

      const bar = document.createElement('figcaption');
      bar.className = 'mdv-code-bar';
      bar.innerHTML = `<span class="mdv-code-lang">${esc(label || 'text')}</span>`;
      const btn = document.createElement('button');
      btn.className = 'mdv-copy';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          btn.textContent = 'Copied';
        } catch {
          btn.textContent = 'Press Cmd+C';
        }
        btn.classList.add('is-done');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('is-done');
        }, 1400);
      });
      bar.appendChild(btn);
      wrap.append(bar, pre);

      if (settings.lineNumbers) addLineNumbers(pre, code);
    });
  }

  function addLineNumbers(pre, code) {
    const lines = code.textContent.replace(/\n$/, '').split('\n').length;
    const gutter = document.createElement('span');
    gutter.className = 'mdv-gutter';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    pre.classList.add('has-gutter');
    pre.prepend(gutter);
  }

  function enhanceTables(root) {
    root.querySelectorAll('table').forEach((t) => {
      const wrap = document.createElement('div');
      wrap.className = 'mdv-table-wrap';
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
  }

  function enhanceTaskLists(root) {
    root.querySelectorAll('li input[type="checkbox"]').forEach((cb) => {
      cb.disabled = false;
      const li = cb.closest('li');
      li.classList.add('mdv-task');
      li.classList.toggle('is-done', cb.checked);
      cb.addEventListener('change', () => li.classList.toggle('is-done', cb.checked));
      const list = cb.closest('ul, ol');
      if (list) list.classList.add('mdv-tasklist');
    });
  }

  function enhanceLinks(root) {
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (/^https?:/i.test(href) && a.hostname !== location.hostname) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.classList.add('mdv-ext');
      }
    });
    root.querySelectorAll('img').forEach((img) => {
      img.loading = 'lazy';
      img.addEventListener('error', () => img.classList.add('mdv-img-broken'), { once: true });
    });
  }

  function renderMath() {
    document.querySelectorAll('.mdv-math[data-mdv-math]').forEach((el) => {
      if (el.dataset.mdvRendered) return;
      const entry = mathStore[+el.dataset.mdvMath];
      if (!entry) return;
      el.dataset.mdvRendered = '1';
      try {
        katex.render(entry.tex, el, {
          displayMode: entry.display,
          throwOnError: false,
          output: 'html',
          trust: false
        });
      } catch {
        el.textContent = (entry.display ? '$$' : '$') + entry.tex + (entry.display ? '$$' : '$');
        el.classList.add('mdv-math-error');
      }
    });
  }

  let mermaidRequested = false;
  async function renderMermaid() {
    const nodes = [...document.querySelectorAll('.mdv-mermaid')];
    if (!nodes.length) return;
    if (!mermaidRequested) {
      mermaidRequested = true;
      try {
        await chrome.runtime.sendMessage({ type: 'mdv:inject-mermaid' });
      } catch {
        /* ignore */
      }
    }
    if (typeof mermaid === 'undefined') return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: currentDark() ? 'dark' : 'default',
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mdv-font-sans')
    });
    for (const [i, node] of nodes.entries()) {
      const src = node.dataset.src || node.textContent;
      node.dataset.src = src;
      try {
        const { svg } = await mermaid.render(`mdv-mmd-${i}-${Math.floor(performance.now())}`, src);
        node.innerHTML = svg;
        node.classList.add('is-rendered');
      } catch {
        node.classList.add('mdv-mermaid-error');
        node.textContent = src;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Chrome (toolbar, TOC, progress)
   * ------------------------------------------------------------------ */

  const FONT_THEMES = [
    { id: 'modern', label: 'Modern — Inter' },
    { id: 'editorial', label: 'Editorial — Source Serif' },
    { id: 'book', label: 'Book — Literata' },
    { id: 'technical', label: 'Technical — IBM Plex' },
    { id: 'system', label: 'System — native UI' }
  ];
  const WIDTHS = ['narrow', 'normal', 'wide', 'full'];

  const currentDark = () =>
    settings.theme === 'dark' ||
    (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

  function applySettings() {
    const r = document.documentElement;
    r.dataset.mdvFont = settings.fontTheme;
    r.dataset.mdvTheme = currentDark() ? 'dark' : 'light';
    r.dataset.mdvWidth = settings.contentWidth;
    r.dataset.mdvToc = settings.showToc ? 'on' : 'off';
    r.style.setProperty('--mdv-font-size', `${settings.fontSize}px`);
    r.style.setProperty('--mdv-line-height', String(settings.lineHeight));
  }

  function saveSettings(patch) {
    Object.assign(settings, patch);
    applySettings();
    chrome.storage.sync.set(patch);
  }

  function buildToolbar(stats) {
    const bar = document.createElement('div');
    bar.className = 'mdv-toolbar';
    bar.innerHTML = `
      <div class="mdv-progress"><span></span></div>
      <div class="mdv-toolbar-inner">
        <button class="mdv-btn mdv-icon-btn" data-act="toc" title="Toggle contents (t)">&#9776;</button>
        <div class="mdv-doc-title"></div>
        <div class="mdv-stats">${stats.words.toLocaleString()} words &middot; ${stats.minutes} min</div>
        <div class="mdv-spacer"></div>
        <select class="mdv-select" data-act="font" title="Typeface">
          ${FONT_THEMES.map((f) => `<option value="${f.id}">${f.label}</option>`).join('')}
        </select>
        <button class="mdv-btn mdv-icon-btn" data-act="smaller" title="Smaller text">A&minus;</button>
        <button class="mdv-btn mdv-icon-btn" data-act="bigger" title="Larger text">A+</button>
        <button class="mdv-btn mdv-icon-btn" data-act="width" title="Reading width">&#8596;</button>
        <button class="mdv-btn mdv-icon-btn" data-act="theme" title="Theme (d)">&#9681;</button>
        <button class="mdv-btn mdv-primary" data-act="raw" title="Show raw markdown (Alt+M)">Raw</button>
      </div>`;

    bar.querySelector('.mdv-doc-title').textContent = stats.title;
    bar.querySelector('.mdv-doc-title').title = decodeURIComponent(location.pathname);
    bar.querySelector('[data-act="font"]').value = settings.fontTheme;

    bar.addEventListener('change', (e) => {
      if (e.target.dataset.act === 'font') saveSettings({ fontTheme: e.target.value });
    });
    bar.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      switch (act) {
        case 'toc':
          saveSettings({ showToc: !settings.showToc });
          break;
        case 'smaller':
          saveSettings({ fontSize: Math.max(13, settings.fontSize - 1) });
          break;
        case 'bigger':
          saveSettings({ fontSize: Math.min(26, settings.fontSize + 1) });
          break;
        case 'width':
          saveSettings({
            contentWidth: WIDTHS[(WIDTHS.indexOf(settings.contentWidth) + 1) % WIDTHS.length]
          });
          break;
        case 'theme': {
          const order = ['auto', 'light', 'dark'];
          saveSettings({ theme: order[(order.indexOf(settings.theme) + 1) % order.length] });
          renderMermaid();
          break;
        }
        case 'raw':
          toggle();
          break;
      }
    });
    return bar;
  }

  function buildToc(items) {
    const aside = document.createElement('aside');
    aside.className = 'mdv-toc';
    if (items.length < 2) {
      aside.classList.add('is-empty');
      return aside;
    }
    const min = Math.min(...items.map((i) => i.level));
    const nav = document.createElement('nav');
    for (const i of items) {
      const a = document.createElement('a');
      a.href = `#${i.id}`;
      a.dataset.target = i.id;
      a.className = `mdv-toc-l${Math.min(3, i.level - min)}`;
      a.textContent = i.text;
      nav.appendChild(a);
    }
    const title = document.createElement('div');
    title.className = 'mdv-toc-title';
    title.textContent = 'Contents';
    aside.append(title, nav);
    return aside;
  }

  function wireScrollSpy(toc, article) {
    const links = new Map(
      [...toc.querySelectorAll('a[data-target]')].map((a) => [a.dataset.target, a])
    );
    if (!links.size) return;
    const order = [...links.keys()];
    const visible = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const active = order.find((id) => visible.has(id));
        links.forEach((a) => a.classList.remove('is-active'));
        if (!active) return;
        const a = links.get(active);
        a.classList.add('is-active');
        const box = toc.querySelector('nav');
        if (a.offsetTop < box.scrollTop || a.offsetTop > box.scrollTop + box.clientHeight - 40) {
          box.scrollTop = a.offsetTop - box.clientHeight / 2;
        }
      },
      { rootMargin: '-70px 0px -70% 0px', threshold: 0 }
    );
    for (const id of order) {
      const el = article.querySelector(`#${CSS.escape(id)}`);
      if (el) io.observe(el);
    }
  }

  function wireProgress(bar) {
    const fill = bar.querySelector('.mdv-progress > span');
    const update = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      fill.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ------------------------------------------------------------------ *
   * Assembly
   * ------------------------------------------------------------------ */

  function fileName() {
    const parts = decodeURIComponent(location.pathname).split('/').filter(Boolean);
    return parts[parts.length - 1] || location.hostname || 'document';
  }

  function build() {
    const { meta, body } = splitFrontMatter(SOURCE);
    const guarded = protectCode(body);
    const fn = extractFootnotes(guarded.src);
    const withMath = extractMath(fn.src);
    const markdown = restoreCode(withMath, guarded.store);

    const html = renderFrontMatter(meta) + toHtml(markdown) + renderFootnotes(fn.footnotes);

    const article = document.createElement('article');
    article.className = 'mdv-article';
    article.innerHTML = html;

    const toc = [];
    enhanceHeadings(article, toc);
    enhanceAlerts(article);
    enhanceCode(article);
    enhanceTables(article);
    enhanceTaskLists(article);
    enhanceLinks(article);

    const words = article.textContent.trim().split(/\s+/).filter(Boolean).length;
    const h1 = article.querySelector('h1');
    const stats = {
      words,
      minutes: Math.max(1, Math.round(words / 220)),
      title: (h1 ? h1.textContent.replace(/#$/, '').trim() : '') || fileName()
    };

    const bar = buildToolbar(stats);
    const tocEl = buildToc(toc);
    const layout = document.createElement('div');
    layout.className = 'mdv-layout';
    layout.append(tocEl, article);

    const shell = document.createElement('div');
    shell.className = 'mdv-shell';
    shell.append(bar, layout);

    const raw = document.createElement('pre');
    raw.className = 'mdv-raw';
    raw.textContent = SOURCE;

    document.title = stats.title;
    document.body.replaceChildren(shell, raw);
    document.documentElement.classList.add('mdv-active');

    renderMath();
    renderMermaid();
    wireScrollSpy(tocEl, article);
    wireProgress(bar);

    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 0);
    }
  }

  function toggle() {
    enriched = !enriched;
    document.documentElement.classList.toggle('mdv-raw-mode', !enriched);
    const btn = document.querySelector('[data-act="raw"]');
    if (btn) btn.textContent = enriched ? 'Raw' : 'Enriched';
  }

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === 't') {
      e.preventDefault();
      saveSettings({ showToc: !settings.showToc });
    } else if (e.key === 'd') {
      e.preventDefault();
      saveSettings({ theme: currentDark() ? 'light' : 'dark' });
      renderMermaid();
    } else if (e.key === 'r') {
      e.preventDefault();
      toggle();
    }
  });

  addEventListener('mdv:toggle', toggle);
  addEventListener('mdv:settings-changed', (e) => {
    if (!e.detail) return;
    Object.assign(settings, e.detail);
    applySettings();
    const sel = document.querySelector('[data-act="font"]');
    if (sel) sel.value = settings.fontTheme;
    renderMermaid();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') {
      applySettings();
      renderMermaid();
    }
  });

  (async () => {
    settings = await chrome.storage.sync.get(DEFAULTS);
    applySettings();
    build();
  })();
})();
