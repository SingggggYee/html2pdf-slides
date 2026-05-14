import { launchBrowser, withPage } from './browser.js';
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
    viewport: rawViewport = { width: 1920, height: 1080 },
    mode = 'raster',
    onProgress,
  } = options;

  const viewport = { ...rawViewport, deviceScaleFactor: scale };

  if (mode !== 'raster' && mode !== 'vector') {
    throw new Error(`Invalid mode: "${mode}". Expected "raster" or "vector".`);
  }

  const browser = await launchBrowser(headless);

  if (mode === 'vector') {
    try {
      if (!userSelector) {
        const detection = await withPage(browser, input, viewport, (page) => detectFramework(page));

        const VECTOR_UNSUPPORTED = new Set(['revealjs', 'slidev', 'marp', 'impressjs']);
        if (VECTOR_UNSUPPORTED.has(detection.framework)) {
          throw new Error(
            `Vector mode does not yet support ${detection.framework} decks (use --mode raster, or pass --selector to override). Framework-aware vector capture is planned for 1.2.0.`,
          );
        }
      }

      let resolvedBg = bgColor;
      if (!bgColor || bgColor === 'auto') {
        resolvedBg = await withPage(browser, input, viewport, (page) =>
          page.evaluate(() => getComputedStyle(document.body).backgroundColor || '#ffffff'),
        );
      }
      const result = await convertToVectorPDF(browser, {
        input,
        output,
        selector: userSelector || '.slide',
        activeClass,
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
    const detection = await withPage(browser, input, viewport, (page) => detectFramework(page));

    let images;
    let slideCount;
    let resolvedBg = bgColor;

    if (detection.framework === 'revealjs') {
      images = await withPage(browser, input, viewport, (page) =>
        captureRevealSlides(page, { quality, onProgress }),
      );
      slideCount = images.length;
    } else if (detection.framework === 'slidev') {
      images = await withPage(browser, input, viewport, (page) =>
        captureSlidevSlides(page, input, { quality, onProgress }),
      );
      slideCount = images.length;
    } else if (detection.framework === 'impressjs') {
      images = await withPage(browser, input, viewport, (page) =>
        captureImpressSlides(page, { quality, onProgress }),
      );
      slideCount = images.length;
    } else if (detection.framework === 'marp') {
      images = await withPage(browser, input, viewport, (page) =>
        captureMarpSlides(page, { quality, onProgress }),
      );
      slideCount = images.length;
    } else {
      const selector = userSelector || (detection.framework === 'generic' ? '.slide' : null);
      let usedGeneric = false;

      if (selector) {
        const slides = await withPage(browser, input, viewport, (page) =>
          discoverSlides(page, selector),
        );

        if (slides.length > 0) {
          usedGeneric = true;
          slideCount = slides.length;

          let bg = bgColor;
          if (!bgColor || bgColor === 'auto') {
            bg = await withPage(browser, input, viewport, (page) =>
              page.evaluate(() => getComputedStyle(document.body).backgroundColor || '#ffffff'),
            );
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
        detection.framework = 'keyboard';
        images = await withPage(browser, input, viewport, (page) =>
          captureKeyboardSlides(page, { quality, onProgress }),
        );
        slideCount = images.length;
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
