import { openPage } from './browser.js';
import { captureSlide, isBlankImage } from './capture.js';

export async function captureAll(browser, htmlPath, slideCount, options) {
  const { parallel, retry, onProgress } = options;
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

      const page = await openPage(browser, htmlPath);

      for (const slideIdx of batch) {
        let result = null;

        for (let attempt = 0; attempt <= retry; attempt++) {
          result = await captureSlide(page, slideIdx, options);

          if (!isBlankImage(result.dataUrl)) break;

          if (attempt < retry) {
            // Retry with longer wait
            const retryOptions = { ...options, waitMs: options.waitMs + 300 * (attempt + 1) };
            result = await captureSlide(page, slideIdx, retryOptions);
          }
        }

        // Convert dataUrl to buffer
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

      await page.close();
    }),
  );

  return allResults;
}
