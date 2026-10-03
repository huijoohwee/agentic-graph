import {
  materializeActiveWorkspaceEntryIntoSourceFiles,
  buildActiveWorkspaceRuntimeSourceFilesSnapshot,
  buildMaterializedWorkspaceActivePathKey,
  reapplyActiveWorkspaceMarkdownDocument,
  shouldProactivelyReapplyActiveWorkspaceMarkdownDocument,
} from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { captureFlightSimTrainingSource } from '@/features/game-flight-sim/flightSimTrainingSource'
import { parseAndApplySourceFile } from '@/features/source-files/sourceFilesParseRuntime'
import { listParsers, registerParser } from '@/features/parsers/registry'
import { ensureBuiltInParsersRegistered } from '@/features/parsers/ensure'

const createMinimalFs = (textByPath: Record<string, string>): WorkspaceFs => ({
  ensureSeed: async () => false,
  listEntries: async () => [],
  readFileText: async path => textByPath[String(path || '').trim()] ?? null,
  writeFileText: async () => void 0,
  createFile: async () => '/docs/tmp.md',
  createFolder: async () => '/docs',
  deleteEntry: async () => void 0,
})

export function testShouldProactivelyReapplyClosedPaneActiveMarkdownDocumentWhenCanvasOwnsClosedPane() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: null,
    markdownDocumentText: '',
  })
  if (shouldReapply !== true) {
    throw new Error(`expected Source Files active-path materialization to reapply the active markdown document, got ${String(shouldReapply)}`)
  }
}

export function testShouldProactivelyReapplyActiveWorkspaceMarkdownDocumentWhenEditorWorkspaceOpen() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: null,
    markdownDocumentText: '',
  })
  if (shouldReapply !== true) {
    throw new Error(`expected Editor Workspace Source Files switching to reapply selected file content/frontmatter to Canvas, got ${String(shouldReapply)}`)
  }
}

export function testShouldProactivelyReapplyClosedPaneActiveMarkdownDocumentDefersMatchingDocumentSuppressionUntilResolvedText() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: '/docs/workspace-readme.md',
    markdownDocumentText: '# Maps Readme',
  })
  if (shouldReapply !== true) {
    throw new Error(`expected matching active markdown document to defer reapply suppression until resolved text is known, got ${String(shouldReapply)}`)
  }
}

export function testShouldProactivelyReapplyClosedPaneActiveMarkdownDocumentWhenMatchingDocumentSuppressedViewPreset() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/runtime-surface-demo.md' as never,
    markdownDocumentName: '/docs/runtime-surface-demo.md',
    markdownDocumentText: '---\nkgCanvasSurfaceMode: "xr"\n---\n# XR Demo',
    markdownDocumentApplyViewPreset: false,
  })
  if (shouldReapply !== true) {
    throw new Error(`expected matching active markdown document with suppressed view preset to replay YAML canvas preset, got ${String(shouldReapply)}`)
  }
}

export function testMaterializedWorkspaceActivePathKeyTracksSelectedContentAndActiveDocumentOnly() {
  const activePath = '/docs/agentic-graph-design-demo.md' as never
  const text = [
    '---',
    'kgCanvas2dRenderer: "design"',
    '---',
    '# Design',
  ].join('\n')
  const base = buildMaterializedWorkspaceActivePathKey({
    activePathOverride: activePath,
    workspaceEntriesSnapshot: [{
      path: activePath,
      parentPath: '/docs' as never,
      kind: 'file',
      name: 'agentic-graph-design-demo.md',
      text,
      updatedAtMs: 1,
    }],
    markdownDocumentName: 'docs/agentic-graph-video-demo.md',
    markdownDocumentText: '# Video',
    markdownDocumentApplyViewPreset: true,
  })
  const applied = buildMaterializedWorkspaceActivePathKey({
    activePathOverride: activePath,
    workspaceEntriesSnapshot: [{
      path: activePath,
      parentPath: '/docs' as never,
      kind: 'file',
      name: 'agentic-graph-design-demo.md',
      text,
      updatedAtMs: 1,
    }],
    markdownDocumentName: 'docs/agentic-graph-design-demo.md',
    markdownDocumentText: text,
    markdownDocumentApplyViewPreset: true,
  })
  const graphSourceOnlyChanged = buildMaterializedWorkspaceActivePathKey({
    activePathOverride: activePath,
    workspaceEntriesSnapshot: [{
      path: activePath,
      parentPath: '/docs' as never,
      kind: 'file',
      name: 'agentic-graph-design-demo.md',
      text,
      updatedAtMs: 1,
    }],
    markdownDocumentName: 'docs/agentic-graph-design-demo.md',
    markdownDocumentText: text,
    markdownDocumentApplyViewPreset: true,
  })
  if (!base || !applied || base === applied) {
    throw new Error('expected active-path materialization key to include selected content and active markdown document ownership')
  }
  if (graphSourceOnlyChanged !== applied) {
    throw new Error('expected active-path materialization key to ignore graph-source churn caused by applying the selected document')
  }
}

