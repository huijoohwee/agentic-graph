import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { assertAnnotationTargets } from 'agentic-design-system/annotation-targets';

const probe = createServer();
await new Promise((resolveListen, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolveListen));
const port = probe.address().port;
await new Promise((resolveClose, reject) => probe.close(error => error ? reject(error) : resolveClose()));

const origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [
  resolve(process.cwd(), 'node_modules/vite/bin/vite.js'), '--configLoader', 'runner',
  '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], { cwd: resolve('canvas'), stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
await new Promise((resolveStart, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Graph Vite server did not start: ${output}`)), 30_000);
  server.once('error', reject);
  server.stdout.on('data', chunk => {
    output += chunk.toString();
    if (output.includes(origin)) { clearTimeout(timeout); resolveStart(); }
  });
  server.once('exit', code => reject(new Error(`Graph Vite server exited (${code}): ${output}`)));
}).catch(error => { server.kill('SIGTERM'); throw error; });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const target = page.locator('[data-selection-target="graph-main-panel"]');
  await target.waitFor({ state: 'visible', timeout: 45_000 });
  const report = await page.evaluate(assertAnnotationTargets, { minTargets: 1, scrollIntoView: true });
  assert.equal(report.targets.some(row => row.name === 'graph-main-panel' && row.ok), true);
  assert.deepEqual(pageErrors, []);
  process.stdout.write(`Rendered annotation targets passed: ${report.targetCount}\n`);
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise(resolveExit => setTimeout(resolveExit, 5_000))]);
  }
}
