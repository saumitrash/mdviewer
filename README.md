# Markdown Viewer — Enriched

A Chrome extension that turns raw `.md` files into a properly typeset document,
with a one-key toggle back to the original plain text.

Everything runs locally: the parser, highlighter, math engine, diagram renderer
and all fonts are bundled. No network requests, no telemetry.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Click **Details** on the extension and turn on **Allow access to file URLs** —
   without this, local `.md` files stay plain text.

Open any `.md` file and it renders. `Alt+M` toggles raw ⇄ enriched.

## What it handles

| Construct | Notes |
| --- | --- |
| CommonMark + GFM | via `marked` — tables, strikethrough, autolinks, task lists |
| Syntax highlighting | `highlight.js`, ~40 languages, auto-detect for untagged fences |
| Math | KaTeX — `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, and ` ```math ` fences |
| Diagrams | Mermaid, in ` ```mermaid ` fences, loaded lazily (2.5 MB only when needed) |
| Alerts | GitHub callouts: `> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` |
| Footnotes | `[^id]` references with numbering and back-links |
| Front matter | YAML/TOML block rendered as a metadata card, not dumped as text |
| Task lists | Interactive checkboxes |
| HTML in markdown | Passed through, then sanitized with DOMPurify |

Currency (`$30`), inline code, and fenced blocks are protected from the math and
footnote passes, so `` `$x^2$` `` stays literal.

## Reading experience

- **Table of contents** in the left rail with scroll-spy, plus reading progress.
- **Heading anchors** — hover a heading for a `#` permalink.
- **Copy button** on every code block.
- Light / dark / auto theme, four reading widths, adjustable size and leading.
- Word count and reading time.
- Print stylesheet: chrome stripped, blocks kept off page breaks.

### Keyboard

| Key | Action |
| --- | --- |
| `Alt+M` | Toggle raw ⇄ enriched (works even before the viewer loads) |
| `R` | Same toggle, once rendered |
| `T` | Show/hide contents |
| `D` | Toggle dark mode |

## Typefaces

Five bundled options, switchable from the toolbar or the popup. All are variable
woff2, latin subset, ~50 KB each.

| Theme | Body | Headings | Best for |
| --- | --- | --- | --- |
| **Modern** | Inter | Inter | READMEs, specs, anything screen-first |
| **Editorial** | Source Serif 4 | Inter | Long prose with a sans counterpoint |
| **Book** | Literata | Literata | Extended reading; warm, high x-height |
| **Technical** | IBM Plex Sans | IBM Plex Sans | Documentation, RFCs, API notes |
| **System** | OS default | OS default | Zero font loading, native feel |

Code is always JetBrains Mono (system mono under the *System* theme).

## How it works

```
detect.js       runs on every page, ~1 KB; bails unless the document is a
                single <pre> with a markdown content type or extension
     │
     ├─ asks →  background.js  (service worker)
     │              insertCSS  styles + KaTeX css
     │              executeScript  marked, DOMPurify, highlight.js, KaTeX, viewer.js
     │
viewer.js       preprocess (front matter, code guard, footnotes, math)
                → marked → DOMPurify → DOM enhancement → KaTeX → Mermaid
```

Heavy libraries are only injected into pages that actually are markdown, so
normal browsing pays for nothing but the probe. Stylesheets go in via
`chrome.scripting.insertCSS` rather than a `<link>` tag, so a restrictive page
CSP (`raw.githubusercontent.com` sends `default-src 'none'`) can't strip them.

The original source is kept in a hidden `<pre>` and swapped in for raw view — no
re-fetch, no re-parse.

## Development

```bash
node test/preprocess.test.mjs          # text-transform sanity checks

python3 -m http.server 8731            # visual QA without installing
open http://localhost:8731/test/preview.html        # full document render
open http://localhost:8731/test/popup-preview.html  # settings popup
```

The preview pages run the real `src/viewer.js` and `popup/popup.js` against a
stubbed `chrome.*` API (`test/shim.js`), so what you see is what the extension
does. `test/kitchen-sink.md` exercises every supported construct.

## Layout

```
manifest.json
src/detect.js       markdown probe (content script, all URLs)
src/background.js   service worker: injection + toggle command
src/viewer.js       parsing, enhancement, toolbar, TOC
styles/viewer.css   themes, typography, components, print
styles/fonts.css    @font-face + the five typeface themes
popup/              settings UI
vendor/             marked, DOMPurify, highlight.js, KaTeX (+fonts), Mermaid
fonts/              Inter, Source Serif 4, Literata, IBM Plex Sans, JetBrains Mono
test/               fixture, preview harnesses, preprocessing tests
```

## Known limits

- Chrome must be willing to *display* the file rather than download it. It does
  this for `.md`, `.markdown`, `.mdx`, `.qmd`, `.rmd` and friends.
- Pages with a strict CSP may block the bundled webfonts; the viewer falls back
  to system fonts and everything else still works.
- Mermaid diagrams re-render on theme change, which is briefly visible on very
  diagram-heavy documents.
