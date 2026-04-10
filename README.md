# html2pdf-slides

Convert HTML slide presentations to high-fidelity PDF files. The fastest way to export reveal.js, Slidev, Marp, impress.js, and Quarto presentations as PDF, with animations, fragments, dark themes, and click-reveal content fully preserved.

![demo](demo.gif)

A modern, framework-aware HTML to PDF converter for slide decks. Works with **reveal.js**, **Slidev**, **Marp**, **impress.js**, **Quarto**, **Shower**, **custom HTML slides**, and any HTML presentation that uses arrow-key navigation. Built on Puppeteer for pixel-perfect screenshot capture.

## Quick Start

```bash
# Install globally
npm install -g html2pdf-slides

# Or use without installing
npx html2pdf-slides https://revealjs.com/demo/ -o slides.pdf
```

```bash
# Local file
html2pdf-slides presentation.html -o output.pdf

# Online reveal.js presentation
html2pdf-slides https://revealjs.com/demo/ -o revealjs-demo.pdf

# Slidev deck (from deployed URL, no source code needed)
html2pdf-slides https://your-slidev-deck.netlify.app/ -o deck.pdf

# Marp presentation
html2pdf-slides https://yhatt.github.io/marp-cli-example/ -o marp.pdf
```

## Why html2pdf-slides?

Most HTML to PDF tools treat your presentation like a static webpage. They miss animations, break dark themes, and collapse slide layouts. Generic HTML to PDF converters such as wkhtmltopdf, Puppeteer's `page.pdf()`, or browser print dialogs were never designed for slide decks.

**html2pdf-slides** uses framework-native APIs to navigate through every slide and fragment state, captures pixel-perfect screenshots, and assembles them into a clean PDF with correct dimensions and background colors. It is the easiest way to export presentation slides as PDF without losing visual fidelity.

### Common use cases

- Export reveal.js presentation to PDF for distribution or printing
- Convert Slidev deck to PDF without rebuilding from source
- Save Marp slides as PDF preserving themes and code highlighting
- Archive impress.js presentations as a static PDF document
- Generate PDF handouts from Quarto reveal.js slides
- Batch convert HTML slide decks to PDF in CI/CD pipelines
- Capture deployed presentations from any URL, no local source needed

## Supported Frameworks

| Framework | How it captures |
|-----------|----------------|
| [reveal.js](https://revealjs.com/) | Uses `Reveal.next()` to walk all slides, vertical slides, and fragment steps |
| [Slidev](https://sli.dev/) | URL-based navigation with full v-click content reveal (all 8 hidden states) |
| [Marp](https://marp.app/) | Hash navigation via bespoke.js |
| [impress.js](https://impress.js.org/) | `impress().goto()` API for 3D-transformed steps |
| [Quarto](https://quarto.org/) reveal.js | Waits for async Reveal.js initialization, then uses Reveal API |
| Custom HTML (`.slide` class) | html2canvas capture, auto-discovers all `.slide` elements |
| [Shower](https://shwr.me/) | Same as above, detected via `.slide` class |
| Any other HTML slides | Keyboard fallback (ArrowRight, Space, PageDown) with screenshot deduplication |

## Comparison

| | html2pdf-slides | [DeckTape](https://github.com/astefanutti/decktape) | Browser Print | Native export |
|---|---|---|---|---|
| Setup | Auto-detect, zero config | Needs `--plugins` flag | Manual | Needs source code |
| Dark themes | Preserved | Preserved | Stripped to white | Varies |
| Fragments | Every state | Every state | Final state only | Varies |
| Slidev v-click | All 8 states | Partial | No | Yes |
| Slide backgrounds | Per-slide sampling | Single color | White | Varies |
| Quarto support | Yes (async wait) | May fail | No | N/A |
| Fallback for unknowns | Multi-key + dedup | Single method | N/A | N/A |

**Native export** refers to built-in tools like reveal.js `?print-pdf`, `slidev export`, or `marp-cli`. These require project source code and local dev setup. html2pdf-slides works from any deployed URL.

## How It Works

1. **Detect** the slide framework from DOM markers
2. **Navigate** using framework-native APIs (not generic scrolling)
3. **Capture** pixel-perfect screenshots at original viewport size
4. **Assemble** into PDF with per-slide background colors and 16:9 minimum page dimensions

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <path>` | Output PDF path | same as input |
| `-s, --selector <css>` | CSS selector for slides | `.slide` |
| `-b, --bg-color <hex>` | Background color | `#0a0a0a` |
| `--scale <n>` | Resolution multiplier | `1.5` |
| `--quality <n>` | JPEG quality (1-100) | `88` |
| `--page-width <pts>` | PDF page width | `842` |
| `--parallel <n>` | Parallel browser tabs | `2` |
| `--wait <ms>` | Wait before capture | `300` |
| `--retry <n>` | Retry for blank slides | `2` |
| `--no-headless` | Show browser window | |

## Programmatic API

```javascript
import { convertToPDF } from 'html2pdf-slides';

const result = await convertToPDF({
  input: 'https://revealjs.com/demo/',
  output: 'slides.pdf',
  quality: 90,
  onProgress: (current, total) => {
    console.log(`Capturing slide ${current}/${total}`);
  },
});

// result: { slideCount, blankCount, pdfSize, outputPath, framework }
```

## FAQ

### How do I convert reveal.js slides to PDF?

```bash
html2pdf-slides https://your-reveal-presentation.com -o output.pdf
```

Automatically detects reveal.js and uses the Reveal API to navigate through all slides and fragments. Preserves your theme, animation final states, and dark backgrounds.

### How do I convert Slidev presentations to PDF?

```bash
html2pdf-slides https://your-slidev-deck.netlify.app -o output.pdf
```

Converts any deployed Slidev presentation directly from its URL. No source code needed. Fully handles v-click content visibility.

### Can I convert any HTML presentation to PDF?

Yes. For unrecognized frameworks, it falls back to keyboard navigation with screenshot deduplication to detect when all slides have been captured.

### Why are some slides blank in the output?

Try increasing the wait time for slides that rely on lazy loading:

```bash
html2pdf-slides presentation.html --wait 1000 -o output.pdf
```

### How is html2pdf-slides different from DeckTape?

DeckTape is the long-standing tool for this task but requires manual `--plugins` flags per framework, lacks Quarto async support, and only captures partial Slidev v-click states. html2pdf-slides auto-detects the framework, handles all 8 Slidev v-click hidden states, supports Quarto's async Reveal initialization, and ships a multi-key keyboard fallback for unknown frameworks.

### Can I use html2pdf-slides as a library in my Node.js project?

Yes. Install as a dependency and import `convertToPDF` from the package. See the Programmatic API section above for an example. Useful for generating PDF handouts inside CI/CD pipelines or build scripts.

### Does html2pdf-slides work with Marp slides?

Yes. It detects Marp's bespoke.js runtime and navigates via hash-based URL changes. Both `marp-cli` HTML output and Marp for VS Code exports are supported.

### How do I export a Quarto reveal.js presentation to PDF?

Pass the deployed Quarto site URL directly. html2pdf-slides waits for Quarto's async Reveal.js initialization (which DeckTape often misses), then captures every slide.

```bash
html2pdf-slides https://your-quarto-site.com/slides.html -o quarto.pdf
```

## Requirements

- Node.js 18 or later
- Chromium is downloaded automatically by Puppeteer on first run

## License

MIT
