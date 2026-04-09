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
    onProgress,
  } = options;

  const browser = await launchBrowser(headless);

  try {
    // Auto-detect framework
    const detectPage = await openPage(browser, input);
    const detection = await detectFramework(detectPage);
    await detectPage.close();

    let images;
    let slideCount;

    if (detection.framework === 'revealjs') {
      // reveal.js: use Reveal API navigation + page.screenshot()
      const page = await openPage(browser, input);
      images = await captureRevealSlides(page, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else if (detection.framework === 'slidev') {
      // Slidev: navigate via URL /1, /2, ...
      const page = await openPage(browser, input);
      images = await captureSlidevSlides(page, input, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else if (detection.framework === 'impressjs') {
      // impress.js: use impress().goto() API navigation
      const page = await openPage(browser, input);
      images = await captureImpressSlides(page, { quality, onProgress });
      slideCount = images.length;
      await page.close();
    } else if (detection.framework === 'marp') {
      // Marp: navigate via hash-based routing
      const page = await openPage(browser, input);
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
            const bgPage = await openPage(browser, input);
            bg = await bgPage.evaluate(() => {
              return getComputedStyle(document.body).backgroundColor || '#ffffff';
            });
            await bgPage.close();
          }

          images = await captureAll(browser, input, slides.length, {
            selector,
            activeClass,
            bgColor: bg,
            scale,
            quality,
            waitMs,
            parallel,
            retry,
            onProgress,
          });
        }
      }

      if (!usedGeneric) {
        // Fallback: keyboard navigation + screenshot
        detection.framework = 'keyboard';
        const page = await openPage(browser, input);
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
    const pdfSize = await buildPDF(images, output, pageWidth);

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
