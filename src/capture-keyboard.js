/**
 * Universal fallback capture strategy.
 * Works with any slide framework by pressing arrow keys to navigate.
 * Detects when slides stop changing by comparing screenshots.
 */

import crypto from 'node:crypto';

function bufferHash(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

export async function captureKeyboardSlides(page, options) {
  const { quality, onProgress } = options;

  // Hide common UI elements
  await page.evaluate(() => {
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

    // Try to hide common navigation/control elements
    document.querySelectorAll(
      '.controls, .progress, .slide-number, [class*="nav"], [class*="toolbar"]'
    ).forEach((el) => (el.style.display = 'none'));
  });

  // Initial detection delay — wait for frameworks to finish initializing
  await new Promise((r) => setTimeout(r, 1500));

  // Click center of page to ensure presentation has focus
  const vp = page.viewport();
  if (vp) {
    await page.mouse.click(Math.floor(vp.width / 2), Math.floor(vp.height / 2));
    await new Promise((r) => setTimeout(r, 300));
  }

  const results = [];
  const seenHashes = new Set();
  let consecutiveDups = 0;
  const MAX_SLIDES = 200;
  const MAX_CONSECUTIVE_DUPS = 5;
  const NAV_KEYS = ['ArrowRight', 'Space', 'PageDown', 'ArrowDown'];

  // Capture first slide
  let screenshotBuffer = await page.screenshot({
    type: 'jpeg',
    quality: quality || 88,
    fullPage: false,
  });

  let hash = bufferHash(screenshotBuffer);
  seenHashes.add(hash);

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  const slideBg = await sampleBg(page);

  results.push({
    buffer: screenshotBuffer,
    width: viewport.width,
    height: viewport.height,
    index: 0,
    blank: screenshotBuffer.length < 5000,
    slideBg,
  });

  if (onProgress) onProgress(1, '?', 0);

  // Navigate and capture until we loop or stop changing
  for (let step = 1; step < MAX_SLIDES; step++) {
    // Use longer wait for first few slides (frameworks/transitions may be slow)
    const waitTime = step <= 3 ? 1000 : 600;

    // Try ArrowRight first
    await page.keyboard.press('ArrowRight');
    await new Promise((r) => setTimeout(r, waitTime));

    screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: quality || 88,
      fullPage: false,
    });

    hash = bufferHash(screenshotBuffer);

    // If ArrowRight didn't change the slide, try alternative keys
    if (seenHashes.has(hash) && consecutiveDups === 0) {
      for (let ki = 1; ki < NAV_KEYS.length; ki++) {
        await page.keyboard.press(NAV_KEYS[ki]);
        await new Promise((r) => setTimeout(r, waitTime));

        screenshotBuffer = await page.screenshot({
          type: 'jpeg',
          quality: quality || 88,
          fullPage: false,
        });
        hash = bufferHash(screenshotBuffer);

        if (!seenHashes.has(hash)) break; // found a working key
      }
    }

    if (seenHashes.has(hash)) {
      consecutiveDups++;
      if (consecutiveDups >= MAX_CONSECUTIVE_DUPS) {
        // We've looped back or stuck — stop
        break;
      }
      // Skip this duplicate but keep trying
      continue;
    }

    consecutiveDups = 0;
    seenHashes.add(hash);

    const bg = await sampleBg(page);

    results.push({
      buffer: screenshotBuffer,
      width: viewport.width,
      height: viewport.height,
      index: results.length,
      blank: screenshotBuffer.length < 5000,
      slideBg: bg,
    });

    if (onProgress) onProgress(results.length, '?', step);
  }

  return results;
}

async function sampleBg(page) {
  return page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/\d+/g);
    if (match) {
      return '#' + match.slice(0, 3).map((c) => parseInt(c).toString(16).padStart(2, '0')).join('');
    }
    return '#000000';
  });
}
