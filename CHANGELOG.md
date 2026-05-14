# Changelog

## 1.1.0 (2026-05-15)

### New
- **Vector mode** (`--mode vector`): export decks as vector PDFs with selectable text and crisp graphics at any zoom. Great for code-heavy or text-heavy slides where you want copy-paste and full-text search.
- **Viewport-aware capture**: slides render at their natural pixel dimensions instead of being squeezed into a fixed page size.

### Improvements
- `--scale` actually changes output resolution now.
- Better recovery from blank captures (retries use progressively longer waits).
- Per-slide background colors carry through to PDF padding.
- Clear error when vector mode meets reveal.js / Slidev / Marp / impress.js decks, pointing you to `--mode raster` instead of silently writing an empty PDF.
- `--mode` rejects invalid values instead of silently falling back.

### Reliability
- All browser pages close cleanly even when a capture step fails.
- 8 new end-to-end tests covering capture modes and CLI flags.

## 1.0.x

Initial release. Convert HTML slide decks (reveal.js, Slidev, Marp, impress.js, Quarto, custom) to PDF.
