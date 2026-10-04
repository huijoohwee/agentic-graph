import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { JSDOM } from 'jsdom'
import { createWorkspaceProjectServer } from '../../../mcp/workspace-project-server.js'
import { mountWorkspaceProject } from '../features/workspace-project/workspaceProjectClient.js'

const markupPath = new URL('../features/workspace-project/workspaceProjectMarkup.html', import.meta.url)
async function fixture(t: test.TestContext) {
  const rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panel-project-')))
  const service = await createWorkspaceProjectServer({ rootDir })
  const dom = new JSDOM('<div id="host"></div>', { url: service.url })
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const set = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'Option', 'AbortController']) {
    set(key, key === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[key])
  }
  const locks = new Set<string>()
  const tools = new Map<string, unknown>()
  Object.defineProperty(dom.window.document, 'modelContext', { value: {
    registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
      if (tools.has(tool.name)) throw new Error('Duplicate tool name')
      if (options?.signal?.aborted) return
      tools.set(tool.name, tool)
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
    },
  } })
  Object.defineProperty(dom.window.navigator, 'locks', { value: {
    async request(name: string, _options: unknown, callback: (lock: unknown) => Promise<void>) {
      if (locks.has(name)) return callback(null)
      locks.add(name)
      try { await callback({ name }) } finally { locks.delete(name) }
    },
  } })
  const host = dom.window.document.getElementById('host')!
  const markup = await fs.readFile(markupPath, 'utf8')
  let panel: ReturnType<typeof mountWorkspaceProject> | undefined
  let opened: unknown
  const mount = async () => {
    host.innerHTML = markup
    panel = mountWorkspaceProject(host, { endpoint: service.url, captureFile: () => ({ path: 'canvas.md', content: '# Current Canvas\n' }), openFile: file => { opened = file } })
    await panel.ready
  }
  t.after(async () => {
    panel?.dispose()
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key) }
    dom.window.close()
    await service.close()
    await fs.rm(rootDir, { recursive: true, force: true })
  })
  const field = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!
  const until = async (predicate: () => boolean) => {
    for (let index = 0; index < 100; index++) {
      if (predicate()) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Panel did not settle: ' + field('status').textContent)
  }
  const click = async (id: string) => {
    field(id).click()
    await until(() => !field('checkpoint').disabled)
  }
  const edit = (content: string) => { field('editor').value = content; field('editor').dispatchEvent(new dom.window.Event('input', { bubbles: true })) }
  const create = async () => {
    field('project-name').value = 'panel-test'
    field('new-project').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await until(() => !field('checkpoint').disabled)
  }
  await mount()
  return { rootDir, service, dom, host, field, mount, close: () => panel!.dispose(), click, edit, create, until, opened: () => opened, locks, tools }
}

test('native panel checkpoints, exchanges Canvas copies and recovers drafts after unmount', async t => {
  const ui = await fixture(t)
  assert.equal(ui.tools.size, 2)
  await ui.create()
  ui.edit('first\n')
  await ui.click('checkpoint')
  assert.match(ui.field('status').textContent!, /Exact bytes verified/)
  await ui.click('capture-canvas')
  assert.equal(ui.field('editor').value, '# Current Canvas\n')
  await ui.click('open-canvas')
  assert.deepEqual(ui.opened(), { path: 'canvas.md', content: '# Current Canvas\n', projectId: 'panel-test' })
  ui.edit('retained unsaved canvas copy\n')
  ui.close()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(ui.locks.size, 0, 'panel closure releases its writer lock')
  assert.equal(ui.tools.size, 0, 'native WebMCP registrations are scoped to the panel lifetime')
  await ui.mount()
  assert.equal(ui.field('editor').value, 'retained unsaved canvas copy\n')
  assert.match(ui.field('status').textContent!, /Recovered unsaved draft/)
  assert.equal(ui.tools.size, 2, 'reopening registers only the live panel tools')
  await ui.click('checkpoint')
  const session = await (await fetch(ui.service.url + '/session')).json()
  const readback = await (await fetch(ui.service.url + '/api/plan', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-token': session.token }, body: JSON.stringify({ operation: 'project-inspect', workspaceRoot: ui.rootDir, path: 'panel-test' }) })).json()
  assert.equal(readback.data.history.length, 2)
  assert.equal(readback.data.files.find(file => file.path === 'canvas.md').content, 'retained unsaved canvas copy\n')
})

test('quota failures retain bounded draft bytes across panel closure and reject excess edits', async t => {
  const ui = await fixture(t)
  await ui.create()
  const original = ui.dom.window.Storage.prototype.setItem
  ui.dom.window.Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('agentic-graph-local-draft:')) throw new Error('Quota exhausted')
    original.call(this, key, value)
  }
  ui.edit('retained despite quota\n')
  assert.match(ui.field('draft-state').textContent!, /this app session only/)
  ui.edit('x'.repeat(256 * 1024 + 1))
  assert.equal(ui.field('editor').value, 'retained despite quota\n')
  ui.close()
  await new Promise(resolve => setTimeout(resolve, 0))
  await ui.mount()
  assert.equal(ui.field('editor').value, 'retained despite quota\n')
  ui.dom.window.Storage.prototype.setItem = original
  await ui.click('checkpoint')
  assert.match(ui.field('status').textContent!, /Exact bytes verified/)
})

test('disposing before session resolves cancels admission and does not revive the panel', async t => {
  const ui = await fixture(t)
  ui.close()
  ui.host.innerHTML = await fs.readFile(markupPath, 'utf8')
  const panel = mountWorkspaceProject(ui.host, { endpoint: ui.service.url })
  panel.dispose()
  ui.host.replaceChildren()
  await panel.ready
  assert.equal(ui.host.childElementCount, 0)
  assert.equal(ui.locks.size, 0)
})


test('restored Canvas history, selection and media recovery retain their owner behavior', async t => {
  const { register } = await import('node:module')
  register(`data:text/javascript,${encodeURIComponent(`
    import { readFileSync } from 'node:fs';
    export function load(url, context, nextLoad) {
      if (url.startsWith('file:') && new URL(url).pathname.endsWith('.css')) {
        readFileSync(new URL(url));
        return { format: 'module', shortCircuit: true, source: 'export {};' };
      }
      return nextLoad(url, context);
    }
  `)}`, import.meta.url)
  const { initJsdomHarness } = await import('../tests/lib/jsdomHarness')
  const bootstrap = initJsdomHarness()
  const modules = await Promise.all([
    import('./workspaceCrossViewSync.test'),
    import('./storyboardWidgetMediaRecoveryBudget.test'),
  ])
  bootstrap.restore()
  for (const module of modules) {
    for (const [name, execute] of Object.entries(module)) {
      if (name.startsWith('test') && typeof execute === 'function') await t.test(name, execute)
    }
  }
})
