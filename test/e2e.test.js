import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { convertToPDF } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'three-slides.html');

async function inTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'html2pdf-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('converts a 3-slide HTML deck to a 3-page PDF', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'out.pdf');
    const result = await convertToPDF({
      input: fixture,
      output: out,
      selector: '.slide',
      activeClass: 'active',
      parallel: 1,
      retry: 0,
      waitMs: 100,
    });

    assert.equal(result.slideCount, 3);
    assert.equal(result.blankCount, 0);

    const bytes = await readFile(out);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 3, 'PDF should have one page per slide');

    const fileStat = await stat(out);
    assert.ok(fileStat.size > 1000, 'PDF should be non-trivial in size');
  });
});

test('--scale changes capture resolution (deviceScaleFactor honored)', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const out1 = join(dir, 'scale1.pdf');
    const out2 = join(dir, 'scale2.pdf');

    await convertToPDF({
      input: fixture,
      output: out1,
      selector: '.slide',
      activeClass: 'active',
      parallel: 1,
      retry: 0,
      waitMs: 100,
      scale: 1,
      viewport: { width: 800, height: 600 },
    });

    await convertToPDF({
      input: fixture,
      output: out2,
      selector: '.slide',
      activeClass: 'active',
      parallel: 1,
      retry: 0,
      waitMs: 100,
      scale: 2,
      viewport: { width: 800, height: 600 },
    });

    const size1 = (await stat(out1)).size;
    const size2 = (await stat(out2)).size;
    assert.ok(
      size2 > size1 * 1.5,
      `scale=2 PDF (${size2}B) should be substantially larger than scale=1 (${size1}B) — proves --scale affects capture`,
    );
  });
});

test('vector mode renders every active-class slide, not just the initial one', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'vector-content.pdf');
    await convertToPDF({
      input: fixture,
      output: out,
      selector: '.slide',
      activeClass: 'active',
      mode: 'vector',
      parallel: 1,
      retry: 0,
      waitMs: 100,
    });

    const pdf = await PDFDocument.load(await readFile(out));
    assert.equal(pdf.getPageCount(), 3);

    const perPageBytes = [];
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(pdf, [i]);
      single.addPage(copied);
      perPageBytes.push((await single.save()).length);
    }

    const min = Math.min(...perPageBytes);
    const max = Math.max(...perPageBytes);
    assert.ok(
      max <= min * 1.6,
      `each page should have comparable content; blank pages would be much smaller. sizes: ${perPageBytes.join(', ')}`,
    );
  });
});

test('vector mode rejects decks with zero matching slides instead of writing empty PDF', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const emptyFixture = join(dir, 'no-slides.html');
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(
        emptyFixture,
        `<!doctype html><html><body>
          <article class="page">One</article>
          <article class="page">Two</article>
        </body></html>`,
      ),
    );

    await assert.rejects(
      () =>
        convertToPDF({
          input: emptyFixture,
          output: join(dir, 'should-not-exist.pdf'),
          mode: 'vector',
          selector: '.slide',
          parallel: 1,
          retry: 0,
          waitMs: 100,
        }),
      /0 slides matching selector/i,
      'vector mode with 0 matched slides should throw, not silently write an empty PDF',
    );
  });
});

test('vector mode rejects framework decks with a clear error', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const revealFixture = join(dir, 'reveal.html');
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(
        revealFixture,
        `<!doctype html><html><head><meta charset="utf-8"/></head><body>
          <div class="reveal"><div class="slides">
            <section>One</section><section>Two</section>
          </div></div>
          <script>window.Reveal = { isReady: () => true, getIndices: () => ({h:0,v:0}), next: () => {}, slide: () => {}, configure: () => {} };</script>
        </body></html>`,
      ),
    );

    await assert.rejects(
      () =>
        convertToPDF({
          input: revealFixture,
          output: join(dir, 'should-not-exist.pdf'),
          mode: 'vector',
          parallel: 1,
          retry: 0,
          waitMs: 100,
        }),
      /vector mode does not yet support/i,
      'vector mode on a reveal.js deck should throw, not silently produce blank pages',
    );
  });
});


test('bgColor "auto" samples body background without throwing', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'auto-bg.pdf');
    const result = await convertToPDF({
      input: fixture,
      output: out,
      selector: '.slide',
      activeClass: 'active',
      bgColor: 'auto',
      parallel: 1,
      retry: 0,
      waitMs: 100,
    });

    assert.equal(result.slideCount, 3);
    const fileStat = await stat(out);
    assert.ok(fileStat.size > 1000);
  });
});

test('CLI --mode vector on a reveal-like deck (no --selector) hits framework rejection', { timeout: 60_000 }, async () => {
  await inTempDir(async (dir) => {
    const revealFixture = join(dir, 'reveal.html');
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(
        revealFixture,
        `<!doctype html><html><head><meta charset="utf-8"/></head><body>
          <div class="reveal"><div class="slides">
            <section>One</section><section>Two</section>
          </div></div>
          <script>window.Reveal = { isReady: () => true, getIndices: () => ({h:0,v:0}), next: () => {}, slide: () => {}, configure: () => {} };</script>
        </body></html>`,
      ),
    );

    const cli = join(__dirname, '..', 'bin', 'cli.js');
    const result = spawnSync(
      'node',
      [cli, '--mode', 'vector', revealFixture, '-o', join(dir, 'out.pdf')],
      { encoding: 'utf8', timeout: 50_000 },
    );

    assert.notEqual(result.status, 0, 'CLI should fail when vector mode meets a framework deck');
    const combined = (result.stderr || '') + (result.stdout || '');
    assert.match(
      combined,
      /vector mode does not yet support/i,
      `CLI must surface the framework-aware error (not a confusing "0 slides" message). Got: ${combined.slice(0, 400)}`,
    );
  });
});

test('CLI rejects invalid --mode value with non-zero exit', () => {
  const cli = join(__dirname, '..', 'bin', 'cli.js');
  const result = spawnSync(
    'node',
    [cli, '--mode', 'pdf', fixture, '-o', join(tmpdir(), 'should-not-exist.pdf')],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0, 'invalid --mode should fail, not silently fall back to raster');
  assert.match(
    (result.stderr || '') + (result.stdout || ''),
    /mode|invalid|choices/i,
    'error message should mention the invalid mode',
  );
});
