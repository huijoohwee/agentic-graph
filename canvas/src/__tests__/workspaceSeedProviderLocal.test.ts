import path from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ensureWorkspaceChatMirrorFolder, ensureWorkspaceDocsMirrorFolder, readWorkspaceInitializationDocsMirrorEntries, upsertWorkspaceChatMirrorText, upsertWorkspaceDocsMirrorText, readWorkspaceInitializationSeedText, upsertWorkspaceInitializationSeedText } from '@/features/workspace-fs/workspaceSeedProvider'
import { AG_GITHUB_ROOT, AG_AGENTIC_OS_DOCS_ROOT, AG_HUIJOOHWEE_CHAT_LOG_ROOT, AG_HUIJOOHWEE_DOCS_FS_PREFIX, AG_HUIJOOHWEE_DOCS_ROOT, withLocalDocsMirror } from './helpers/workspaceSeedMirrorHarness'

export async function testWorkspaceSeedProviderPrefersConfiguredAbsoluteDocsRoot() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  const previousFetch = globalThis.fetch
  const calls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    calls.push(url)
    if (url.includes(`${AG_HUIJOOHWEE_DOCS_FS_PREFIX}/agentic-graph-video-demo.md`)) {
      return new Response('# absolute docs seed', { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  try {
    const text = await readWorkspaceInitializationSeedText({
      basename: 'agentic-graph-video-demo.md',
      relPathCandidates: ['docs/agentic-graph-video-demo.md'],
    })
    if (text !== '# absolute docs seed') {
      throw new Error(`expected absolute docs seed provider path to win, got ${String(text || '')}`)
    }
    if (!calls.some(url => url.includes(`${AG_HUIJOOHWEE_DOCS_FS_PREFIX}/agentic-graph-video-demo.md`))) {
      throw new Error('expected workspace seed provider to probe configured absolute docs root through Vite /@fs')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
  }
}

export async function testWorkspaceSeedProviderUsesDeclaredReadRootWithoutDocsFallback() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousReadRoot = process.env.VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT
  const seedReadRoot = `${AG_GITHUB_ROOT}/active-agentic-graph/docs/workspace-seeds`
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  process.env.VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT = seedReadRoot
  const previousFetch = globalThis.fetch
  const calls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    calls.push(url)
    if (url.includes(`/@fs${seedReadRoot}/agentic-graph-video-demo.md`)) {
      return new Response('# active repository seed', { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  try {
    const text = await readWorkspaceInitializationSeedText({
      basename: 'agentic-graph-video-demo.md',
      relPathCandidates: ['docs/workspace-seeds/agentic-graph-video-demo.md', 'docs/agentic-graph-video-demo.md'],
    })
    if (text !== '# active repository seed') {
      throw new Error(`expected the declared active-repository seed to resolve, got ${String(text || '')}`)
    }
    if (!calls.some(url => url.includes(`/@fs${seedReadRoot}/agentic-graph-video-demo.md`))) {
      throw new Error('expected workspace seed provider to probe only the declared read root')
    }
    if (calls.some(url => url.includes(AG_HUIJOOHWEE_DOCS_ROOT))) {
      throw new Error(`expected collaborative docs never to redirect agentic-graph seed reads, got ${JSON.stringify(calls)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousReadRoot === 'string') process.env.VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT = previousReadRoot
    else delete process.env.VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
  }
}

export async function testWorkspaceSeedProviderBrowserUpsertWritesViaKgFsProxy() {
  const previousWindow = globalThis.window
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const calls: Array<{ url: string; body: string }> = []
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { window: Window }).window = {
    setTimeout: ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler()
      return 0 as unknown as number
    }) as Window['setTimeout'],
    clearTimeout: (() => void 0) as Window['clearTimeout'],
  } as unknown as Window
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(typeof input === 'string' ? input : (input as URL).toString()),
      body: String(init?.body || ''),
    })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const ok = await upsertWorkspaceInitializationSeedText({
      basename: 'agentic-graph-video-demo.md',
      text: '# mirrored seed',
    })
    if (!ok) {
      throw new Error('expected browser upsert to succeed through /__agentic_os_fs_write proxy')
    }
    const writeCall = calls.find(call => call.url === '/__agentic_os_fs_write')
    if (!writeCall) {
      throw new Error('expected workspace seed provider to call /__agentic_os_fs_write in browser mode')
    }
    if (!writeCall.body.includes(`${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-video-demo.md`)) {
      throw new Error('expected workspace seed provider write payload to target configured docs absolute path')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (previousWindow) {
      ;(globalThis as unknown as { window: Window }).window = previousWindow
    } else {
      delete (globalThis as unknown as { window?: Window }).window
    }
  }
}

export async function testWorkspaceSeedProviderBrowserUpsertDocsMirrorWritesViaKgFsProxy() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
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
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(typeof input === 'string' ? input : (input as URL).toString()),
      body: String(init?.body || ''),
    })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const folderOk = await ensureWorkspaceDocsMirrorFolder({
      workspacePath: '/docs/20260527T123654Z',
    })
    const fileOk = await upsertWorkspaceDocsMirrorText({
      workspacePath: '/docs/20260527T123654Z/agentic-os-trace_20260527T123654Z.md',
      text: '# streamed',
    })
    if (!folderOk || !fileOk) {
      throw new Error('expected browser docs mirror writes to succeed through /__agentic_os_fs_write proxy')
    }
    const folderCall = calls.find(call => call.body.includes('"mkdirOnly":true'))
    if (!folderCall || !folderCall.body.includes(`${AG_HUIJOOHWEE_DOCS_ROOT}/20260527T123654Z`)) {
      throw new Error('expected docs mirror folder creation payload to target configured docs absolute path')
    }
    const fileCall = calls.find(call => call.body.includes('agentic-os-trace_20260527T123654Z.md'))
    if (!fileCall || !fileCall.body.includes(`${AG_HUIJOOHWEE_DOCS_ROOT}/20260527T123654Z/agentic-os-trace_20260527T123654Z.md`)) {
      throw new Error('expected docs mirror file write payload to target configured docs absolute path')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (previousWindow) {
      ;(globalThis as unknown as { window: Window }).window = previousWindow
    } else {
      delete (globalThis as unknown as { window?: Window }).window
    }
  }
}

export async function testWorkspaceSeedProviderBrowserUpsertDocsMirrorSkipsHiddenDocumentWrites() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  const calls: Array<{ url: string; body: string }> = []
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  ;(globalThis as unknown as { window: Window }).window = {
    setTimeout: ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler()
      return 0 as unknown as number
    }) as Window['setTimeout'],
    clearTimeout: (() => void 0) as Window['clearTimeout'],
  } as unknown as Window
  ;(globalThis as unknown as { document: Document }).document = {
    visibilityState: 'hidden',
  } as Document
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(typeof input === 'string' ? input : (input as URL).toString()),
      body: String(init?.body || ''),
    })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const fileOk = await upsertWorkspaceDocsMirrorText({
      workspacePath: '/docs/20260527T123654Z/agentic-os-trace_20260527T123654Z.md',
      text: '# streamed while hidden',
    })
    if (fileOk) {
      throw new Error('expected hidden-document docs mirror writes to be skipped during browser teardown')
    }
    if (calls.some(call => call.url === '/__agentic_os_fs_write')) {
      throw new Error('expected hidden-document docs mirror writes not to call /__agentic_os_fs_write while the page is hidden')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (previousWindow) {
      ;(globalThis as unknown as { window: Window }).window = previousWindow
    } else {
      delete (globalThis as unknown as { window?: Window }).window
    }
    if (previousDocument) {
      ;(globalThis as unknown as { document: Document }).document = previousDocument
    } else {
      delete (globalThis as unknown as { document?: Document }).document
    }
  }
}

export async function testWorkspaceSeedProviderBrowserUpsertChatLogMirrorWritesViaKgFsProxy() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = AG_HUIJOOHWEE_CHAT_LOG_ROOT
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
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(typeof input === 'string' ? input : (input as URL).toString()),
      body: String(init?.body || ''),
    })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const folderOk = await ensureWorkspaceChatMirrorFolder({
      workspacePath: '/chat-log/20260527T123654Z',
    })
    const fileOk = await upsertWorkspaceChatMirrorText({
      workspacePath: '/chat-log/20260527T123654Z/agentic-os-trace_20260527T123654Z.md',
      text: '# streamed',
    })
    if (!folderOk || !fileOk) {
      throw new Error('expected browser chat-log mirror writes to succeed through /__agentic_os_fs_write proxy')
    }
    const folderCall = calls.find(call => call.body.includes('"mkdirOnly":true'))
    if (!folderCall || !folderCall.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260527T123654Z`)) {
      throw new Error('expected chat-log mirror folder creation payload to target sibling chat-log absolute path')
    }
    const fileCall = calls.find(call => call.body.includes('agentic-os-trace_20260527T123654Z.md'))
    if (!fileCall || !fileCall.body.includes(`${AG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260527T123654Z/agentic-os-trace_20260527T123654Z.md`)) {
      throw new Error('expected chat-log mirror file write payload to target sibling chat-log absolute path')
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (previousWindow) {
      ;(globalThis as unknown as { window: Window }).window = previousWindow
    } else {
      delete (globalThis as unknown as { window?: Window }).window
    }
  }
}

export async function testWorkspaceSeedProviderKeepsEmptyAndModelAssetDocsMirrorFiles() {
  const glbBytes = Buffer.from([0x67, 0x6c, 0x54, 0x46])
  await withLocalDocsMirror({
    'empty-placeholder.md': '', 'model.gltf': '{"asset":{"version":"2.0"}}', 'model.glb': glbBytes,
  }, async () => {
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const byRelPath = new Map(mirrored.map(entry => [entry.relPath, entry]))
    if (!byRelPath.has('empty-placeholder.md')) {
      throw new Error(`expected docs mirror to preserve empty GitHub placeholder files, got ${JSON.stringify(mirrored)}`)
    }
    if (byRelPath.get('empty-placeholder.md')?.text !== '') {
      throw new Error('expected empty docs mirror file to stay empty instead of being replaced or dropped')
    }
    if (String(byRelPath.get('model.gltf')?.text || '').trim() !== '{"asset":{"version":"2.0"}}') {
      throw new Error(`expected docs mirror to include GLTF source asset text, got ${JSON.stringify(mirrored)}`)
    }
    if (String(byRelPath.get('model.glb')?.text || '') !== glbBytes.toString('base64')) {
      throw new Error('expected docs mirror to include GLB source assets as base64 text')
    }
  })
}

export async function testWorkspaceSeedProviderReadsDocsMirrorFromSourceFilesState() {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath(AG_HUIJOOHWEE_DOCS_ROOT)
    store.setSourceFiles([
      {
        id: 'sf-remote-video',
        name: 'agentic-graph-video-demo.md',
        text: '# remote source files state',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-video-demo.md` },
      },
      {
        id: 'sf-outside-root',
        name: 'outside.md',
        text: '# outside root should be ignored',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${AG_AGENTIC_OS_DOCS_ROOT}/outside.md` },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('remote source files state')) {
      throw new Error(`expected docs mirror to resolve from sourceFiles state, got ${JSON.stringify(mirrored)}`)
    }
    if (mirrored.some(entry => entry.relPath.includes('outside.md'))) {
      throw new Error(`expected selected-folder filter to exclude outside docs, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
  }
}

export async function testWorkspaceSeedProviderCollapsesRedundantDocsPrefixFromSourceFilesState() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  try {
    delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath(null)
    store.setSourceFiles([
      {
        id: 'sf-docs-double',
        name: 'docs/docs/agentic-graph-video-demo.md',
        text: '# dedupe docs prefix',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'docs/docs/agentic-graph-video-demo.md' },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    if (mirrored.length !== 1 || mirrored[0]?.relPath !== 'agentic-graph-video-demo.md') {
      throw new Error(`expected redundant docs/docs prefix to collapse to single mirror relPath, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
    restore()
  }
}

export async function testWorkspaceSeedProviderResolvesRelativeDocsPathForAbsoluteSelectedFolder() {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath(AG_HUIJOOHWEE_DOCS_ROOT)
    store.setSourceFiles([
      {
        id: 'sf-relative-docs',
        name: 'docs/agentic-graph-video-demo.md',
        text: '# relative docs path should map',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'docs/agentic-graph-video-demo.md' },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('relative docs path should map')) {
      throw new Error(`expected relative docs path to map with absolute selected folder, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
  }
}

export async function testWorkspaceSeedProviderTreatsSelectedFilePathAsSelectedFolder() {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath(`${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-maps-places.md`)
    store.setSourceFiles([
      {
        id: 'sf-selected-file-path',
        name: 'docs/agentic-graph-video-demo.md',
        text: '# selected file path should still include sibling docs',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'docs/agentic-graph-video-demo.md' },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('selected file path should still include sibling docs')) {
      throw new Error(`expected selected markdown file path to normalize to selected folder for docs mirror filtering, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
  }
}
