/**
 * Capture strategy for impress.js presentations.
 * Uses impress().goto(stepIndex) to navigate each step.
 * Screenshots each step and samples background color.
 */

export async function captureImpressSlides(page, options) {
  const { quality, onProgress } = options;

  // Wait for impress.js to be initialized
  await page.waitForFunction(
    () => typeof impress === 'function' && document.body.classList.contains('impress-enabled'),
    { timeout: 10000 },
  );

  // Hide UI elements and disable transitions
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide impress.js UI overlays */
      .impress-progressbar, .impress-progress,
      .hint, #hovercraft-help, .impress-help,
      #impress-help, #impress-toolbar,
      .impress-navigation-ui {
        display: none !important;
        opacity: 0 !important;
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

  // Get total step count
  const totalSteps = await page.evaluate(() => {
    return document.querySelectorAll('#impress .step').length;
  });

  if (!totalSteps || totalSteps < 1) {
    throw new Error('Could not detect impress.js step count');
  }

  // Navigate to first step
  await page.evaluate(() => impress().goto(0));
  await new Promise((r) => setTimeout(r, 500));

  const results = [];

  for (let i = 0; i < totalSteps; i++) {
    if (i > 0) {
      await page.evaluate((idx) => impress().goto(idx), i);
      // Wait for transition to settle
      await new Promise((r) => setTimeout(r, 600));
    }

    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: quality || 88,
      fullPage: false,
    });

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    const slideBg = await page.evaluate(() => {
      // Try the active step first, then #impress, then body
      const activeStep = document.querySelector('.step.active') || document.querySelector('.active');
      const container = document.querySelector('#impress') || document.body;
      const el = activeStep || container;
      const bg = getComputedStyle(el).backgroundColor;
      const match = bg.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]);
        const g = parseInt(match[1]);
        const b = parseInt(match[2]);
        // If transparent (all zeros with alpha 0), fall back to body
        if (r === 0 && g === 0 && b === 0 && el !== document.body) {
          const bodyBg = getComputedStyle(document.body).backgroundColor;
          const bodyMatch = bodyBg.match(/\d+/g);
          if (bodyMatch && bodyMatch.length >= 3) {
            return '#' + bodyMatch.slice(0, 3).map((c) => parseInt(c).toString(16).padStart(2, '0')).join('');
          }
        }
        return '#' + match.slice(0, 3).map((c) => parseInt(c).toString(16).padStart(2, '0')).join('');
      }
      return '#000000';
    });

    results.push({
      buffer: screenshotBuffer,
      width: viewport.width,
      height: viewport.height,
      index: i,
      blank: screenshotBuffer.length < 5000,
      slideBg,
    });

    if (onProgress) onProgress(i + 1, totalSteps, i);
  }

  return results;
}
