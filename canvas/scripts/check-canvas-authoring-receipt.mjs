import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';

export async function waitForWorkspace(page, predicate, argument) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, argument)) return;
    await wait(100);
  }
  throw new Error('Workspace did not settle: ' + predicate.toString());
}

const composer = page => page.locator('[data-kg-chat-contenteditable-surface] [contenteditable=true]').filter({ visible: true }).last();
const receipt = page => page.getByRole('navigation', { name: 'Diagram receipt' }).last();
const scene = 'Sketch a robot pair-programming with a human';

export async function checkPendingCancel(page, send) {
  // Hold the real staging module on its first load. Release it after cancelling to
  // exercise late delivery without adding a delay to production authoring.
  let resume;
  const staging = new Promise(resolve => { resume = resolve; });
  const moduleUrl = '**/canvasAuthoringFlow.ts*';
  const intercept = async route => { await staging; await route.continue(); };
  const toast = page.getByRole('region', { name: 'Notifications' });
  const initial = await composer(page).innerText();
  await page.route(moduleUrl, intercept, { times: 1 });
  try {
    await send.press('Enter');
    const cancel = toast.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.waitFor({ timeout: 15000 });
    const previousAction = await page.evaluate(async () => {
      const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
      return s.uiToasts.find(item => item.busy).actions[0].id;
    });
    await cancel.press('Enter');
    await page.getByText('Diagram cancelled.', { exact: true }).waitFor();
    await toast.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await composer(page).innerText(), initial);
    const unchanged = await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
      const state = useGraphStore.getState();
      return !state.canvasAuthoringTurn && !state.graphData.nodes.length && state.markdownDocumentText === '';
    });
    assert.ok(unchanged);
    await send.press('Enter');
    await cancel.waitFor();
    assert.equal(await page.evaluate(async id => (await import('/src/lib/ui/uiActionRuntime.ts')).runUiAction(id), previousAction), false);
    const card = toast.getByRole('status').filter({ has: page.getByRole('button', { name: 'Cancel', exact: true }) });
    await card.getByRole('button', { name: 'Dismiss' }).press('Enter');
    assert.ok(await page.evaluate(async () => !!(await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().canvasAuthoringTurn));
  } finally {
    resume();
  }
}

