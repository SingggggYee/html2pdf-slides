/**
 * Capture strategy for Marp (bespoke template) presentations.
 * Marp renders slides as SVG elements (.bespoke-marp-slide) containing
 * <foreignObject> with <section> elements. Navigation is via bespoke.js
 * keyboard events or hash-based routing (#1, #2, ...).
 */

export async function captureMarpSlides(page, options) {
  const { quality, onProgress } = options;

  // Wait for bespoke-marp to be ready
  await page.waitForFunction(
    () =>
      document.querySelector('.bespoke-marp-parent') ||
      document.querySelector('[data-marpit-svg]') ||
      document.querySelector('svg.bespoke-marp-slide'),
    { timeout: 10000 },
  );

  // Hide UI elements (on-screen controls) and disable transitions
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'pdf-capture-style';
    style.textContent = `
      /* Hide Marp on-screen controls and navigation UI */
      [data-bespoke-marp-osc],
      .bespoke-marp-osc,
      .bespoke-progress,
      .bespoke-marp-presenter-container,
      [data-bespoke-marp-osc="prev"],
      [data-bespoke-marp-osc="next"],
      [data-bespoke-marp-osc="fullscreen"],
      [data-bespoke-marp-osc="presenter"],
      [data-bespoke-marp-osc="overview"] {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* Disable all transitions and animations */
      *, *::before, *::after {
        transition-duration: 0.01s !important;
        animation-duration: 0.01s !important;
        transition-delay: 0s !important;
        animation-delay: 0s !important;
      }
    `;
    document.head.appendChild(style);
  });

  // Get total slide count
  const totalSlides = await page.evaluate(() => {
    const slides = document.querySelectorAll('svg.bespoke-marp-slide, .bespoke-marp-slide');
    return slides.length;
  });

  if (!totalSlides || totalSlides < 1) {
    throw new Error('Could not detect Marp slide count');
  }

  // Navigate to slide 1 via hash
  await page.evaluate(() => {
    window.location.hash = '1';
  });
  await new Promise((r) => setTimeout(r, 500));

  const results = [];

  for (let i = 0; i < totalSlides; i++) {
    // Navigate via hash (1-indexed)
    await page.evaluate((slideNum) => {
      window.location.hash = String(slideNum);
    }, i + 1);

    // Wait for the slide to become active
    await page.waitForFunction(
      (idx) => {
        // Marp uses 0-indexed bespoke-marp-active class
        const slides = document.querySelectorAll('svg.bespoke-marp-slide, .bespoke-marp-slide');
        if (slides[idx]) {
          return slides[idx].classList.contains('bespoke-marp-active');
        }
        return false;
      },
      { timeout: 5000 },
      i,
    ).catch(() => {
      // If waiting for active class fails, fall back to a short delay
    });

    await new Promise((r) => setTimeout(r, 300));

    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: quality || 88,
      fullPage: false,
    });

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    const slideBg = await page.evaluate((idx) => {
      // Try the active slide's section, then the SVG container, then body
      const slides = document.querySelectorAll('svg.bespoke-marp-slide, .bespoke-marp-slide');
      const activeSlide = slides[idx];

      // Check section inside the SVG foreignObject
      const section = activeSlide
        ? activeSlide.querySelector('foreignObject section') || activeSlide.querySelector('section')
        : null;

      const candidates = [section, activeSlide, document.body].filter(Boolean);

      for (const el of candidates) {
        const bg = getComputedStyle(el).backgroundColor;
        const match = bg.match(/\d+/g);
        if (match && match.length >= 3) {
          const r = parseInt(match[0]);
          const g = parseInt(match[1]);
          const b = parseInt(match[2]);
          // Skip transparent (rgba with alpha 0)
          if (match.length >= 4 && parseInt(match[3]) === 0) continue;
          // Skip all-zero (likely transparent)
          if (r === 0 && g === 0 && b === 0 && el !== document.body) continue;
          return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
        }
      }
      return '#ffffff';
    }, i);

    results.push({
      buffer: screenshotBuffer,
      width: viewport.width,
      height: viewport.height,
      index: i,
      blank: screenshotBuffer.length < 5000,
      slideBg,
    });

    if (onProgress) onProgress(i + 1, totalSlides, i);
  }

  return results;
}
