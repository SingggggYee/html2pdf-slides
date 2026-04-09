/**
 * Capture strategy for Slidev presentations.
 * Navigates via URL (/1, /2, ...) for clean per-slide capture.
 */

export async function captureSlidevSlides(page, baseUrl, options) {
  const { quality, onProgress } = options;

  // Detect total pages from DOM
  const totalPages = await page.evaluate(() => {
    const allPages = document.querySelectorAll('[class*="slidev-page-"]');
    const pageNums = new Set();
    allPages.forEach((el) => {
      const match = el.className.match(/slidev-page-(\d+)/);
      if (match) pageNums.add(parseInt(match[1]));
    });
    return Math.max(...pageNums);
  });

  if (!totalPages || totalPages < 1) {
    throw new Error('Could not detect Slidev slide count');
  }

  // Hide UI elements
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'pdf-capture-style';
    style.textContent = `
      .slidev-nav, .slidev-icon-btn, [class*="slidev-nav"],
      .slidev-controls, #page-nav, .slidev-progress {
        display: none !important;
      }
      *, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        animation-delay: 0s !important;
      }
    `;
    document.head.appendChild(style);
  });

  const results = [];
  const normalizedBase = baseUrl.replace(/\/\d+$/, '').replace(/\/$/, '');

  for (let i = 1; i <= totalPages; i++) {
    // Navigate to slide by URL
    await page.goto(`${normalizedBase}/${i}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Re-inject hide styles and reveal all v-click content
    await page.evaluate(() => {
      // Inject comprehensive override stylesheet that neutralizes ALL v-click hiding
      let overrideStyle = document.getElementById('pdf-capture-style');
      if (!overrideStyle) {
        overrideStyle = document.createElement('style');
        overrideStyle.id = 'pdf-capture-style';
        document.head.appendChild(overrideStyle);
      }
      overrideStyle.textContent = `
        /* Hide Slidev UI chrome */
        .slidev-nav, .slidev-icon-btn, [class*="slidev-nav"],
        .slidev-controls, #page-nav, .slidev-progress {
          display: none !important;
        }
        /* Kill all transitions/animations so content appears instantly */
        *, *::before, *::after {
          transition-duration: 0s !important;
          animation-duration: 0s !important;
          transition-delay: 0s !important;
          animation-delay: 0s !important;
        }
        /* Override the core v-click hidden class (opacity: 0 !important) */
        .slidev-vclick-hidden {
          opacity: 1 !important;
          pointer-events: auto !important;
          user-select: auto !important;
          translate: none !important;
          scale: none !important;
        }
        /* Override display:none used by some v-click modes */
        .slidev-vclick-display-none {
          display: block !important;
        }
        /* Override the "gone" hidden state */
        .slidev-vclick-gone {
          opacity: 1 !important;
          pointer-events: auto !important;
          display: block !important;
        }
        /* Override explicitly hidden elements */
        .slidev-vclick-hidden-explicitly {
          opacity: 1 !important;
          pointer-events: auto !important;
          display: block !important;
        }
        /* Override fade effect on non-current items */
        .slidev-vclick-fade {
          opacity: 1 !important;
        }
        /* Ensure all v-click targets are fully visible regardless of anim class */
        .slidev-vclick-target {
          opacity: 1 !important;
          pointer-events: auto !important;
          user-select: auto !important;
          translate: none !important;
          scale: none !important;
          visibility: visible !important;
        }
        /* Catch any animation-specific hidden states (fade, up, down, left, right, scale) */
        [class*="slidev-vclick-anim-"] {
          opacity: 1 !important;
          translate: none !important;
          scale: none !important;
        }
      `;

      // Also do DOM-level class cleanup for elements that may have inline styles
      // or framework-driven reactivity that re-applies classes
      const hiddenClasses = [
        'slidev-vclick-hidden',
        'slidev-vclick-display-none',
        'slidev-vclick-gone',
        'slidev-vclick-hidden-explicitly',
        'slidev-vclick-fade',
      ];
      document.querySelectorAll('.slidev-vclick-target, [class*="slidev-vclick"]').forEach((el) => {
        hiddenClasses.forEach((cls) => el.classList.remove(cls));
        el.classList.add('slidev-vclick-prior');
        // Clear any inline styles that may override our CSS
        el.style.opacity = '';
        el.style.visibility = '';
        el.style.display = '';
        el.style.pointerEvents = '';
        el.style.translate = '';
        el.style.scale = '';
      });
    });

    await new Promise((r) => setTimeout(r, 1000));

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
      const el = document.querySelector('.slidev-layout') || document.body;
      const bg = getComputedStyle(el).backgroundColor;
      const match = bg.match(/\d+/g);
      if (match && match.length >= 3) {
        return '#' + match.slice(0, 3).map((c) => parseInt(c).toString(16).padStart(2, '0')).join('');
      }
      return '#ffffff';
    });

    results.push({
      buffer: screenshotBuffer,
      width: viewport.width,
      height: viewport.height,
      index: i - 1,
      blank: screenshotBuffer.length < 5000,
      slideBg,
    });

    if (onProgress) onProgress(i, totalPages, i - 1);
  }

  return results;
}
