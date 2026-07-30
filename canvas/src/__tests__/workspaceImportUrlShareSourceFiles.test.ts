import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  readWorkspaceImportShareExportRootPathSetting,
  writeWorkspaceImportShareExportRootPathSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'

const waitForMs = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export async function testWorkspaceImportUrlShareThinkingArtifactIsSourceFileVisible(): Promise<void> {
  const { restore } = initJsdomHarness()
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousShareRoot = readWorkspaceImportShareExportRootPathSetting()
  const previousSourceFiles = useGraphStore.getState().sourceFiles
  const previousFetch = globalThis.fetch
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-share-source-files-'))
  const mirrorWriteCalls: Array<{ url: string; body: string }> = []
  const shareUrl = 'https://example.test/chat/shared-research-run'
  const title = 'Research trajectory simulation 20260407'
  const token = 'Research-trajectory-simulation-20260407'
  const markdownPath = `/docs_/${token}/${token}.md`
  const thinkingPath = `/docs_/${token}/${token}-thinking.md`
  try {
    useGraphStore.getState().setSourceFiles([])
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    writeWorkspaceImportShareExportRootPathSetting('/docs_')
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mirrorWriteCalls.push({
        url: String(typeof input === 'string' ? input : input.toString()),
        body: String(init?.body || ''),
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: shareUrl,
      parentPath: '/',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'claude-share.md',
        title,
        text: '# Claude Share\n',
        thinkingText: '# Thinking\n\n- visible in Source Files\n',
      }),
    })
    if (!result.sources.some(item => item.path === markdownPath && item.source.kind === 'url')) {
      throw new Error(`expected title-derived share markdown artifact to be registered as a URL source, got ${JSON.stringify(result.sources)}`)
    }
    if (!result.sources.some(item => item.path === thinkingPath && item.source.kind === 'url')) {
      throw new Error(`expected share thinking artifact to be registered as a URL source, got ${JSON.stringify(result.sources)}`)
    }
    const expectedMarkdownMirrorPath = path.join(tempRoot, 'docs_', token, `${token}.md`)
    const markdownWriteCall = mirrorWriteCalls.find(call => call.url === '/__kg_fs_write' && call.body.includes(expectedMarkdownMirrorPath))
    if (!markdownWriteCall || !markdownWriteCall.body.includes('# Claude Share')) {
      throw new Error(`expected title-derived share markdown artifact to be mirrored under /docs_, got ${JSON.stringify(mirrorWriteCalls)}`)
    }
    const expectedThinkingMirrorPath = path.join(tempRoot, 'docs_', token, `${token}-thinking.md`)
    const thinkingWriteCall = mirrorWriteCalls.find(call => call.url === '/__kg_fs_write' && call.body.includes(expectedThinkingMirrorPath))
    if (!thinkingWriteCall || !thinkingWriteCall.body.includes('visible in Source Files')) {
      throw new Error(`expected title-derived share thinking artifact to be mirrored under /docs_, got ${JSON.stringify(mirrorWriteCalls)}`)
    }
    const sourcesByPath = Object.fromEntries(result.sources.map(item => [item.path, item.source])) as WorkspaceSourceIndex
    const sourceFiles = mergeWorkspaceEntriesIntoSourceFiles({
      existing: [],
      workspaceEntries: await fs.listEntries(),
      sourcesByPath,
      workspaceDocsOnly: true,
      workspaceSourceRootPaths: ['/docs_', '/docs', '/chat-log'],
    })
    const thinking = sourceFiles.find(file => file.source?.path === `workspace:${thinkingPath}`)
    if (!thinking) throw new Error('expected imported thinking artifact under /docs_ to remain visible in Source Files')
    if (!String(thinking.text || '').includes('visible in Source Files')) {
      throw new Error(`expected visible thinking Source File to keep imported text, got ${JSON.stringify(thinking)}`)
    }
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: result.createdPaths,
      opts: {
        applyToGraph: false,
        workspaceEntries: await fs.listEntries(),
        sourcesByPath,
      },
    })
    const storeThinking = useGraphStore.getState().sourceFiles.find(file => file.source?.path === `workspace:${thinkingPath}`)
    if (!storeThinking) {
      throw new Error('expected canvas import apply to preserve generated share thinking artifact in Source Files')
    }
  } finally {
    useGraphStore.getState().setSourceFiles(previousSourceFiles)
    writeWorkspaceImportShareExportRootPathSetting(previousShareRoot)
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
    restore()
  }
}

