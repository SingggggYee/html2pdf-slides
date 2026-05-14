import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML2CANVAS_PATH = path.join(__dirname, '..', 'assets', 'html2canvas.min.js');

export async function launchBrowser(headless = true) {
  return puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
}

export async function openPage(browser, htmlPath, viewport = { width: 1920, height: 1080 }) {
  const page = await browser.newPage();
  await page.setViewport({ deviceScaleFactor: 2, ...viewport });
  const url = htmlPath.startsWith('http') ? htmlPath : `file://${path.resolve(htmlPath)}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  return page;
}

export async function withPage(browser, htmlPath, viewport, fn) {
  const page = await openPage(browser, htmlPath, viewport);
  try {
    return await fn(page);
  } finally {
    try {
      await page.close();
    } catch {
      // page may already be closed; swallow so the original error surfaces
    }
  }
}

async function injectHtml2Canvas(page) {
  const script = await readFile(HTML2CANVAS_PATH, 'utf-8');
  await page.evaluate(script);
}
