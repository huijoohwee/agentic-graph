import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { assertAnnotationTargets, supportedResponsiveTargets } from 'agentic-design-system/annotation-targets';

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
const stripAnsi = value => value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '');
await new Promise((resolveStart, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Graph Vite server did not start: ${output}`)), 30_000);
  server.once('error', reject);
  server.stdout.on('data', chunk => {
    output += chunk.toString();
    if (stripAnsi(output).includes(origin)) { clearTimeout(timeout); resolveStart(); }
  });
  server.once('exit', code => reject(new Error(`Graph Vite server exited (${code}): ${output}`)));
}).catch(error => { server.kill('SIGTERM'); throw error; });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const [device, profile] of Object.entries(supportedResponsiveTargets)) {
    const context = await browser.newContext({ ...profile, serviceWorkers: 'block' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const activate = control => profile.hasTouch ? control.tap() : control.press('Enter');
    await page.goto(new URL('agentic-graph/', origin).href, { waitUntil: 'domcontentloaded' });
    const historyButton = page.getByRole('button', { name: 'History', exact: true });
    await activate(historyButton);
    const target = page.locator('[data-selection-target="graph-main-panel"]');
    await target.waitFor({ state: 'visible', timeout: 45_000 });
    const report = await page.evaluate(assertAnnotationTargets, { minTargets: 1, scrollIntoView: true });
    assert.equal(report.targets.some(row => row.name === 'graph-main-panel' && row.ok), true);
    await activate(target.getByRole('button', { name: 'Close', exact: true }));
    await target.waitFor({ state: 'hidden' });
    await page.locator('[data-kg-canvas-viewport-root][data-kg-source-authority-phase="ready"]').waitFor();

    // Start the authoring flow with an empty in-memory document in this fresh context.
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
      const state = useGraphStore.getState();
      state.setWorkspaceViewMode('canvas');
      state.setBottomSurfaceCollapsed(true);
      state.setFloatingPanelOpen(false);
      useGraphStore.setState({
        sourceFiles: [], markdownDocumentName: null, markdownDocumentText: '',
        graphData: { type: 'Graph', nodes: [], edges: [] }, graphDataRevision: state.graphDataRevision + 1,
        documentStructureBaselineLock: false, geospatialModeEnabled: false,
      });
    });
    const starters = page.getByRole('region', { name: 'Start a diagram' }).filter({ visible: true }).first();
    const starter = starters.getByRole('button', { name: 'Process map', exact: true });
    await starter.waitFor();
    assert.equal(await starters.getByRole('button').count(), 4);
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
      const state = useGraphStore.getState();
      state.setCanvasRenderMode('2d');
      state.setCanvas2dRenderer('d3');
    });
    const toolMenu = page.locator('summary').filter({ hasText: 'Graph tools' }).filter({ visible: true }).first();
    await activate(toolMenu);
    const rail = page.getByRole('navigation', { name: 'Graph editor tools' });
    const nodeTool = rail.getByRole('button', { name: 'Tool: Node (N)', exact: true });
    await activate(nodeTool);
    assert.equal(await nodeTool.getAttribute('aria-pressed'), 'true');
    for (const control of [toolMenu, nodeTool, ...await starters.getByRole('button').all()]) {
      const box = await control.boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= profile.viewport.width + 1, device + ' authoring control outside viewport');
      if (profile.hasTouch) assert.ok(box.width >= 44 && box.height >= 44, device + ' undersized authoring control ' + await control.innerText());
    }
    await activate(toolMenu);
    await activate(starter);
    const send = page.getByRole('button', { name: 'Send', exact: true }).filter({ visible: true }).last();
    await send.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, device + ' horizontal overflow');
    await activate(send);
    await page.waitForFunction(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
      const { graphData } = useGraphStore.getState();
      return graphData?.nodes.length === 3 && graphData.edges.length === 2;
    });
    assert.deepEqual(pageErrors, []);
    process.stdout.write(`${device} rendered annotation targets and diagram authoring passed\n`);
    await context.close();
  }
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise(resolveExit => setTimeout(resolveExit, 5_000))]);
  }
}
