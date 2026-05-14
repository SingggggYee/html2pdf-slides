import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

test('package exposes convertToPDF', async () => {
  const mod = await import('../src/index.js');
  assert.equal(typeof mod.convertToPDF, 'function');
});

test('vector module exposes convertToVectorPDF', async () => {
  const mod = await import('../src/vector.js');
  assert.equal(typeof mod.convertToVectorPDF, 'function');
});

test('CLI --help exits 0 and lists --mode flag', () => {
  const result = spawnSync('node', [join(root, 'bin/cli.js'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--mode/);
  assert.match(result.stdout, /vector/);
});

test('package.json bin entry points to existing file', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin['html2pdf-slides'], 'bin/cli.js');
  assert.equal(pkg.version, '1.1.0');
});
