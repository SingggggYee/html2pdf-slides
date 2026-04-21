import { launchBrowser, openPage } from './browser.js';
import { detectFramework } from './detect.js';
import { discoverSlides } from './capture.js';
import { captureAll } from './parallel.js';
import { captureRevealSlides } from './capture-revealjs.js';
import { captureKeyboardSlides } from './capture-keyboard.js';
import { captureSlidevSlides } from './capture-slidev.js';
import { captureImpressSlides } from './capture-impressjs.js';
import { captureMarpSlides } from './capture-marp.js';
import { buildPDF } from './assembler.js';
import { convertToVectorPDF } from './vector.js';

export async function convertToPDF(options) {
  const {
    input,
    output,
    selector: userSelector,
    activeClass = 'active',
    bgColor = '#0a0a0a',
    scale = 1.5,
    quality = 88,
    pageWidth = 842,
    parallel = 2,
    waitMs = 300,
    retry = 2,
    headless = true,
    viewport = { width: 1920, height: 1080 },
    mode = 'raster',
    onProgress,
  } = options;

  const browser = await launchBrowser(headless);

  if (mode === 'vector') {
    try {
      let resolvedBg = bgColor;
      if (!bgColor || bgColor === 'auto') {
        const bgPage = await openPage(browser, input, viewport);
        resolvedBg = await bgPage.evaluate(() => getComputedStyle(document.body).backgroundColor || '#ffffff');
        await bgPage.close();
      }
      const result = await convertToVectorPDF(browser, {
        input,
        output,
        selector: userSelector || '.slide',
        waitMs,
        viewport,
        bgColor: resolvedBg,
        onProgress,
      });
      return {
        slideCount: result.slideCount,
        blankCount: 0,
        pdfSize: result.pdfSize,
        outputPath: output,
        framework: 'vector',
      };
    } finally {
      await browser.close();
    }
  }

  try {
    // Auto-detect framework
    const detectPage = await openPage(browser, input, viewport);
    const detection = await detectFramework(detectPage);
    await detectPage.close();

    let images;
    let slideCount;
    let resolvedBg = bgColor;

    if (detection.framework === 'revealjs') {
      // reveal.js: use Reveal API navigation + page.screenshot()
      const page = await openPage(browser, input, viewport);
      images = await captureRevealSlides(page, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else if (detection.framework === 'slidev') {
      // Slidev: navigate via URL /1, /2, ...
      const page = await openPage(browser, input, viewport);
      images = await captureSlidevSlides(page, input, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else if (detection.framework === 'impressjs') {
      // impress.js: use impress().goto() API navigation
      const page = await openPage(browser, input, viewport);
      images = await captureImpressSlides(page, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else if (detection.framework === 'marp') {
      // Marp: navigate via hash-based routing
      const page = await openPage(browser, input, viewport);
      images = await captureMarpSlides(page, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else {
      // Try generic html2canvas capture first, fallback to keyboard
      const selector = userSelector || (detection.framework === 'generic' ? '.slide' : null);
      let usedGeneric = false;

      if (selector) {
        const discoveryPage = await openPage(browser, input);
        const slides = await discoverSlides(discoveryPage, selector);
        await discoveryPage.close();

        if (slides.length > 0) {
          usedGeneric = true;
          slideCount = slides.length;

          let bg = bgColor;
          if (!bgColor || bgColor === 'auto') {
            const bgPage = await openPage(browser, input, viewport);
            bg = await bgPage.evaluate(() => {
              return getComputedStyle(document.body).backgroundColor || '#ffffff';
            });
            await bgPage.close();
          }
          resolvedBg = bg;

          images = await captureAll(browser, input, slides.length, {
            selector,
            activeClass,
            bgColor: bg,
            scale,
            quality,
            waitMs,
            parallel,
            retry,
            viewport,
            onProgress,
          });
        }
      }

      if (!usedGeneric) {
        // Fallback: keyboard navigation + screenshot
        detection.framework = 'keyboard';
        const page = await openPage(browser, input, viewport);
        images = await captureKeyboardSlides(page, { quality, onProgress });
        slideCount = images.length;
        await page.close();
      }
    }

    // Check for blank slides
    const blankSlides = images.filter((img) => img.blank);
    if (blankSlides.length > 0) {
      const indices = blankSlides.map((s) => s.index + 1).join(', ');
      console.warn(`Warning: ${blankSlides.length} slide(s) may be blank: ${indices}`);
    }

    // Build PDF
    const pdfSize = await buildPDF(images, output, pageWidth, resolvedBg, viewport);

    return {
      slideCount,
      blankCount: blankSlides.length,
      pdfSize,
      outputPath: output,
      framework: detection.framework,
    };
  } finally {
    await browser.close();
  }
}
