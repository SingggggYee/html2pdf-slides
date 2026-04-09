import { PDFDocument, rgb } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';

function parseHexColor(hex) {
  const h = hex.replace('#', '');
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

export async function buildPDF(slideImages, outputPath, pageWidth = 842, fallbackBgColor = '#0a0a0a') {
  // 16:9 minimum page height — short slides won't shrink below this
  const minPageHeight = pageWidth * (9 / 16);
  const pdfDoc = await PDFDocument.create();
  const fallbackBg = parseHexColor(fallbackBgColor);

  for (const { buffer, width, height, slideBg } of slideImages) {
    const image = await pdfDoc.embedJpg(buffer);
    const scale = pageWidth / width;
    const imageHeight = height * scale;
    const pageHeight = Math.max(imageHeight, minPageHeight);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Fill with per-slide background color (sampled from capture)
    const bg = slideBg ? parseHexColor(slideBg) : fallbackBg;
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: bg,
    });

    // Image anchored to top
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