export async function testWorkspaceImportUrlShareThinkingTaskDoesNotBlockFinalDocumentCommit(): Promise<void> {
  const { restore } = initJsdomHarness()
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousShareRoot = readWorkspaceImportShareExportRootPathSetting()
  const previousSourceFiles = useGraphStore.getState().sourceFiles
  const previousFetch = globalThis.fetch
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-share-background-thinking-'))
  const mirrorWriteCalls: Array<{ url: string; body: string }> = []
  const shareUrl = 'https://example.test/chat/background-research-run'
  const title = 'Background trajectory simulation 20260408'
  const token = 'Background-trajectory-simulation-20260408'
  const thinkingPath = `/docs_/${token}/${token}-thinking.md`
  let resolveThinking: ((value: string) => void) | null = null
  const thinkingTextTask = new Promise<string>(resolve => {
    resolveThinking = resolve
  })
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    writeWorkspaceImportShareExportRootPathSetting('/docs_')
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mirrorWriteCalls.push({ url: String(typeof input === 'string' ? input : input.toString()), body: String(init?.body || '') })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const startedAt = Date.now()
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: shareUrl,
      parentPath: '/',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'share.md',
        title,
        text: '# Share\n',
        thinkingTextTask,
      }),
    })
    if (Date.now() - startedAt > 1000) throw new Error('expected pending thinking side task to avoid blocking final document commit')
    if (result.sources.some(item => item.path === thinkingPath)) {
      throw new Error(`expected pending thinking artifact to wait for non-empty content before Source Files registration, got ${JSON.stringify(result.sources)}`)
    }
    const initialThinkingText = await fs.readFileText(thinkingPath)
    if (initialThinkingText !== null) throw new Error(`expected pending thinking artifact to avoid an empty placeholder file, got ${JSON.stringify(initialThinkingText)}`)
    resolveThinking?.('# Thinking\n\n- delayed Source Files update\n')
    let finalThinkingText = ''
    for (let i = 0; i < 60; i += 1) {
      await waitForMs(20)
      finalThinkingText = String((await fs.readFileText(thinkingPath)) || '')
      if (finalThinkingText.includes('delayed Source Files update')) break
    }
    if (!finalThinkingText.includes('delayed Source Files update')) {
      throw new Error(`expected background thinking task to update generated Source File, got ${JSON.stringify(finalThinkingText)}`)
    }
    if (!mirrorWriteCalls.some(call => call.url === '/__kg_fs_write' && call.body.includes('delayed Source Files update'))) {
      throw new Error(`expected background thinking update to mirror into docs root, got ${JSON.stringify(mirrorWriteCalls)}`)
    }
  } finally {
    resolveThinking?.('')
    writeWorkspaceImportShareExportRootPathSetting(previousShareRoot)
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
    restore()
  }
}

