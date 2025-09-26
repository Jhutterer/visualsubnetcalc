import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const resultsPath = resolve(process.cwd(), 'test-results', 'results.json');

function printSummaryLine(payload) {
  try {
    const line = `PLAYWRIGHT_SUMMARY: ${JSON.stringify(payload)}`;
    // eslint-disable-next-line no-console
    console.log(line);
  } catch {
    // eslint-disable-next-line no-console
    console.log('PLAYWRIGHT_SUMMARY: {"status":"unknown","note":"failed to stringify summary"}');
  }
}

function parseStats(json) {
  // Prefer json.stats if available; otherwise derive minimal info.
  const stats = json?.stats ?? {};
  const status = stats.status || json?.status || 'unknown';
  const total = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0) + (stats.skipped ?? 0);
  return {
    status,
    total,
    passed: stats.expected ?? undefined,
    failed: stats.unexpected ?? undefined,
    flaky: stats.flaky ?? undefined,
    skipped: stats.skipped ?? undefined,
    durationMs: stats.duration ?? undefined,
  };
}

async function emitSummary(exitCode) {
  if (!existsSync(resultsPath)) {
    printSummaryLine({ status: 'unknown', note: 'no results.json found', exitCode });
    return;
  }
  try {
    const raw = await readFile(resultsPath, 'utf8');
    const json = JSON.parse(raw);
    const stats = parseStats(json);
    printSummaryLine({ ...stats, exitCode, resultsFile: resultsPath });
  } catch (err) {
    printSummaryLine({ status: 'unknown', note: 'error reading/parsing results.json', error: String(err), exitCode });
  }
}

async function run() {
  // Run Playwright tests with stdio inherited so output streams through.
  const extraArgs = process.argv.slice(2);
  const child = spawn('npx', ['playwright', 'test', ...extraArgs], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('close', async (code) => {
    const exitCode = typeof code === 'number' ? code : 1;
    await emitSummary(exitCode);
    process.exit(exitCode);
  });

  child.on('error', async (err) => {
    printSummaryLine({ status: 'error', note: 'failed to start playwright', error: String(err) });
    process.exit(1);
  });
}

run();
