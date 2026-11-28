import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { supportedResponsiveTargets } from 'agentic-design-system/annotation-targets';

export async function checkChatCanvasProjection(browser, origin, waitForWorkspace) {
  const context = await browser.newContext({ ...supportedResponsiveTargets['macbook-pro-16'], serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const base = new URL(origin);
    await page.route(url => url.protocol.startsWith('http') && url.origin !== base.origin, route => route.abort());
    await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-kg-canvas-viewport-root][data-kg-source-authority-phase="ready"]').waitFor();
    const name = 'canvas-' + randomUUID().slice(0, 8) + '.md';
    const bytes = '---\ntitle: Workflow\nkgCanvasSurfaceMode: 2d\nkgCanvasRenderMode: 2d\nkgCanvas2dRenderer: d3\nkgFrontmatterModeEnabled: true\nflow:\n  nodes:\n    - id: {key: id, type: string, value: base}\n      type: {key: type, type: string, value: Document}\n      label: {key: label, type: string, value: Origin}\n  edges: []\n---\n\n# ' + randomUUID() + '\n';
    const path = await page.evaluate(async ({ name, bytes }) => {
      const fs = await (await import('/src/features/workspace-fs/workspaceFs.ts')).getWorkspaceFs();
      await fs.ensureSeed();
      return fs.createFile({ parentPath: '/', name, text: bytes });
    }, { name, bytes });
    const appUrl = new URL('/', base);
    appUrl.searchParams.set('kgDoc', path.replace(/^\//, ''));
    await page.goto(appUrl.href, { waitUntil: 'domcontentloaded' });
    await waitForWorkspace(page, async path => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
      const s = useGraphStore.getState();
      return s.markdownDocumentName === path.slice(1) && s.graphData?.nodes.some(node => node.id === 'base');
    }, path);
    await page.locator('[data-kg-canvas-viewport-root][data-kg-source-authority-phase="ready"]').waitFor();
    await waitForWorkspace(page, async () => (await import('/src/features/toolbar/floatingPanelBridge.ts')).isFloatingPanelBridgeReady());
    await page.evaluate(async () => {
      const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
      s.setWorkspaceViewMode('editor');
      s.setWorkspaceCanvasPaneOpen(true);
      (await import('/src/features/chat/floatingPanelChat/floatingPanelChatOpenSeed.ts')).openFloatingPanelChat();
      s.setChatProvider('openai');
    });
    const savedSource = () => page.evaluate(async path => {
      await (await import('/src/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue.ts')).settleWorkspaceSourceTextWrites();
      return (await (await import('/src/features/workspace-fs/workspaceFs.ts')).getWorkspaceFs()).readFileText(path);
    }, path);
    await checkProjection(page, name, savedSource, waitForWorkspace);
  } finally {
    await context.close();
  }
}

async function checkProjection(page, documentName, savedSource, waitForWorkspace) {
  const mainPanel = page.locator('[data-selection-target="graph-main-panel"]');
  const send = page.getByRole('button', { name: 'Send', exact: true }).filter({ visible: true }).last();
  const editor = page.locator('[data-kg-chat-contenteditable-surface] [contenteditable=true]').filter({ visible: true }).last();
  const thread = page.locator('[data-kg-chat-thread-viewport]').filter({ visible: true }).last();
  const diagram = page.getByRole('navigation', { name: 'Diagram receipt' }).last();
  const key = randomUUID();
  const calls = [];
  let paths = [];
  let healthStatus = 200;
  let holdResponse;
  let responseStatus = 200;
  const proxy = '**/__chat_proxy/**';
  const fixture = async route => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fulfill({ status: healthStatus, json: { data: [] } });
    if (holdResponse) await holdResponse;
    calls.push({ key: req.headers()['x-kg-chat-api-key'], body: req.postDataJSON(), path: new URL(req.url()).pathname });
    const text = JSON.stringify({ paths });
    if (responseStatus === 200 && req.headers()['x-kg-chat-api-key']) {
      const events = [{ type: 'response.output_text.delta', delta: text }, { type: 'response.completed', response: { status: 'completed' } }];
      return route.fulfill({ contentType: 'text/event-stream', body: events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n' });
    }
    await route.fulfill({ status: responseStatus, json: responseStatus === 200
      ? { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }
      : { error: { message: 'Provider request rejected' } } });
  };
  await page.route(proxy, fixture);
  const before = await savedSource();
  const openSettings = async query => {
    if (!await mainPanel.isVisible()) {
      await page.getByRole('button', { name: 'History', exact: true }).first().press('Enter');
      await mainPanel.waitFor();
    }
    await page.evaluate(async searchQuery => {
      (await import('/src/features/panels/utils/useMainPanelRect.ts')).emitMainPanelOpen({ tab: 'integrations', searchQuery });
    }, query);
  };
  const settingsRow = name => mainPanel.locator('dl').filter({ has: page.getByText(name, { exact: true }) });
  const closeSettings = () => mainPanel.getByRole('button', { name: 'Close', exact: true }).press('Enter');
  try {
    for (const mode of ['serverManaged', 'byok']) {
      await openSettings('byok');
      const modeSelect = settingsRow('openaiApi.auth_mode').locator('button[data-kg-select]');
      await modeSelect.click();
      await page.getByRole('menu').filter({ visible: true }).getByText(mode === 'byok' ? 'BYOK' : 'Server-managed Key', { exact: true }).click();
      if (mode === 'byok') {
        const field = settingsRow('openaiApi.api_key').locator('input');
        await field.fill(key);
        await field.press('Tab');
      }
      await closeSettings();
      await waitForWorkspace(page, async mode => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().chatAuthMode === mode, mode);

      await openSettings('openaiApi.endpoint_url');
      const endpoint = settingsRow('openaiApi.endpoint_url');
      healthStatus = mode === 'byok' ? 401 : 200;
      await endpoint.getByRole('button', { name: 'Check Health' }).waitFor();
      const probe = page.waitForRequest(req => req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/models'));
      await endpoint.getByRole('button', { name: 'Check Health' }).press('Enter');
      assert.equal((await probe).headers()['x-kg-chat-api-key'], mode === 'byok' ? key : undefined);
      await endpoint.getByText(mode === 'byok' ? /HTTP 401/ : /Success/).first().waitFor();
      await closeSettings();
      healthStatus = 200;

      const toggle = thread.getByRole('button', { name: 'Prompt presets', exact: true });
      if (!await thread.getByRole('button', { name: 'Use Sketch on Canvas in Chat' }).isVisible()) await toggle.press('Enter');
      await thread.getByRole('button', { name: 'Use Sketch on Canvas in Chat' }).click();
      await page.waitForFunction(() => document.activeElement?.matches('[contenteditable=true]') &&
        document.activeElement.closest('[data-kg-chat-contenteditable-surface]')?.querySelector('textarea')?.value.startsWith('/canvas.project @canvas #canvas'));
      const draft = await editor.evaluate(el => el.closest('[data-kg-chat-contenteditable-surface]').querySelector('textarea').value);
      const [command, sample] = draft.trim().split(/\n\s*\n/, 2);
      assert.ok(command && sample);
      const request = 'Generate a release workflow for ' + randomUUID();
      paths = [Array.from({ length: 3 }, () => 'stage-' + randomUUID().slice(0, 8))];
      await editor.fill(command + ' ' + request + '\n\n' + sample);
      await waitForWorkspace(page, async () => {
        const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
        const { isWorkspaceCameraInitializationBlocked } = await import('/src/features/workspace-table/workspaceTableSsot.ts');
        const { isWorkspaceAuthoringSourceSettled } = await import('/src/features/workspace-table/workspaceSceneMetadataAuthoring.ts');
        return !isWorkspaceCameraInitializationBlocked(s) && isWorkspaceAuthoringSourceSettled(s);
      });
      const count = calls.length;
      await send.click();
      await waitForWorkspace(page, async label => {
        const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
        return s.graphData?.nodes.some(n => n.label === label);
      }, paths[0][2]).catch(async error => {
        throw new Error('Canvas receipt: ' + (await thread.getByRole('alert').allTextContents()).join(' / '), { cause: error });
      });
      assert.equal(calls.length, count + 1);
      assert.equal(calls[count].key, mode === 'byok' ? key : undefined);
      assert.ok(calls[count].path.endsWith('/responses'));
      const sent = JSON.stringify(calls[count].body.input);
      assert.ok(sent.includes(request) && !sent.includes(sample));
      const saved = await savedSource();
      for (const label of paths[0]) assert.ok(saved.includes(label));
      assert.ok(saved.includes(before.slice(before.lastIndexOf('\n# '))), 'The note body must survive projection');
      await waitForWorkspace(page, async ({ labels, doc }) => {
        const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
        const state = useGraphStore.getState();
        const surface = (await import('/src/features/agent-ready/browserLocalSurfaceSnapshots.ts')).readLocalEditorWorkspaceSurfaceSnapshot();
        const ids = labels.map(label => state.graphData.nodes.find(n => n.label === label)?.id);
        return state.markdownDocumentName === doc && surface?.liveMarkdownText === state.markdownDocumentText
          && ids.every(Boolean) && ids.slice(1).every((id, i) => state.graphData.edges.some(e => e.source === ids[i] && e.target === id));
      }, { labels: paths[0], doc: documentName });
      const nodeId = await page.evaluate(async label => {
        const state = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
        return state.graphData.nodes.find(node => node.label === label).id;
      }, paths[0][0]);
      await page.locator('[data-kg-layer="nodes"] [data-node-id="' + nodeId + '"]').filter({ visible: true }).first().waitFor();
      await diagram.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal(await savedSource(), before);
      responseStatus = mode === 'byok' ? 401 : 500;
      await editor.fill(command + ' ' + request);
      await send.click();
      await thread.getByRole('alert').filter({ hasText: 'HTTP ' + responseStatus }).last().waitFor();
      assert.equal(await savedSource(), before);
      responseStatus = 200;
      if (mode === 'byok') {
        paths = [[]];
        await send.click();
        await thread.getByRole('alert').filter({ hasText: 'invalid diagram' }).waitFor();
        assert.equal(await savedSource(), before);
        paths = [[randomUUID(), randomUUID()]];
        let release;
        holdResponse = new Promise(resolve => { release = resolve; });
        try {
          const pending = page.waitForRequest(req => req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/responses'));
          await send.click();
          await pending;
          await page.getByRole('region', { name: 'Notifications' }).getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
          await thread.getByText('Diagram cancelled.', { exact: true }).waitFor();
        } finally {
          release();
          holdResponse = undefined;
        }
        assert.equal(await savedSource(), before);
      }
    }
    await openSettings('chatSystemPrompt');
    await settingsRow('chatSystemPrompt').waitFor();
    assert.equal(await settingsRow('chatSystemPrompt').getByRole('button', { name: 'Check Health' }).count(), 0);
    await closeSettings();
    process.stdout.write('Edited Canvas preset passed in Editor Workspace with both credential modes, generated labels, provider failures and byte-identical Undo\n');
  } finally {
    await page.unroute(proxy, fixture);
  }
}