export async function testWorkspaceImportUrlShareImportSkipsEmptyThinkingArtifact(): Promise<void> {
  const { restore } = initJsdomHarness()
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousShareRoot = readWorkspaceImportShareExportRootPathSetting()
  const previousSourceFiles = useGraphStore.getState().sourceFiles
  const previousFetch = globalThis.fetch
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-share-no-thinking-'))
  const mirrorWriteCalls: Array<{ url: string; body: string }> = []
  const shareUrl = 'https://example.test/chat/no-thinking-run'
  const token = 'No-thinking-panel-share'
  const markdownPath = `/docs_/${token}/${token}.md`
  const thinkingPath = `/docs_/${token}/${token}-thinking.md`
  try {
    useGraphStore.getState().setSourceFiles([{
      id: 'stale-empty-thinking',
      name: `${token}-thinking.md`,
      text: '',
      enabled: false,
      status: 'idle',
      source: { kind: 'url', url: shareUrl, path: `workspace:${thinkingPath}` },
    }])
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    writeWorkspaceImportShareExportRootPathSetting('/docs_')
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mirrorWriteCalls.push({ url: String(typeof input === 'string' ? input : input.toString()), body: String(init?.body || '') })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: shareUrl,
      parentPath: '/',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'share.md',
        title: 'No thinking panel share',
        text: '# Share without thinking panel\n',
      }),
    })
    if (!result.sources.some(item => item.path === markdownPath && item.source.kind === 'url')) {
      throw new Error(`expected share markdown artifact to remain registered, got ${JSON.stringify(result.sources)}`)
    }
    if (result.sources.some(item => item.path === thinkingPath)) {
      throw new Error(`expected share import without thinking text to avoid registering an empty sidecar, got ${JSON.stringify(result.sources)}`)
    }
    if (!result.removedPaths?.includes(thinkingPath)) {
      throw new Error(`expected share import without thinking text to request stale sidecar removal, got ${JSON.stringify(result.removedPaths || [])}`)
    }
    if ((await fs.readFileText(thinkingPath)) !== null) throw new Error('expected share import without thinking text to avoid creating an empty thinking file')
    const expectedThinkingMirrorPath = path.join(tempRoot, 'docs_', token, `${token}-thinking.md`)
    if (mirrorWriteCalls.some(call => call.url === '/__kg_fs_write' && call.body.includes(expectedThinkingMirrorPath))) {
      throw new Error(`expected share import without thinking text to avoid mirroring an empty thinking file, got ${JSON.stringify(mirrorWriteCalls)}`)
    }
    const sourcesByPath = Object.fromEntries(result.sources.map(item => [item.path, item.source])) as WorkspaceSourceIndex
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: result.createdPaths,
      opts: {
        applyToGraph: false,
        workspaceEntries: await fs.listEntries(),
        sourcesByPath,
        ...(result.removedPaths ? { removedPaths: result.removedPaths } : {}),
      },
    })
    if (useGraphStore.getState().sourceFiles.some(file => file.source?.path === `workspace:${thinkingPath}`)) {
      throw new Error('expected stale empty thinking Source File to be pruned from the workspace UI')
    }
  } finally {
    useGraphStore.getState().setSourceFiles(previousSourceFiles)
    writeWorkspaceImportShareExportRootPathSetting(previousShareRoot)
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    await rm(tempRoot, { recursive: true, force: true })
    restore()
  }
}

export function testConfiguredDocsRootWorkspaceFileIsVisibleWithoutLegacySourceIndex(): void {
  const token = '6706219f-f8d2-418a-90a9-aae18de752a7'
  const thinkingPath = `/docs_/${token}/${token}-thinking.md`
  const sourceFiles = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      {
        kind: 'file',
        path: thinkingPath as never,
        parentPath: `/docs_/${token}` as never,
        name: `${token}-thinking.md`,
        text: '# Already imported thinking\n',
        updatedAtMs: 1,
      },
      {
        kind: 'file',
        path: '/scratch/hidden.md' as never,
        parentPath: '/scratch' as never,
        name: 'hidden.md',
        text: '# Hidden',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: {},
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs_', '/docs', '/chat-log'],
  })
  const thinking = sourceFiles.find(file => file.source?.path === `workspace:${thinkingPath}`)
  if (!thinking) throw new Error('expected existing /docs_ workspace artifact to be visible without legacy source-index metadata')
  const hidden = sourceFiles.find(file => file.source?.path === 'workspace:/scratch/hidden.md')
  if (hidden) throw new Error('expected docs-only Source Files mode to keep non-root workspace files hidden')
}

