import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
const normalizeFsPath = (value: string): string => String(value || '').replace(/\\/g, '/')
export const AG_GITHUB_ROOT = normalizeFsPath(path.resolve(process.cwd(), '..', '..'))
export const AG_HUIJOOHWEE_DOCS_ROOT = `${AG_GITHUB_ROOT}/huijoohwee/docs`
export const AG_HUIJOOHWEE_CHAT_LOG_ROOT = `${AG_GITHUB_ROOT}/huijoohwee/chat-log`
export const AG_AGENTIC_OS_DOCS_ROOT = `${AG_GITHUB_ROOT}/agentic-graph/docs`
export const AG_HUIJOOHWEE_DOCS_FS_PREFIX = `/@fs${AG_HUIJOOHWEE_DOCS_ROOT}`

import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { shouldEncodeWorkspaceSourceMirrorAsBase64 } from '@/features/workspace-fs/workspaceSourceMirrorFormats'

export const restoreEnv = (key: string, value: string | undefined): void => {
  if (typeof value === 'string') process.env[key] = value
  else delete process.env[key]
}

export const withFetchAndEnv = async (
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  run: () => Promise<void>,
): Promise<void> => {
  const { restore: restoreDom } = initJsdomHarness()
  resetWorkspaceSeedProviderStorageCacheForTests()
  const previousFetch = globalThis.fetch
  const previousEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(env)) restoreEnv(key, value)
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl
  try {
    await run()
  } finally {
    try {
      resetWorkspaceSeedProviderStorageCacheForTests()
      for (const [key, value] of Object.entries(previousEnv)) restoreEnv(key, value)
      if (previousFetch) (globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
      else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    } finally { restoreDom() }
  }
}

export const withStoreMirrorState = async (run: () => Promise<void>): Promise<void> => {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousWorkspaceState = {
    sourceFiles: store.sourceFiles,
    localMarkdownFolderHandle: store.localMarkdownFolderHandle,
    localMarkdownFolderName: store.localMarkdownFolderName,
    localMarkdownFolderAccessMode: store.localMarkdownFolderAccessMode,
    localMarkdownFolderCacheId: store.localMarkdownFolderCacheId,
    localMarkdownSelectedFolderPath: store.localMarkdownSelectedFolderPath,
  }
  try {
    await run()
  } finally {
    // Folder setters clear each other's ownership; restore the captured fields together.
    try { useGraphStore.setState(previousWorkspaceState) }
    finally { restore() }
  }
}

// Browser tests must serve their own filesystem inputs through the native proxy.
// A Node temporary directory alone does not authorize browser-side Node FS reads.
export const withLocalDocsMirror = async (
  files: Record<string, string | Uint8Array>,
  run: (fixture: { docsRoot: string; drain(): Promise<void> }) => Promise<void>,
): Promise<void> => {
  const tempRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'graph-docs-mirror-')))
  const docsRoot = path.join(tempRoot, 'docs')
  const pending = new Set<Promise<Response>>(), failures = new Set<unknown>()
  const requestedFiles = Object.keys(files)
  let closed = false, ownedLists = 0
  const drain = async () => {
    // A failed assertion does not cancel native IO; settle every owned operation.
    while (pending.size) await Promise.allSettled([...pending])
    if (failures.size) throw new AggregateError([...failures], [...failures].map(error => String((error as Error)?.message || error)).join('; '))
  }
  try {
    if (requestedFiles.length > 16) throw new Error('Mirror fixture exceeds its file bound')
    for (const relPath of requestedFiles) {
      const target = path.resolve(docsRoot, relPath)
      if (!target.startsWith(docsRoot + path.sep)) throw new Error('Mirror fixture input escaped its root')
      if (Buffer.byteLength(files[relPath]!) > 128_000) throw new Error('Mirror fixture exceeds its file byte bound')
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, files[relPath]!)
    }
    const fetcher = (async (input, init) => {
      if (closed) { const error = new Error('Mirror request arrived after teardown'); failures.add(error); throw error }
      const operation = (async () => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost')
        if (url.origin !== 'http://localhost') throw new Error('Mirror fixture cannot access an external origin')
        if (url.pathname === '/__agentic_os_fs_list') {
          if (init?.method !== 'POST') throw new Error('Mirror list requires the native POST request')
          if (JSON.parse(String(init.body || '{}')).path !== docsRoot) return new Response('', { status: 404 })
          ownedLists += 1
          const results = await Promise.allSettled(requestedFiles.map(async relPath => {
            const target = path.join(docsRoot, relPath), bytes = await fs.readFile(target)
            return { relPath, text: bytes.toString(shouldEncodeWorkspaceSourceMirrorAsBase64(relPath) ? 'base64' : 'utf8'), updatedAtMs: (await fs.stat(target)).mtimeMs }
          }))
          const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
          if (errors.length) throw new AggregateError(errors, 'Owned mirror file reads failed')
          const entries = results.filter(result => result.status === 'fulfilled').map(result => result.value)
          return Response.json({ ok: true, files: entries })
        }
        if (url.pathname.startsWith('/@fs/')) {
          const target = path.resolve(decodeURIComponent(url.pathname.slice(4)))
          if (!target.startsWith(docsRoot + path.sep)) return new Response('', { status: 404 })
          try { return new Response(await fs.readFile(target, 'utf8')) }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response('', { status: 404 }); throw error }
        }
        throw new Error(`Unexpected mirror fixture route: ${url.pathname}`)
      })()
      pending.add(operation)
      try { return await operation } catch (error) { failures.add(error); throw error } finally { pending.delete(operation) }
    }) as typeof fetch
    await withFetchAndEnv({
      VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: docsRoot,
      VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: undefined,
      VITE_AGENTIC_OS_STORAGE_BASE_URL: '', VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: 'false',
      VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: 'false',
    }, fetcher, async () => {
      const previousGraph = useGraphStore.getState(), previousExplorer = useMarkdownExplorerStore.getState()
      useGraphStore.setState({
        sourceFiles: [], localMarkdownFolderHandle: null, localMarkdownFolderName: null,
        localMarkdownFolderAccessMode: null, localMarkdownFolderCacheId: null, localMarkdownSelectedFolderPath: docsRoot,
      })
      useMarkdownExplorerStore.getState().setActivePath(null)
      try {
        await run({ docsRoot, drain })
        if (!ownedLists) throw new Error('Mirror fixture did not read its owned native root')
      } catch (error) { failures.add(error) }
      finally {
        closed = true
        try { await drain() }
        finally { useGraphStore.setState(previousGraph); useMarkdownExplorerStore.setState(previousExplorer) }
      }
    })
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }) }
}
