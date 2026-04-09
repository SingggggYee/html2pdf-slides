#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import { convertToPDF } from '../src/index.js';

const program = new Command();

program
  .name('html2pdf-slides')
  .description('Convert HTML slide decks to high-fidelity PDF files')
  .version('1.0.0')
  .argument('<input>', 'Path to HTML slide deck')
  .option('-o, --output <path>', 'Output PDF path')
  .option('-s, --selector <css>', 'CSS selector for slide elements', '.slide')
  .option('-a, --active-class <name>', 'CSS class that makes a slide visible', 'active')
  .option('-b, --bg-color <hex>', 'Background color for capture', '#0a0a0a')
  .option('--scale <number>', 'Capture resolution multiplier', (v) => parseFloat(v), 1.5)
  .option('--quality <number>', 'JPEG quality 1-100', (v) => parseInt(v, 10), 88)
  .option('--page-width <points>', 'PDF page width in points', (v) => parseInt(v, 10), 842)
  .option('--parallel <number>', 'Number of parallel browser tabs', (v) => parseInt(v, 10), 2)
  .option('--wait <ms>', 'Wait time before each capture in ms', (v) => parseInt(v, 10), 300)
  .option('--retry <number>', 'Retry count for blank captures', (v) => parseInt(v, 10), 2)
  .option('--no-headless', 'Show browser window (for debugging)')
  .action(async (input, opts) => {
    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    const inputPath = isUrl ? input : path.resolve(input);
    const outputPath = opts.output
      ? path.resolve(opts.output)
      : isUrl
        ? path.resolve(new URL(input).pathname.split('/').pop().replace(/\.html?$/i, '') + '.pdf')
        : inputPath.replace(/\.html?$/i, '.pdf');

    const spinner = ora({ text: 'Discovering slides...', color: 'cyan' }).start();

    try {
      const result = await convertToPDF({
        input: inputPath,
        output: outputPath,
        selector: opts.selector,
        activeClass: opts.activeClass,
        bgColor: opts.bgColor,
        scale: opts.scale,
        quality: opts.quality,
        pageWidth: opts.pageWidth,
        parallel: opts.parallel,
        waitMs: opts.wait,
        retry: opts.retry,
        headless: opts.headless,
        onProgress: (current, total) => {
          spinner.text = `Capturing slide ${current}/${total}...`;
        },
      });

      const fw = result.framework ? ` [${result.framework}]` : '';
      spinner.succeed(
        `Done!${fw} ${result.slideCount} slides → ${chalk.green(result.outputPath)} (${formatSize(result.pdfSize)})`,
      );

      if (result.blankCount > 0) {
        console.log(
          chalk.yellow(`  ⚠ ${result.blankCount} slide(s) may have blank captures`),
        );
      }
    } catch (err) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

program.parse();
