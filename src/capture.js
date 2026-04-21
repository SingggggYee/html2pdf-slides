export async function discoverSlides(page, selector) {
  return page.evaluate((sel) => {
    const slides = document.querySelectorAll(sel);
    return Array.from(slides).map((slide, i) => ({
      index: i,
      scrollHeight: slide.scrollHeight,
      clientHeight: slide.clientHeight,
      hasOverflow: slide.scrollHeight > slide.clientHeight + 50,
    }));
  }, selector);
}

export async function captureSlide(page, slideIndex, options) {
  const { selector, activeClass, bgColor, quality, waitMs } = options;

  const baseViewport = page.viewport();
  const baseWidth = baseViewport.width;
  const baseHeight = baseViewport.height;
  const dpr = baseViewport.deviceScaleFactor || 1;

  // 1) Isolate slide with !important to resist re-enabling JS,
  //    neutralize scroll-snap, and measure natural content height.
  const contentHeight = await page.evaluate(
    (idx, sel, activeCls, bg) => {
      document.documentElement.style.setProperty('scroll-snap-type', 'none', 'important');
      document.body.style.background = bg;

      const slides = document.querySelectorAll(sel);
      slides.forEach((s, i) => {
        if (i === idx) {
          s.classList.add(activeCls);
          s.style.setProperty('display', '', 'important');
        } else {
          s.classList.remove(activeCls);
          s.style.setProperty('display', 'none', 'important');
        }
      });

      // Hide common progress indicators / nav chrome if present
      document.querySelectorAll('nav.dots, .slide-dots, .progress-dots, [data-progress-dots], #dots, .footer-hint, .keyboard-hint, .scroll-hint, [data-nav-hint], .reveal .controls, .reveal .progress').forEach((el) => el.style.setProperty('display', 'none', 'important'));

      const target = slides[idx];
      const origMin = target.style.minHeight;
      target.style.minHeight = '0';
      const h = target.scrollHeight;
      target.style.minHeight = origMin;
      return h;
    },
    slideIndex,
    selector,
    activeClass,
    bgColor,
  );

  const shotHeight = Math.max(baseHeight, contentHeight);

  // 2) Grow viewport so the whole slide lays out at natural size.
  await page.setViewport({ width: baseWidth, height: shotHeight, deviceScaleFactor: dpr });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, waitMs));

  // 3) Full-viewport screenshot — body only contains the target slide now.
  const raw = await page.screenshot({ type: 'jpeg', quality: quality || 92, fullPage: false });
  const buffer = Buffer.from(raw);

  // 4) Restore viewport.
  await page.setViewport({ width: baseWidth, height: baseHeight, deviceScaleFactor: dpr });

  return {
    dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
    width: baseWidth * dpr,
    height: shotHeight * dpr,
    index: slideIndex,
    slideBg: null,
  };
}

export function isBlankImage(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return true;
  return base64.length < 5000;
}
