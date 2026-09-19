import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { runWidgetCommand, WIDGET_COMMAND_TOOL } from '../widget-command-runtime.js';
const invocation = '/canvas.widget #widget @dashboard';

test('widget commands share identity, layout and Markdown without mutating source input', () => {
  const before = { version: 1, widgets: {} };
  const input = { invocation: `${invocation} operation=upsert id=graph:notes template=text`, settings: { markdown: '## Notes\n\n**Evidence**', aspectRatio: '9:16' }, document: before };
  const result = runWidgetCommand(input);
  assert.deepEqual(before.widgets, {});
  assert.deepEqual(runWidgetCommand({ ...input, document: result.document }).document, result.document);
  assert.equal(runWidgetCommand({ operation: 'export', document: result.document }).markdown.includes('## Notes\n\n**Evidence**'), true);
  const layout = runWidgetCommand({ document: result.document, operation: 'layout', boardId: 'mission', rows: [['mission:tree', 'mission:codebase']] });
  assert.deepEqual(runWidgetCommand({ document: layout.document, invocation: `${invocation} operation=layout boardId=mission columns=1` }).document.boards.mission, [['mission:tree'], ['mission:codebase']]);
  const disclosure = runWidgetCommand({ operation: 'upsert', id: 'graph:details', settings: { template: 'disclosure', title: 'Evidence', markdown: '**Retained**' } });
  const collapsed = runWidgetCommand({ document: disclosure.document, invocation: `${invocation} operation=collapse id=graph:details` });
  assert.equal(collapsed.document.widgets['graph:details'].expanded, false);
  assert.match(runWidgetCommand({ document: collapsed.document, operation: 'export' }).markdown, /<details>\n<summary>Evidence<\/summary>\n\n\*\*Retained/);
  assert.equal(runWidgetCommand({ document: collapsed.document, operation: 'expand', id: 'graph:details' }).document.widgets['graph:details'].expanded, true);
  for (const request of [
    { invocation: `${invocation} operation=upsert operation=remove` },
    { invocation: `${invocation} operation=inspect`, operation: 'remove' },
    { operation: 'upsert', id: 'graph:notes', settings: { aspectRatio: 'free' } },
    { operation: 'upsert', id: 'graph:notes', settings: { children: ['graph:child'] } },
    { operation: 'upsert', id: 'graph:notes', settings: { markdown: 'x'.repeat(16001) } },
    { operation: 'layout', boardId: 'mission', rows: [['mission:tree', 'mission:tree']] },
    { operation: 'create', id: 'graph:card' },
  ]) assert.throws(() => runWidgetCommand(request));
  assert.throws(() => runWidgetCommand({ document: { version: 1, widgets: { 'graph:a': { template: 'container', children: ['graph:c'] }, 'graph:b': { template: 'container', children: ['graph:c'] } } } }));
});

test('stdio MCP discovers and invokes the canonical Widget Card tool', async () => {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const client = new Client({ name: 'widget-contract', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(cwd, 'mcp/server.js')], cwd,
    env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '', NODE_ENV: 'test', AGENTIC_OS_ROOT: cwd, AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: '' }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.filter(tool => tool.name === WIDGET_COMMAND_TOOL).length, 1);
    const call = await client.callTool({ name: WIDGET_COMMAND_TOOL, arguments: { invocation: `${invocation} operation=upsert id=graph:notes template=text`, settings: { markdown: '| Name | Value |\n| --- | --- |\n| CPU | 1 |' } } });
    assert.equal(call.isError, false);
    const result = call.structuredContent ?? JSON.parse(call.content[0].text);
    assert.equal(result.surface, 'document');
    assert.equal(result.path, '/notes/dashboard.widgets.json');
    assert.equal(result.document.widgets['graph:notes'].template, 'text');
  } finally { await client.close(); await transport.close(); }
});