export async function checkEditableReceipt(page, send, toolMenu, mainPanel) {
  await page.getByText('Added 3 nodes, 2 edges', { exact: true }).waitFor();
  const savedSource = () => page.evaluate(async () => {
    const { settleWorkspaceSourceTextWrites } = await import('/src/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue.ts');
    const { getWorkspaceFs } = await import('/src/features/workspace-fs/workspaceFs.ts');
    const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
    await settleWorkspaceSourceTextWrites();
    const state = useGraphStore.getState();
    const saved = await (await getWorkspaceFs()).readFileText(state.markdownDocumentName);
    if (saved !== state.markdownDocumentText) throw new Error('The active document differs from the saved source');
    return saved;
  });
  const before = await savedSource();
  const apply = async (viaPreset = false) => {
    const thread = page.locator('[data-kg-chat-thread-viewport]').filter({ visible: true }).last();
    const summaries = thread.getByText('Added 3 nodes, 2 edges, 1 group · Pair programming', { exact: true });
    const added = summaries.nth(await summaries.count());
    if (viaPreset) {
      for (const [menu, placeholder, token] of [
        ['Open bindings and variables', 'Find workspace variable', '@canvas'],
        ['Open runtime invocations', 'Find runtime or keyword', '#canvas'],
        ['Open slash commands', 'Find command', '/canvas.project'],
      ]) {
        await page.getByRole('button', { name: menu, exact: true }).click();
        await page.getByPlaceholder(placeholder).fill(token);
        await page.getByRole('listbox').getByText(token, { exact: true }).first().click();
        assert.ok((await composer(page).innerText()).includes(token));
        await page.waitForFunction(() => document.activeElement?.matches('[data-kg-chat-input]'));
        await composer(page).fill('');
      }
      await page.getByRole('button', { name: 'Open slash commands' }).click();
      await page.getByPlaceholder('Find command').fill('canvas-sketch');
      await page.getByRole('listbox').getByText('/canvas-sketch-prompt-preset', { exact: true }).click();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-kg-chat-contenteditable-surface] [contenteditable=true]'))
        .some(el => el.textContent.includes('Sketch a robot pair-programming with a human')));
      assert.match(await composer(page).innerText(), /\/canvas\.project\s+@canvas\s+#canvas/);
      assert.equal(await savedSource(), before);
    } else {
      await composer(page).fill(scene);
    }
    await send.and(page.locator(':enabled')).press('Enter');
    try {
      await added.waitFor();
      await added.locator('..').getByRole('button', { name: 'Undo', exact: true }).waitFor();
    } catch (cause) {
      throw new Error('New diagram receipt missing. Visible Chat status: ' + (await thread.innerText()).slice(-1200), { cause });
    }
    const drawings = page.locator('[data-kg-layer="nodes"] svg[data-kg-node-shape="sketch"]');
    await drawings.first().waitFor();
    assert.equal(await drawings.filter({ visible: true }).count(), 3);
    for (const drawing of await drawings.filter({ visible: true }).all()) assert.ok(await drawing.locator('path').count() >= 6);
    await savedSource();
  };
  await apply();
  await receipt(page).getByRole('button', { name: 'Undo', exact: true }).press('Enter');
  assert.equal(await savedSource(), before);
  await apply(true);
  const entryId = await page.evaluate(async () => {
    const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    return s.history[s.historyIndex].id;
  });
  await receipt(page).getByRole('button', { name: 'View in History' }).press('Enter');
  await page.waitForFunction(id => document.activeElement?.id === 'version-' + id, entryId);
  await mainPanel.getByRole('button', { name: 'Close', exact: true }).press('Enter');

  await toolMenu.press('Enter');
  const tools = page.getByRole('navigation', { name: 'Graph editor tools' });
  await tools.getByRole('button', { name: /^Tool: Select/ }).press('Enter');
  await page.getByRole('button', { name: 'Inspector', exact: true }).filter({ visible: true }).first().press('Enter');
  const node = page.locator('[data-kg-layer="nodes"] [data-node-id="sketch-human-1"]').filter({ visible: true }).first();
  await node.click();
  const label = page.getByRole('textbox', { name: 'Node label' });
  await label.fill('Lead developer');
  await label.press('Tab');
  await waitForWorkspace(page, async () => {
    const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    return s.graphData.nodes.find(n => n.id === 'sketch-human-1')?.label === 'Lead developer' && s.markdownDocumentText.includes('Lead developer');
  });
  await receipt(page).getByRole('button', { name: 'Undo', exact: true }).waitFor({ state: 'hidden' });
  await receipt(page).getByRole('button', { name: 'View in History' }).press('Enter');
  await page.waitForFunction(id => document.activeElement?.id === 'version-' + id, entryId);
  assert.equal(await label.inputValue(), 'Lead developer');

  await mainPanel.getByRole('button', { name: 'Close', exact: true }).press('Enter');
  const width = page.getByRole('spinbutton', { name: 'Stroke width' });
  await width.fill('5');
  await width.press('Tab');
  await waitForWorkspace(page, async () => {
    const state = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    return state.graphData.nodes.find(n => n.id === 'sketch-human-1')?.properties?.['visual:sketch']?.marks[0].width === 5;
  });
  const editedMark = node.locator('path[stroke-width="5"]').first();
  await editedMark.waitFor();
  const pathField = page.getByRole('textbox', { name: 'Stroke path' });
  const newPath = (await pathField.inputValue()).replace(/^M24 81/, 'M21 78');
  await pathField.fill(newPath);
  await pathField.press('Enter');
  await node.locator('path[d^="M21 78"]').first().waitFor();

  // Draw on the same native surface using real pointer events.
  await page.getByRole('button', { name: 'Inspector', exact: true }).filter({ visible: true }).first().press('Enter');
  await tools.getByRole('button', { name: /^Tool: Node/ }).press('Enter');
  await page.getByLabel('Freehand stroke', { exact: true }).check();
  await toolMenu.press('Enter');
  const svg = page.locator('svg[data-kg-freehand-ready="true"]').filter({ visible: true }).first();
  await svg.waitFor();
  const start = await svg.evaluate(el => {
    const r = el.getBoundingClientRect();
    for (let y = Math.max(60, r.top + 80); y < Math.min(innerHeight, r.bottom) - 50; y += 48) {
      for (let x = Math.max(30, r.left + 50); x < Math.min(innerWidth, r.right) - 100; x += 64) {
        if ([0, 30, 60].every(dx => el.contains(document.elementFromPoint(x + dx, y + (dx === 30 ? 18 : 0))))) return { x, y };
      }
    }
    throw Error('No exposed drawing area');
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 18, { steps: 6 });
  await page.mouse.move(start.x + 60, start.y, { steps: 6 });
  await page.mouse.up();
  const drawnStroke = page.locator('svg[data-node-id="sketch-stroke-1"]').filter({ visible: true }).first();
  await drawnStroke.locator('path').waitFor();
  const placement = await drawnStroke.evaluate(async el => {
    const state = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    const saved = state.graphData.nodes.find(n => n.id === 'sketch-stroke-1');
    return { x: el.__data__.x, y: el.__data__.y, sourceX: saved.x, sourceY: saved.y };
  });
  assert.ok(Math.abs(placement.x - placement.sourceX) < 1 && Math.abs(placement.y - placement.sourceY) < 1, 'Layout moved the authored stroke');
  // Reopen the saved bytes through the native document loader with the network offline.
  await waitForWorkspace(page, async () => {
    const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    const { getWorkspaceFs } = await import('/src/features/workspace-fs/workspaceFs.ts');
    return await (await getWorkspaceFs()).readFileText(s.markdownDocumentName) === s.markdownDocumentText;
  });
  // Resolve the rehearsal's dev-server entry points online. Vite can load the
  // app's own entry points under timestamped URLs during development.
  await page.evaluate(() => Promise.all([
    import('/src/features/chat/chatAgenticOsCanvasApply.ts'),
    import('/src/lib/graph/subgraphs.ts'),
  ]).then(() => undefined));
  await page.context().setOffline(true);
  const reopened = await page.evaluate(async originalSource => {
    const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
    const { getWorkspaceFs } = await import('/src/features/workspace-fs/workspaceFs.ts');
    const { applyChatAgenticOsDocumentTextToCanvas } = await import('/src/features/chat/chatAgenticOsCanvasApply.ts');
    const { readSubgraphs } = await import('/src/lib/graph/subgraphs.ts');
    const name = useGraphStore.getState().markdownDocumentName;
    const text = await (await getWorkspaceFs()).readFileText(name);
    await applyChatAgenticOsDocumentTextToCanvas({ name: 'other.md', text: originalSource });
    if (useGraphStore.getState().graphData.nodes.some(node => node.id === 'sketch-human-1')) throw new Error('Could not leave the edited scene');
    await applyChatAgenticOsDocumentTextToCanvas({ name, text });
    const state = useGraphStore.getState();
    return {
      sameBytes: state.markdownDocumentText === text,
      path: state.graphData.nodes.find(n => n.id === 'sketch-human-1')?.properties?.['visual:sketch']?.marks[0].d,
      inkWidth: state.graphData.nodes.find(n => n.id === 'sketch-human-1')?.properties?.['visual:sketch']?.marks[0].width,
      stroke: state.graphData.nodes.find(n => n.id === 'sketch-stroke-1')?.properties?.['visual:sketch']?.marks[0].d.startsWith('M'),
      label: state.graphData.nodes.find(n => n.id === 'sketch-human-1')?.label,
      members: readSubgraphs(state.graphData).find(g => g.id === 'sketch-group-1')?.memberNodeIds,
      links: state.graphData.edges.filter(e => e.target === 'sketch-workstation-1').map(e => e.source).sort(),
    };
  }, before);
  assert.deepEqual(reopened, { sameBytes: true, path: newPath, inkWidth: 5, stroke: true, label: 'Lead developer', members: ['sketch-human-1', 'sketch-robot-1', 'sketch-workstation-1'], links: ['sketch-human-1', 'sketch-robot-1'] });
  await page.context().setOffline(false);
  await checkLocalVoiceStudio(page, mainPanel);
  process.stdout.write('Desktop Chat sketch, editable vector ink, freehand gesture, History, byte-identical Undo and offline reopen passed\n');
}

