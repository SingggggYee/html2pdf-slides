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
  const { selector, activeClass, bgColor, scale, quality, waitMs } = options;

  const result = await page.evaluate(
    async (idx, sel, activeCls, bg, sc, qual, wait) => {
      const slides = document.querySelectorAll(sel);

      // Hide all slides
      slides.forEach((s) => {
        s.classList.remove(activeCls);
        s.style.display = 'none';
      });

      const target = slides[idx];
      target.classList.add(activeCls);
      target.style.display = '';

      // Remember original height before any changes
      const originalHeight = target.clientHeight;
      const originalScrollHeight = target.scrollHeight;
      const hasOverflow = originalScrollHeight > originalHeight + 50;

      // Only expand if content overflows — otherwise keep viewport size
      target.style.overflow = 'visible';
      target.style.maxHeight = 'none';
      target.style.position = 'relative';
      if (hasOverflow) {
        target.style.height = 'auto';
      }

      // Also expand parent if needed
      if (target.parentElement) {
        target.parentElement.style.overflow = 'visible';
        if (hasOverflow) {
          target.parentElement.style.height = 'auto';
        }
      }

      // Wait for reflow
      await new Promise((r) => setTimeout(r, wait));

      // Use the larger of original height and scroll height
      const fullHeight = Math.max(target.scrollHeight, originalHeight);

      // Capture with html2canvas
      const canvas = await html2canvas(target, {
        backgroundColor: bg,
        scale: sc,
        useCORS: true,
        height: fullHeight,
        windowHeight: fullHeight,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/jpeg', qual / 100);

      // Sample background color from bottom-left corner of the captured image
      const ctx = canvas.getContext('2d');
      const pixel = ctx.getImageData(5, canvas.height - 5, 1, 1).data;
      const slideBg = '#' + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('');

      // Restore
      target.style.cssText = '';
      if (target.parentElement) {
        target.parentElement.style.cssText = '';
      }

      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        index: idx,
        slideBg,
      };
    },
    slideIndex,
    selector,
    activeClass,
    bgColor,
    scale,
    quality,
    waitMs,
  );

  return result;
}

export function isBlankImage(dataUrl) {
  // Quick heuristic: very small base64 payload likely means blank
  const base64 = dataUrl.split(',')[1];
  if (!base64) return true;
  // A truly blank JPEG at 1920x1080 compresses to ~2-5KB
  // Real content is usually >20KB
  return base64.length < 5000;
}
