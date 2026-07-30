import path from 'node:path'
import { upsertWorkspaceDocsMirrorText } from '@/features/workspace-fs/workspaceSeedProvider'
import {
  deleteWorkspaceDocsMirrorEntry,
  readKnowgrphWorkspaceSeedsAbsRoot,
  readKnowgrphWorkspaceSeedsReadAbsRoot,
  resolveKnowgrphWorkspaceSeedMirrorAbsolutePath,
} from '@/features/workspace-fs/workspaceSeedLocalMirrorAuthority'

const normalizeFsPath = (value: string): string => String(value || '').replace(/\\/g, '/')
const githubRoot = normalizeFsPath(path.resolve(process.cwd(), '..', '..'))
const huijoohweeDocsRoot = `${githubRoot}/huijoohwee/docs`
const knowgrphDocsRoot = `${githubRoot}/knowgrph/docs`

export function testWorkspaceSeedReadRootDoesNotRedirectMutationAuthority(): void {
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousWriteRoot = process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT
  const previousReadRoot = process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_READ_ABS_ROOT
  const taskReadRoot = `${githubRoot}/.worktrees/canonical/knowgrph/docs/workspace-seeds`
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = huijoohweeDocsRoot
    process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT = `${knowgrphDocsRoot}/workspace-seeds`
    process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_READ_ABS_ROOT = taskReadRoot

    if (readKnowgrphWorkspaceSeedsReadAbsRoot() !== taskReadRoot) {
      throw new Error('expected seed reads to use the exact task worktree')
    }
    if (readKnowgrphWorkspaceSeedsAbsRoot() !== `${knowgrphDocsRoot}/workspace-seeds`) {
      throw new Error('expected seed mutations to retain the canonical authoring checkout')
    }
    const mutationPath = resolveKnowgrphWorkspaceSeedMirrorAbsolutePath(
      '/docs/workspace-seeds/team/demo.md',
    )
    if (mutationPath !== `${knowgrphDocsRoot}/workspace-seeds/team/demo.md`) {
      throw new Error(`expected the mutation path to ignore the read projection, got ${mutationPath}`)
    }
  } finally {
    if (typeof previousDocsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousWriteRoot === 'string') process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT = previousWriteRoot
    else delete process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT
    if (typeof previousReadRoot === 'string') process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_READ_ABS_ROOT = previousReadRoot
    else delete process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_READ_ABS_ROOT
  }
}

export async function testWorkspaceSeedProviderEnforcesCanonicalWorkspaceSeedsMutations() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = huijoohweeDocsRoot
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
    const workspacePath = '/docs/workspace-seeds/team/demo.md'
    const wrote = await upsertWorkspaceDocsMirrorText({ workspacePath, text: '# Canonical seed' })
    const deleted = await deleteWorkspaceDocsMirrorEntry({ workspacePath })
    if (!wrote || !deleted) throw new Error('expected canonical workspace seed write and delete requests to succeed')
    const canonicalPath = `${knowgrphDocsRoot}/workspace-seeds/team/demo.md`
    const mutations = calls.filter(call => call.url === '/__kg_fs_write')
    if (mutations.length !== 2 || mutations.some(call => !call.body.includes(canonicalPath))) {
      throw new Error(`expected every workspace seed mutation to target ${canonicalPath}, got ${JSON.stringify(mutations)}`)
    }
    if (mutations.some(call => call.body.includes(`${huijoohweeDocsRoot}/workspace-seeds`))) {
      throw new Error('expected workspace seed mutations never to target huijoohwee/docs/workspace-seeds')
    }
    if (!mutations.every(call => call.body.includes(`"workspacePath":"${workspacePath}"`))) {
      throw new Error('expected the local bridge to receive the workspace ownership key for validation')
    }
    if (!mutations.some(call => call.body.includes('"deleteOnly":true'))) {
      throw new Error('expected canonical workspace seed deletion to be mirrored to the host')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) globalThis.fetch = previousFetch
    else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    if (previousWindow) (globalThis as unknown as { window: Window }).window = previousWindow
    else delete (globalThis as unknown as { window?: Window }).window
  }
}