export async function testActiveWorkspaceMarkdownReapplyReplaysYamlWhenEditorWorkspaceOpen() {
  const { restore } = initJsdomHarness()
  try {
    const activePath = '/docs/runtime-surface-demo.md'
    const text = [
      '---',
      'kgCanvasSurfaceMode: "xr"',
      'kgCanvas3dMode: "xr"',
      '---',
      '# Runtime Surface Demo',
      '',
      'Canvas state must come from YAML, not file identity.',
    ].join('\n')
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('editor')
    store.setWorkspaceCanvasPaneOpen(true)
    store.setCanvasRenderMode('2d')
    store.setCanvas3dMode('3d')
    store.setMarkdownDocument(activePath, text, {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    useMarkdownExplorerStore.getState().setActivePath(activePath as never)

    await reapplyActiveWorkspaceMarkdownDocument({
      activePathOverride: activePath as never,
      fs: createMinimalFs({ [activePath]: text }),
      activeWorkspaceEntriesSnapshot: [{
        path: activePath as never,
        parentPath: '/docs' as never,
        kind: 'file',
        name: 'runtime-surface-demo.md',
        text,
        updatedAtMs: 1,
      }],
    })

    const next = useGraphStore.getState()
    if (next.markdownDocumentName !== 'docs/runtime-surface-demo.md') {
      throw new Error(`expected active Source Files reapply to use the canonical workspace document key, got ${String(next.markdownDocumentName || '')}`)
    }
    if (next.markdownDocumentApplyViewPreset !== true) {
      throw new Error('expected active Source Files reapply to restore YAML view-preset ownership')
    }
    if (next.canvasRenderMode !== '3d' || next.canvas3dMode !== 'xr') {
      throw new Error(`expected active Source Files YAML to select XR canvas mode, got ${next.canvasRenderMode}/${next.canvas3dMode}`)
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    restore()
  }
}

export function testBuildActiveWorkspaceRuntimeSourceFilesSnapshotIncludesFreshEmptyActiveWorkspaceFile() {
  const activePath = '/chat-log/agenticOs_20260527193000.md'
  const existingTracePath = '/chat-log/20260527T193000Z/agentic-os-trace_20260527T193000Z.md'
  const snapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({
    activePath: activePath as never,
    existingSourceFiles: [
      {
        id: 'old-doc',
        name: 'agentic-graph-animatic-demo.md',
        text: '# old',
        enabled: true,
        source: { kind: 'local', path: resolveWorkspaceSourcePathKey('/docs/agentic-graph-animatic-demo.md') },
        status: 'idle',
      },
      {
        id: 'existing-trace',
        name: 'agentic-os-trace_20260527T193000Z.md',
        text: '# AGENTIC_OS Trace',
        enabled: false,
        source: { kind: 'local', path: resolveWorkspaceSourcePathKey(existingTracePath) },
        status: 'idle',
      },
    ],
    workspaceEntries: [{
      path: activePath as never,
      parentPath: '/chat-log' as never,
      kind: 'file',
      name: 'agenticOs_20260527193000.md',
      text: '',
      updatedAtMs: 1,
    }],
    sourcesByPath: {},
    workspaceDocsOnly: false,
  })
  const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)
  const activeFile = snapshot.runtimeSourceFiles.find(file => String(file?.source?.path || '') === activeSourcePath) || null
  if (!activeFile) {
    throw new Error('expected runtime source-file snapshot to include a fresh empty active workspace file')
  }
  if (activeFile.enabled !== true) {
    throw new Error(`expected fresh empty active workspace file to be enabled, got ${String(activeFile.enabled)}`)
  }
  const preservedSidecar = snapshot.runtimeSourceFiles.find(file => String(file?.source?.path || '') === resolveWorkspaceSourcePathKey(existingTracePath)) || null
  if (!preservedSidecar) {
    throw new Error('expected runtime source-file snapshot to preserve existing canonical chat sidecar files')
  }
  if (preservedSidecar.enabled !== false) {
    throw new Error(`expected preserved canonical chat sidecar file to remain disabled, got ${String(preservedSidecar.enabled)}`)
  }
}


export async function testActiveWorkspaceRefreshPreservesConcurrentSourceChanges() {
  const { restore } = initJsdomHarness()
  const previousGraph = useGraphStore.getState()
  const previousExplorer = useMarkdownExplorerStore.getState()
  try {
    for (const change of ['unchanged', 'selection', 'selection-only', 'source-addition', 'active-edit', 'stale-queued'] as const) {
      const oldPath = '/docs/old.md'
      const nextPath = '/docs/new.md'
      const old: SourceFile = { id: 'refresh-old', name: 'old.md', text: '# Old', enabled: true, status: 'idle',
        source: { kind: 'local' as const, path: `workspace:${oldPath}` } }
      const added: SourceFile = { id: 'refresh-new', name: 'new.md', text: '# New', enabled: true, status: 'idle',
        source: { kind: 'local' as const, path: `workspace:${nextPath}` } }
      useGraphStore.setState({ sourceFiles: [old], markdownDocumentName: 'docs/old.md',
        markdownDocumentText: '# Old', setActiveMarkdownDocument: async () => true })
      useMarkdownExplorerStore.getState().setActivePath(oldPath as never)
      const snapshot = useGraphStore.getState().sourceFiles
      if (change === 'stale-queued') {
        const current = [old, added]
        useGraphStore.setState({ sourceFiles: current })
        await materializeActiveWorkspaceEntryIntoSourceFiles({
          activePathOverride: oldPath as never, sourceFilesSnapshot: snapshot,
          fs: createMinimalFs({ [oldPath]: '# Stale refresh' }), refreshActiveText: true,
        })
        if (useGraphStore.getState().sourceFiles !== current) throw new Error('queued snapshot removed a newer source')
        continue
      }
      let finishRead!: (text: string) => void
      let beginRead!: () => void
      const started = new Promise<void>(resolve => { beginRead = resolve })
      let reads = 0
      const fs = { ...createMinimalFs({}), readFileText: async () => {
        if (++reads > 1) return '# Refreshed old text'
        beginRead()
        return new Promise<string>(resolve => { finishRead = resolve })
      } }
      const pending = materializeActiveWorkspaceEntryIntoSourceFiles({
        activePathOverride: oldPath as never, sourceFilesSnapshot: snapshot,
        fs, refreshActiveText: true,
      })
      await started
      const expectedFiles = change === 'active-edit' ? [{ ...old, text: '# Newer edit' }]
        : change === 'unchanged' || change === 'selection-only' ? snapshot : [old, added]
      if (expectedFiles !== snapshot) useGraphStore.setState({ sourceFiles: expectedFiles })
      if (change === 'selection' || change === 'selection-only') {
        useGraphStore.setState({ markdownDocumentName: 'docs/new.md', markdownDocumentText: '# New' })
        useMarkdownExplorerStore.getState().setActivePath(nextPath as never)
      }
      finishRead('# Refreshed old text')
      await pending
      if (change === 'unchanged') {
        if (useGraphStore.getState().sourceFiles[0]?.text !== '# Refreshed old text') {
          throw new Error('current active source did not refresh')
        }
        continue
      }
      if (useGraphStore.getState().sourceFiles !== expectedFiles) {
        throw new Error(`delayed active refresh overwrote concurrent ${change}`)
      }
      if ((change === 'selection' || change === 'selection-only')
        && useGraphStore.getState().markdownDocumentName !== 'docs/new.md') {
        throw new Error('delayed active refresh changed the selected document')
      }
    }
    let resolveText!: (text: string) => void
    let applied = false
    useMarkdownExplorerStore.getState().setActivePath('/docs/edit.md' as never)
    useGraphStore.setState({ markdownDocumentName: 'docs/edit.md', markdownDocumentText: '# Before',
      setActiveMarkdownDocument: async () => { applied = true; return true } })
    const reapply = reapplyActiveWorkspaceMarkdownDocument({
      fs: { ...createMinimalFs({}), readFileText: () => new Promise(resolve => { resolveText = resolve }) },
    })
    await Promise.resolve()
    useGraphStore.setState({ markdownDocumentText: '# Newer unsaved edit' })
    resolveText('# Stale disk text')
    if (await reapply || applied) throw new Error('delayed disk read replaced an in-flight editor change')
  } finally {
    useGraphStore.setState(previousGraph, true)
    useMarkdownExplorerStore.setState(previousExplorer, true)
    restore()
  }
}

export async function testNativeMaterializationParsesExactSourceBeforeDocumentAdmission() {
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const path = '/docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md'
  const text = readFileSync(resolve(process.cwd(), '..', path.slice(1)), 'utf8')
  const graph = previous.graphData
  try {
    for (const body of [text, 'Unsupported document text', '']) {
      let applied = false
      const entry = { path: path as never, parentPath: '/docs/workspace-seeds' as never,
        kind: 'file' as const, name: path.split('/').pop()!, text: body, updatedAtMs: 1 }
      useGraphStore.setState({ sourceFiles: [], markdownDocumentName: 'before.md', markdownDocumentText: '# Before',
        graphData: graph, setActiveMarkdownDocument: async payload => {
          const state = useGraphStore.getState(), source = state.sourceFiles[0]
          if (state.graphData !== graph) throw new Error('source parsing replaced the caller-owned graph')
          if (body === text && (source.status !== 'parsed' || source.text !== text || !source.enabled || !source.parsedGraphData)) {
            throw new Error('native source was not parsed before publishing its document')
          }
          useGraphStore.setState({ markdownDocumentName: payload.name, markdownDocumentText: payload.text })
          applied = true
          return true
        } })
      useMarkdownExplorerStore.getState().setActivePath(path as never)
      await materializeActiveWorkspaceEntryIntoSourceFiles({ activePathOverride: path as never,
        fs: createMinimalFs({ [path]: body }), workspaceEntries: [entry], activeWorkspaceEntriesSnapshot: [entry] })
      if (!applied) throw new Error('materialization blocked a readable native document')
      if (body === text) {
        const capture = captureFlightSimTrainingSource()
        if (!capture.profile || !capture.geographicReference || capture.sourceText !== text) throw new Error('native producer/parser source failed strict admission')
        const source = useGraphStore.getState().sourceFiles[0]
        const revision = source.parsedGraphRevision
        await parseAndApplySourceFile(source.id, { applyComposedGraph: false })
        if (useGraphStore.getState().sourceFiles[0].parsedGraphRevision !== revision || useGraphStore.getState().graphData !== graph) {
          throw new Error('cached parser replay mutated graph or source revision')
        }
      }
    }
  } finally { useGraphStore.setState(previous, true); useMarkdownExplorerStore.setState(explorer, true) }
}

export async function testNativeMaterializationParseFencesConcurrentSelectionAndSources() {
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  try {
    for (const change of ['selection', 'document-edit', 'source-edit', 'source-path', 'source-addition', 'join'] as const) {
      const path = '/docs/parse-fence.md', text = '# Native source\n\nA source node.'
      const snapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({ activePath: path as never, existingSourceFiles: [],
        workspaceEntries: [{ path: path as never, parentPath: '/docs' as never, kind: 'file', name: 'parse-fence.md', text, updatedAtMs: 1 }], sourcesByPath: {} })
      let applied = false, changed = false, joined: Promise<void> | undefined
      useGraphStore.setState({ sourceFiles: snapshot.runtimeSourceFiles, markdownDocumentName: 'before.md', markdownDocumentText: '# Before',
        setActiveMarkdownDocument: async () => { applied = true; return true } })
      useMarkdownExplorerStore.getState().setActivePath(path as never)
      const stop = useGraphStore.subscribe(state => {
        const file = state.sourceFiles.find(value => value.source?.path === `workspace:${path}`)
        if (changed || file?.status !== 'loading') return
        changed = true
        queueMicrotask(() => {
          if (change === 'join') { joined = parseAndApplySourceFile(file.id, { applyComposedGraph: false }); return }
          if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/docs/new.md' as never)
          if (change === 'document-edit') useGraphStore.setState({ markdownDocumentText: '# Unsaved new document' })
          if (change === 'source-edit') useGraphStore.getState().updateSourceFile(file.id, { text: '# Newer source', status: 'idle' })
          if (change === 'source-path') useGraphStore.getState().updateSourceFile(file.id, { source: { kind: 'local', path: 'workspace:/docs/new.md' }, status: 'idle' })
          if (change === 'source-addition') useGraphStore.setState({ sourceFiles: [...useGraphStore.getState().sourceFiles,
            { id: 'new-source', name: 'new.md', text: '# New', enabled: true, status: 'idle' }] })
        })
      })
      try {
        await materializeActiveWorkspaceEntryIntoSourceFiles({ activePathOverride: path as never, fs: createMinimalFs({ [path]: text }) })
        await joined
        if (applied !== (change === 'join')) throw new Error(`native parse published a stale ${change} document`)
        const current = useGraphStore.getState()
        if (change === 'join' && current.sourceFiles[0].status !== 'parsed') throw new Error('joined native parse settled before its source')
        if (change === 'source-addition' && !current.sourceFiles.some(file => file.id === 'new-source')) throw new Error('parse removed a concurrent source')
        if (change === 'source-edit' && current.sourceFiles[0].text !== '# Newer source') throw new Error('parse overwrote newer source text')
        if (change === 'document-edit' && current.markdownDocumentText !== '# Unsaved new document') throw new Error('parse overwrote unsaved document text')
      } finally { stop() }
    }
  } finally { useGraphStore.setState(previous, true); useMarkdownExplorerStore.setState(explorer, true) }
}

export async function testNativeSourceParseSynchronousSubscriberJoinsOneExactJob() {
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  ensureBuiltInParsersRegistered()
  const original = listParsers().find(value => String(value.id) === 'markdown')!
  let count = 0, joined: Promise<void> | undefined, applied = false
  registerParser({ ...original, parse: (name, text) => { count += 1; return original.parse(name, text) },
    ...(original.parseAsync ? { parseAsync: async (name, text) => { count += 1; return original.parseAsync!(name, text) } } : {}) })
  const path = '/docs/synchronous-native-join.md', text = '# Exact reentrant native source\n\nOne native parser invocation.'
  const entry = { path: path as never, parentPath: '/docs' as never, kind: 'file' as const,
    name: 'synchronous-native-join.md', text, updatedAtMs: 1 }
  const snapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({ activePath: path as never,
    existingSourceFiles: [], workspaceEntries: [entry], sourcesByPath: {} })
  useGraphStore.setState({ sourceFiles: snapshot.runtimeSourceFiles, markdownDocumentName: 'before.md', markdownDocumentText: '# Before',
    setActiveMarkdownDocument: async () => { applied = true; return true } })
  useMarkdownExplorerStore.getState().setActivePath(path as never)
  const stop = useGraphStore.subscribe(state => {
    const file = state.sourceFiles[0]
    if (!joined && file.status === 'loading') joined = parseAndApplySourceFile(file.id, { applyComposedGraph: false })
  })
  try {
    await materializeActiveWorkspaceEntryIntoSourceFiles({ activePathOverride: path as never,
      fs: createMinimalFs({ [path]: text }), activeWorkspaceEntriesSnapshot: [entry] })
    await joined
    const file = useGraphStore.getState().sourceFiles[0]
    if (!applied || !joined || count !== 1 || file.status !== 'parsed' || file.parsedGraphRevision !== 0) {
      throw new Error(`synchronous native parse reentry failed: count=${count}, status=${file.status}, revision=${file.parsedGraphRevision}`)
    }
  } finally { stop(); registerParser(original); useGraphStore.setState(previous, true); useMarkdownExplorerStore.setState(explorer, true) }
}
