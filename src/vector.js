import { PDFDocument } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { openPage } from './browser.js';
import { discoverSlides } from './capture.js';

/**
 * Vector (lossless) export: for each slide, resize the Chromium print surface
 * to the slide's natural dimensions and use page.pdf() so text stays as text
 * and SVG stays as SVG. Each per-slide PDF is then merged with pdf-lib.
 */
export async function convertToVectorPDF(browser, options) {
  const { input, output, selector, waitMs, viewport, bgColor, onProgress } = options;

  // One page for discovery + capture (faster than reopening per slide).
  const page = await openPage(browser, input, viewport);
  await page.emulateMediaType('screen');

  const slides = await discoverSlides(page, selector);
  const slideCount = slides.length;

  await page.evaluate(
    (bg, sel) => {
      document.documentElement.style.setProperty('scroll-snap-type', 'none', 'important');
      document.body.style.background = bg || '';
      document.querySelectorAll('nav.dots, #dots, .slide-dots, .progress-dots, [data-progress-dots], .footer-hint, .keyboard-hint, .scroll-hint, [data-nav-hint], .reveal .controls, .reveal .progress').forEach((el) => el.style.setProperty('display', 'none', 'important'));
      // Pin slide min-height to actual viewport pixels. page.pdf() temporarily
      // resizes the viewport, which can pollute vh units for subsequent measurements.
      const vh = window.innerHeight;
      document.querySelectorAll(sel).forEach((s) => {
        s.style.setProperty('min-height', vh + 'px', 'important');
      });
    },
    bgColor || '',
    selector,
  );

  const merged = await PDFDocument.create();

  for (let i = 0; i < slideCount; i++) {
    await page.evaluate(
      (idx, sel) => {
        const slides = document.querySelectorAll(sel);
        slides.forEach((s, j) => {
          if (j === idx) {
            s.style.setProperty('display', '', 'important');
          } else {
            s.style.setProperty('display', 'none', 'important');
          }
        });
      },
      i,
      selector,
    );

    await new Promise((r) => setTimeout(r, waitMs));

    // Measure target slide: its own box + any descendant that overflows past it
    // (e.g. SVG diagrams sized by aspect ratio that Chromium reports correctly in
    // rect.bottom but not in scrollHeight when the slide is a flex child).
    const dims = await page.evaluate((idx, sel) => {
      const target = document.querySelectorAll(sel)[idx];
      const rect = target.getBoundingClientRect();
      let maxBottom = rect.bottom;
      target.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > maxBottom) maxBottom = r.bottom;
      });
      const height = Math.max(rect.height, maxBottom - rect.top);
      return {
        width: window.innerWidth,
        height: Math.max(height, window.innerHeight),
      };
    }, i, selector);

    const pdfBytes = await page.pdf({
      width: `${dims.width}px`,
      height: `${dims.height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });

    const sub = await PDFDocument.load(pdfBytes);
    // Copy only the first page — if Chromium still paginated, the remainder is discarded.
    const [copied] = await merged.copyPages(sub, [0]);
    merged.addPage(copied);

    if (onProgress) onProgress(i + 1, slideCount, i);
  }

  await page.close();

  const bytes = await merged.save();
  await writeFile(output, bytes);
  return { slideCount, pdfSize: bytes.length };
}
