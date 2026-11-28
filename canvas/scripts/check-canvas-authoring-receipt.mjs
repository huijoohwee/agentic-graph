import assert from 'node:assert/strict';
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
const scene = `/canvas.project @source.frontmatter @source.body @canvas

---
flow:
  nodes:
    - {id: human, type: Concept, label: Developer, position: {x: -240, y: 180}}
    - {id: assistant, type: Concept, label: Assistant, position: {x: 240, y: 180}}
    - {id: workstation, type: Concept, label: Workstation, position: {x: 0, y: 290}}
  edges:
    - {id: human-link, source: human, target: workstation, label: uses}
    - {id: assistant-link, source: assistant, target: workstation, label: assists}
  subgraphs:
    - {id: pair, label: Pair programming, memberNodeIds: [human, assistant, workstation]}
---
Show a developer and an assistant at their shared workstation.
`;

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
  const before = await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().markdownDocumentText);
  const apply = async () => {
    await composer(page).fill(scene);
    await send.press('Enter');
    await page.getByText('Added 3 nodes, 2 edges, 1 group · Pair programming', { exact: true }).last().waitFor();
    await receipt(page).getByRole('button', { name: 'Undo', exact: true }).waitFor();
  };
  await apply();
  await receipt(page).getByRole('button', { name: 'Undo', exact: true }).press('Enter');
  assert.equal(await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().markdownDocumentText), before);
  await apply();
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
  const node = page.locator('[data-kg-layer="nodes"] [data-node-id="human"]').filter({ visible: true }).first();
  await node.click();
  const label = page.getByRole('textbox', { name: 'Node label' });
  await label.fill('Lead developer');
  await label.press('Tab');
  await waitForWorkspace(page, async () => {
    const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    return s.graphData.nodes.find(n => n.id === 'human')?.label === 'Lead developer' && s.markdownDocumentText.includes('Lead developer');
  });
  await receipt(page).getByRole('button', { name: 'Undo', exact: true }).waitFor({ state: 'hidden' });
  await receipt(page).getByRole('button', { name: 'View in History' }).press('Enter');
  await page.waitForFunction(id => document.activeElement?.id === 'version-' + id, entryId);
  assert.equal(await label.inputValue(), 'Lead developer');

  // Reopen the saved bytes through the native document loader with the network offline.
  await waitForWorkspace(page, async () => {
    const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState();
    const { getWorkspaceFs } = await import('/src/features/workspace-fs/workspaceFs.ts');
    return await (await getWorkspaceFs()).readFileText(s.markdownDocumentName) === s.markdownDocumentText;
  });
  await page.context().setOffline(true);
  const reopened = await page.evaluate(async originalSource => {
    const { useGraphStore } = await import('/src/hooks/useGraphStore.ts');
    const { getWorkspaceFs } = await import('/src/features/workspace-fs/workspaceFs.ts');
    const { applyChatAgenticOsDocumentTextToCanvas } = await import('/src/features/chat/chatAgenticOsCanvasApply.ts');
    const { readSubgraphs } = await import('/src/lib/graph/subgraphs.ts');
    const name = useGraphStore.getState().markdownDocumentName;
    const text = await (await getWorkspaceFs()).readFileText(name);
    await applyChatAgenticOsDocumentTextToCanvas({ name: 'other.md', text: originalSource });
    if (useGraphStore.getState().graphData.nodes.some(node => node.id === 'human')) throw new Error('Could not leave the edited scene');
    await applyChatAgenticOsDocumentTextToCanvas({ name, text });
    const state = useGraphStore.getState();
    return {
      sameBytes: state.markdownDocumentText === text,
      label: state.graphData.nodes.find(n => n.id === 'human')?.label,
      members: readSubgraphs(state.graphData).find(g => g.id === 'pair')?.memberNodeIds,
      links: state.graphData.edges.filter(e => e.target === 'workstation').map(e => e.source).sort(),
    };
  }, before);
  assert.deepEqual(reopened, { sameBytes: true, label: 'Lead developer', members: ['assistant', 'human', 'workstation'], links: ['assistant', 'human'] });
  process.stdout.write('Desktop toast Cancel, receipt History focus, byte-identical Undo and offline reopen of the edited Canvas passed\n');
}
