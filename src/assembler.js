import { PDFDocument, rgb } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';

function parseColor(input) {
  if (!input || typeof input !== 'string') return rgb(0.04, 0.04, 0.04);
  const rgbMatch = input.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return rgb(+rgbMatch[1] / 255, +rgbMatch[2] / 255, +rgbMatch[3] / 255);
  }
  const hexMatch = input.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const h = hexMatch[1];
    return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  }
  return rgb(0.04, 0.04, 0.04);
}

export async function buildPDF(slideImages, outputPath, pageWidth = 842, fallbackBgColor = '#0a0a0a', viewport = null) {
  const pdfDoc = await PDFDocument.create();
  const fallbackBg = parseColor(fallbackBgColor);

  // Width is fixed; height follows each slide's natural aspect ratio.
  // Shorter-than-viewport slides pad up to viewport ratio so they don't look cropped;
  // taller slides get taller pages so content isn't shrunk or clipped.
  const minPageHeight = viewport
    ? pageWidth * (viewport.height / viewport.width)
    : pageWidth * (9 / 16);

  for (const { buffer, width, height, slideBg } of slideImages) {
    const image = await pdfDoc.embedJpg(buffer);
    const scale = pageWidth / width;
    const imageHeight = height * scale;
    const pageHeight = Math.max(imageHeight, minPageHeight);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: slideBg ? parseColor(slideBg) : fallbackBg,
    });

    page.drawImage(image, {
      x: 0,
      y: pageHeight - imageHeight,
      width: pageWidth,
      height: imageHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, pdfBytes);
  return pdfBytes.length;
}
