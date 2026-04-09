/**
 * Capture strategy for reveal.js presentations.
 * Uses Reveal.next() to walk through every step (including fragments).
 * Deduplicates by comparing slide indices to avoid capturing the same visual twice
 * when fragments don't change enough.
 */

export async function captureRevealSlides(page, options) {
  const { quality, onProgress } = options;

  // Wait for Reveal to be ready
  await page.waitForFunction(() => typeof Reveal !== 'undefined' && Reveal.isReady(), {
    timeout: 10000,
  });

  // Setup: disable ALL transitions (content + background), hide UI
  await page.evaluate(() => {
    Reveal.configure({
      transition: 'none',
      backgroundTransition: 'none',
      transitionSpeed: 'fastest',
    });
    Reveal.slide(0, 0, 0);
    document.querySelectorAll('.controls, .progress, .slide-number').forEach(
      (el) => (el.style.display = 'none'),
    );
    // Speed up all transitions/animations instead of killing them
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        transition-duration: 0.01s !important;
        animation-duration: 0.01s !important;
        transition-delay: 0s !important;
        animation-delay: 0s !important;
      }
    `;
    document.head.appendChild(style);
  });

  await new Promise((r) => setTimeout(r, 300));

  // Count total steps by walking through
  const totalSteps = await page.evaluate(() => {
    Reveal.slide(0, 0, 0);
    let count = 1;
    while (count < 200) {
      const before = JSON.stringify(Reveal.getIndices());
      Reveal.next();
      const after = JSON.stringify(Reveal.getIndices());
      if (before === after) break;
      count++;
    }
    Reveal.slide(0, 0, 0);
    return count;
  });

  await new Promise((r) => setTimeout(r, 300));

  const results = [];

  // Capture each step
  for (let step = 0; step < totalSteps; step++) {
    if (step > 0) {
      await page.evaluate(() => Reveal.next());
      // Wait for sped-up animations to complete
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
      const bg = getComputedStyle(document.querySelector('.reveal')).backgroundColor;
      const match = bg.match(/\d+/g);
      if (match) {
        return '#' + match.slice(0, 3).map((c) => parseInt(c).toString(16).padStart(2, '0')).join('');
      }
      return '#000000';
    });

    results.push({
      buffer: screenshotBuffer,
      width: viewport.width,
      height: viewport.height,
      index: step,
      blank: screenshotBuffer.length < 5000,
      slideBg,
    });

    if (onProgress) onProgress(step + 1, totalSteps, step);
  }

  return results;
}