export function testSourceFilesMergeDropsMissingEmptyWorkspaceArtifact(): void {
  const thinkingPath = '/docs_/missing-share/missing-share-thinking.md'
  const sourceFiles = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [{
      id: 'stale-empty',
      name: 'missing-share-thinking.md',
      text: '',
      enabled: false,
      status: 'idle',
      source: { kind: 'url', url: 'https://example.test/chat/missing-share', path: `workspace:${thinkingPath}` },
    }],
    workspaceEntries: [{
      kind: 'file',
      path: thinkingPath as never,
      parentPath: '/docs_/missing-share' as never,
      name: 'missing-share-thinking.md',
      text: '',
      updatedAtMs: 1,
    }],
    sourcesByPath: { [thinkingPath]: { kind: 'url', url: 'https://example.test/chat/missing-share' } },
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs_', '/docs', '/chat-log'],
  })
  if (sourceFiles.some(file => file.source?.path === `workspace:${thinkingPath}`)) {
    throw new Error('expected missing empty workspace artifacts to be dropped instead of preserved as stale Source Files')
  }
}

export function testViteDevServerIgnoresWorkspaceMirrorOutputRoots(): void {
  const text = readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8')
  const helperText = readFileSync(path.resolve(process.cwd(), 'viteWorkspaceMirrorWatch.ts'), 'utf8')
  if (!text.includes('buildWorkspaceMirrorWatchIgnoredRoots')) {
    throw new Error('expected Vite dev server to derive workspace mirror watch-ignored roots from configured docs/chat-log roots')
  }
  if (!text.includes('createWorkspaceMirrorWatchPathIgnore')) {
    throw new Error('expected Vite dev server to ignore generated workspace mirror writes before they trigger full-page reload')
  }
  if (!text.includes('ignored: [...DEFAULT_VITE_WATCH_IGNORED, createWorkspaceMirrorWatchPathIgnore')) {
    throw new Error('expected Vite watch ignored config to preserve default ignores and add workspace mirror output roots')
  }
  if (!helperText.includes('`${docsBasename}_`')) {
    throw new Error('expected derived share-export sibling root such as /docs_ to be ignored without hardcoding a URL or artifact name')
  }
  if (!text.includes('mutableSourcePath: process.env.VITE_WORKSPACE_MUTABLE_SOURCE_ABS_PATH')) {
    throw new Error('expected collaboration smoke mutable source writes to be ignored without disabling source persistence')
  }
  if (!helperText.includes("push(String(args.mutableSourcePath || ''))")) {
    throw new Error('expected the bounded mutable source path to join the Vite watch ignore contract')
  }
}

export function testViteKgFsWriteHandlerAcceptsMirrorMkdirOnlyRequests(): void {
  const text = readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8')
  const mkdirBranchIndex = text.indexOf('if (mkdirOnly) {')
  const extensionGateIndex = text.indexOf("const ext = String(path.extname(absPath) || '').toLowerCase()")
  if (mkdirBranchIndex < 0 || extensionGateIndex < 0 || mkdirBranchIndex > extensionGateIndex) {
    throw new Error('expected /__kg_fs_write mkdirOnly requests to be handled before file-extension validation')
  }
  const mkdirBranch = text.slice(mkdirBranchIndex, extensionGateIndex)
  if (!mkdirBranch.includes('await fs.mkdir(requestedAbsPath, { recursive: true })')) {
    throw new Error('expected /__kg_fs_write mkdirOnly requests to create the requested directory path')
  }
  if (!mkdirBranch.includes('if (!isAllowed(requestedAbsPath))')) {
    throw new Error('expected /__kg_fs_write mkdirOnly requests to keep the shared allowed-root guard')
  }
}
