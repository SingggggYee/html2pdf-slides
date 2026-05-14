import { withPage } from './browser.js';
import { captureSlide, isBlankImage } from './capture.js';

export async function captureAll(browser, htmlPath, slideCount, options) {
  const { parallel, retry, viewport, onProgress } = options;
  const tabs = Math.min(parallel, slideCount);

  // Split slides into batches for each tab
  const batches = [];
  for (let t = 0; t < tabs; t++) {
    batches.push([]);
  }
  for (let i = 0; i < slideCount; i++) {
    batches[i % tabs].push(i);
  }

  const allResults = new Array(slideCount);
  let completed = 0;

  await Promise.all(
    batches.map(async (batch) => {
      if (batch.length === 0) return;

      await withPage(browser, htmlPath, viewport, async (page) => {
        for (const slideIdx of batch) {
          let result = null;

          for (let attempt = 0; attempt <= retry; attempt++) {
            const attemptWait = options.waitMs + 300 * attempt;
            result = await captureSlide(page, slideIdx, { ...options, waitMs: attemptWait });
            if (!isBlankImage(result.dataUrl)) break;
          }

          const base64 = result.dataUrl.split(',')[1];
          const buffer = Buffer.from(base64, 'base64');

          allResults[slideIdx] = {
            buffer,
            width: result.width,
            height: result.height,
            index: slideIdx,
            blank: isBlankImage(result.dataUrl),
            slideBg: result.slideBg,
          };

          completed++;
          if (onProgress) onProgress(completed, slideCount, slideIdx);
        }
      });
    }),
  );

  return allResults;
}