async function checkLocalVoiceStudio(page, mainPanel) {
  const wave = Buffer.alloc(44 + 1600);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
  const calls = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', new URL(page.url()).origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    calls.push({ path: req.url, body });
    if (req.url === '/v1/audio/transcriptions') res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ text: 'Local audio check' }));
    else if (req.url === '/v1/audio/speech') res.writeHead(200, { 'Content-Type': 'audio/wav' }).end(wave);
    else res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/v1';
    await page.getByRole('button', { name: 'History', exact: true }).press('Enter');
    await mainPanel.getByRole('tab', { name: 'Integrations', exact: true }).press('Enter');
    await mainPanel.getByRole('button', { name: 'Transcribe audio' }).click();
    const studio = page.getByRole('region', { name: 'AI Voice Studio' }).filter({ visible: true }).last();
    await studio.getByLabel('Local server URL').fill(base);
    await studio.getByLabel('Model ID').fill('local-asr');
    await studio.getByLabel(/^Audio file/).setInputFiles({ name: 'sample.wav', mimeType: 'audio/wav', buffer: wave });
    await studio.getByRole('button', { name: 'Transcribe file' }).click();
    await studio.getByText('Transcript added.', { exact: true }).waitFor();
    assert.equal(await studio.getByRole('textbox', { name: 'Transcript', exact: true }).inputValue(), 'Local audio check');
    await studio.getByRole('tab', { name: 'Create', exact: true }).click();
    await studio.getByRole('textbox', { name: 'Text', exact: true }).fill('Read the diagram');
    await studio.getByLabel('Local server URL').fill(base);
    await studio.getByLabel('Model ID').fill('local-tts');
    await studio.getByRole('button', { name: 'Generate WAV' }).click();
    const player = studio.getByLabel('AI-generated speech', { exact: true });
    await player.waitFor();
    const duration = await player.evaluate(async audio => { await audio.play(); audio.pause(); return audio.duration; });
    assert.ok(Math.abs(duration - 0.1) < 0.001);
    assert.deepEqual(calls.map(c => c.path), ['/v1/audio/transcriptions', '/v1/audio/speech']);
    assert.ok(calls[0].body.includes(wave) && calls[0].body.includes('local-asr'));
    assert.deepEqual(JSON.parse(calls[1].body.toString()), { model: 'local-tts', voice: 'alloy', input: 'Read the diagram', response_format: 'wav' });
    process.stdout.write('Desktop MainPanel → Voice Studio file transcription and WAV playback passed against a loopback fixture\n');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
