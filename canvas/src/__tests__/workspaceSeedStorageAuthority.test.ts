import {
  ensureWorkspaceDocsMirrorFolder,
  upsertWorkspaceDocsMirrorText,
} from '@/features/workspace-fs/workspaceSeedProvider'
import { deleteWorkspaceDocsMirrorEntry } from '@/features/workspace-fs/workspaceSeedLocalMirrorAuthority'

export async function testWorkspaceSeedProviderEnforcesCanonicalWorkspaceSeedsMutations() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousReadRoot = process.env.VITE_AGENTICGRAPH_WORKSPACE_SEEDS_READ_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = '/tmp/collaborative-docs'
  process.env.VITE_AGENTICGRAPH_WORKSPACE_SEEDS_READ_ABS_ROOT = '/tmp/runtime-seed-read-projection'
  const calls: Array<{ url: string; body: string }> = []
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  ;(globalThis as unknown as { window: Window }).window = {
    setTimeout: ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler()
      return 0 as unknown as number
    }) as Window['setTimeout'],
    clearTimeout: (() => void 0) as Window['clearTimeout'],
  } as unknown as Window
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body || '') })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as typeof fetch
  try {
    const folderPath = '/docs/workspace-seeds/team'
    const workspacePath = '/docs/workspace-seeds/team/demo.md'
    const createdFolder = await ensureWorkspaceDocsMirrorFolder({
      workspacePath: folderPath,
    })
    const wrote = await upsertWorkspaceDocsMirrorText({ workspacePath, text: '# Canonical seed' })
    const deleted = await deleteWorkspaceDocsMirrorEntry({ workspacePath })
    if (!createdFolder || !wrote || !deleted) {
      throw new Error('expected logical canonical seed folder, write, and delete requests to succeed')
    }
    const mutations = calls.filter(call => call.url === '/__kg_fs_write')
    if (mutations.length !== 3) {
      throw new Error(`expected three canonical workspace seed mutations, got ${JSON.stringify(mutations)}`)
    }
    const payloads = mutations.map(call => JSON.parse(call.body) as Record<string, unknown>)
    if (payloads.some(payload => Object.hasOwn(payload, 'path'))) {
      throw new Error(`expected browser seed mutations never to send a host path, got ${JSON.stringify(payloads)}`)
    }
    if (
      payloads[0]?.workspacePath !== folderPath
      || payloads[1]?.workspacePath !== workspacePath
      || payloads[2]?.workspacePath !== workspacePath
    ) {
      throw new Error(`expected logical workspace ownership keys only, got ${JSON.stringify(payloads)}`)
    }
    if (
      JSON.stringify(payloads).includes('/tmp/collaborative-docs')
      || JSON.stringify(payloads).includes('/tmp/runtime-seed-read-projection')
    ) {
      throw new Error('expected neither collaborative docs nor read projection roots in mutation payloads')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) globalThis.fetch = previousFetch
    else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    if (previousWindow) (globalThis as unknown as { window: Window }).window = previousWindow
    else delete (globalThis as unknown as { window?: Window }).window
    if (typeof previousReadRoot === 'string') process.env.VITE_AGENTICGRAPH_WORKSPACE_SEEDS_READ_ABS_ROOT = previousReadRoot
    else delete process.env.VITE_AGENTICGRAPH_WORKSPACE_SEEDS_READ_ABS_ROOT
  }
}
