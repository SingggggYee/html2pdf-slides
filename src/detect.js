/**
 * Detect slide framework synchronously (runs inside page context).
 */
function detectSync() {
  // reveal.js
  if (typeof Reveal !== 'undefined' || document.querySelector('.reveal .slides')) {
    const totalH = typeof Reveal !== 'undefined' && Reveal.getTotalSlides
      ? Reveal.getTotalSlides()
      : document.querySelectorAll('.reveal .slides > section').length;
    return { framework: 'revealjs', slideCount: totalH };
  }

  // Slidev
  if (document.querySelector('[class*="slidev-page-"]') || document.querySelector('.slidev-layout')) {
    const allPages = document.querySelectorAll('[class*="slidev-page-"]');
    const pageNums = new Set();
    allPages.forEach((el) => {
      const match = el.className.match(/slidev-page-(\d+)/);
      if (match) pageNums.add(parseInt(match[1]));
    });
    return { framework: 'slidev', slideCount: pageNums.size > 0 ? Math.max(...pageNums) : 0 };
  }

  // Marp (bespoke template)
  if (
    document.querySelector('.bespoke-marp-parent') ||
    document.querySelector('[data-marpit-svg]') ||
    document.querySelector('.marpit') ||
    document.querySelector('svg.bespoke-marp-slide')
  ) {
    const slides = document.querySelectorAll('svg.bespoke-marp-slide, .bespoke-marp-slide');
    return { framework: 'marp', slideCount: slides.length };
  }

  // impress.js
  if (document.querySelector('#impress .step')) {
    return { framework: 'impressjs', slideCount: document.querySelectorAll('#impress .step').length };
  }

  // Generic .slide class
  if (document.querySelectorAll('.slide').length > 0) {
    return { framework: 'generic', slideCount: document.querySelectorAll('.slide').length };
  }

  // Generic section-based (Slidev, etc.)
  if (document.querySelectorAll('section').length > 1) {
    return { framework: 'section', slideCount: document.querySelectorAll('section').length };
  }

  return { framework: 'unknown', slideCount: 0 };
}

/**
 * Check if page has markers indicating an async-loading framework (e.g. Quarto).
 * Returns a hint string if we should wait for a framework to initialize, or null.
 */
function hasAsyncFrameworkHints() {
  // Quarto reveal.js: needs both quarto markers AND reveal.js indicators
  const isQuarto = document.querySelector('meta[name="generator"][content*="quarto"]')
    || document.querySelector('.quarto-light')
    || document.querySelector('.quarto-dark');

  if (isQuarto) {
    // Only wait for Reveal if this looks like a reveal.js presentation
    // (has .reveal div, or reveal.js script, or reveal-specific classes)
    const hasRevealMarker = document.querySelector('.reveal')
      || document.querySelector('script[src*="reveal"]')
      || document.querySelector('link[href*="reveal"]')
      || document.querySelector('[data-revealjs]');
    if (hasRevealMarker) return 'quarto-revealjs';
  }

  // Generic reveal.js that hasn't initialized yet: has the reveal div but no Reveal global
  const revealDiv = document.querySelector('.reveal');
  if (revealDiv && typeof Reveal === 'undefined') return 'revealjs-pending';

  // Check for reveal.js script tags loading asynchronously
  const revealScript = document.querySelector('script[src*="reveal"]');
  if (revealScript && typeof Reveal === 'undefined') return 'revealjs-pending';

  return null;
}

/**
 * Auto-detect slide framework and return capture strategy.
 * Handles async-loading frameworks (e.g. Quarto reveal.js) by waiting for initialization.
 */
export async function detectFramework(page) {
  // First try: immediate detection
  let result = await page.evaluate(detectSync);

  if (result.framework !== 'unknown' && result.framework !== 'section') {
    return result;
  }

  // Check for async-loading framework hints
  const hint = await page.evaluate(hasAsyncFrameworkHints);

  if (hint === 'quarto-revealjs' || hint === 'revealjs-pending') {
    // Wait for Reveal.js to become available and initialize
    try {
      await page.waitForFunction(
        () => typeof Reveal !== 'undefined' && typeof Reveal.isReady === 'function' && Reveal.isReady(),
        { timeout: 8000 },
      );
    } catch {
      // Reveal.isReady may not exist in older versions; fall back to checking the global
      try {
        await page.waitForFunction(
          () => typeof Reveal !== 'undefined' && document.querySelector('.reveal .slides'),
          { timeout: 3000 },
        );
      } catch {
        // Give up waiting, return whatever we have
        return result;
      }
    }

    // Re-detect now that the framework has loaded
    result = await page.evaluate(detectSync);
    return result;
  }

  // For unknown/section results without async hints, do one short retry
  // in case any framework is still bootstrapping
  if (result.framework === 'unknown' || result.framework === 'section') {
    try {
      await page.waitForFunction(
        () => {
          return (
            typeof Reveal !== 'undefined' ||
            document.querySelector('.reveal .slides') ||
            document.querySelector('[class*="slidev-page-"]') ||
            document.querySelector('#impress .step') ||
            document.querySelector('.bespoke-marp-parent') ||
            document.querySelector('[data-marpit-svg]')
          );
        },
        { timeout: 3000 },
      );
      result = await page.evaluate(detectSync);
    } catch {
      // Timeout is fine — no async framework detected, keep original result
    }
  }

  return result;
}
