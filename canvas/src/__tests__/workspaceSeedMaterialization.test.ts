import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { createWorkspaceStartupSourceRootEntriesReader, resolveExistingWorkspaceStartupCanonicalPath, resolveWorkspaceStartupActivePathToApply, shouldInitializeWorkspaceStartupDefaultStarter } from '@/features/source-files/sourceFilesRuntimeStartup'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { buildInitialWorkspaceStartupSnapshot, buildMaterializedWorkspaceActivePathKey, buildMaterializedWorkspaceForceIncludePaths, hydrateWorkspaceEntriesInlineText, materializeActiveWorkspaceEntryIntoSourceFiles, readReusableWorkspaceEntriesSnapshot, readWorkspaceActiveEntrySnapshot, resolveMaterializedWorkspaceActivePath } from '@/features/source-files/sourceFilesRuntimeShared'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { TEST_VALIDATION_WORKSPACE_SEED_PATH, WORKSPACE_README_SEED_PATH } from '@/features/workspace-fs/workspaceFs'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'

export async function testWorkspaceBootstrapMaterializesActiveWorkspaceEntryIntoParsedSourceFile() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        {
          path: '/huijoohwee.github.io/template/agentic-graph-video-script-template.md',
          parentPath: '/huijoohwee.github.io/template',
          kind: 'file',
          name: 'agentic-graph-video-script-template.md',
          text: [
            '---',
            'title: "agentic-graph · Video Script Template"',
            'kgCanvasRenderMode: "2d"',
            'kgCanvas2dRenderer: "storyboard"',
            'kgDocumentSemanticMode: "document"',
            'kgFrontmatterModeEnabled: true',
            'flow:',
            '  nodes:',
            '    - id: start',
            '      label: Start',
            '      type: Text',
            '    - id: end',
            '      label: End',
            '      type: Text',
            '  edges:',
            '    - id: e1',
            '      source: start',
            '      target: end',
            '      type: bezier',
            '---',
            '',
            '# Validation',
            '',
            'Bootstrap parse should materialize this file.',
          ].join('\n'),
          updatedAtMs: 1,
        },
      ],
    })
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: '/huijoohwee.github.io/template/agentic-graph-video-script-template.md' as never,
      fs,
      applyToGraph: true,
    })
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const state = useGraphStore.getState()
    const sourceFile = state.sourceFiles.find(
      file => file.source?.path === 'workspace:/huijoohwee.github.io/template/agentic-graph-video-script-template.md',
    )
    if (!sourceFile) {
      throw new Error('expected bootstrap materialization to mirror the active workspace file into Source Files')
    }
    if (sourceFile.enabled !== true) {
      throw new Error('expected active workspace bootstrap materialization to keep the source file enabled')
    }
    if (sourceFile.status !== 'parsed') {
      throw new Error(`expected bootstrap materialization to parse the active workspace file, got ${String(sourceFile.status || '')}`)
    }
    if (!sourceFile.parsedGraphData || (sourceFile.parsedGraphData.nodes || []).length < 2) {
      throw new Error('expected bootstrap materialization to populate parsedGraphData for the active workspace file')
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceBootstrapMaterializeReusesProvidedWorkspaceSnapshotWithoutExtraListEntries() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const baseFs = createMemoryWorkspaceFs()
    let listEntriesCalls = 0
    const fs: WorkspaceFs = {
      ...baseFs,
      listEntries: async () => {
        listEntriesCalls += 1
        return baseFs.listEntries()
      },
    }
    await fs.ensureSeed()
    const workspaceEntries = await fs.listEntries()
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: WORKSPACE_README_SEED_PATH as never,
      fs,
      workspaceEntries,
      sourcesByPath: {},
      applyToGraph: true,
    })
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    if (listEntriesCalls !== 1) {
      throw new Error(`expected bootstrap materialization to reuse provided workspace entries, got ${String(listEntriesCalls)} listEntries calls`)
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceBootstrapMaterializeDoesNotApplyGraphWithoutExplicitOptIn() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        {
          path: '/notes/imported.md',
          parentPath: '/notes',
          kind: 'file',
          name: 'imported.md',
          text: [
            '---',
            'title: Imported',
            'kgCanvasRenderMode: "2d"',
            'kgCanvas2dRenderer: "storyboard"',
            'kgDocumentSemanticMode: "document"',
            'kgFrontmatterModeEnabled: true',
            'flow:',
            '  nodes:',
            '    - id: a',
            '      type: Text',
            '      label: A',
            '    - id: b',
            '      type: Text',
            '      label: B',
            '  edges:',
            '    - id: e1',
            '      source: a',
            '      target: b',
            '---',
            '',
            '# Imported',
          ].join('\n'),
          updatedAtMs: 1,
        },
      ],
    })
    const state = useGraphStore.getState()
    state.setGraphData({ nodes: [{ id: 'keep', type: 'Text', x: 0, y: 0 } as never], edges: [] as never, metadata: {} as never } as never)
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: '/notes/imported.md' as never,
      fs,
    })
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const after = useGraphStore.getState()
    if (!after.graphData || (after.graphData.nodes || []).length !== 1 || String(after.graphData.nodes?.[0]?.id || '') !== 'keep') {
      throw new Error('expected bootstrap workspace materialization to avoid graph apply unless explicitly opted in')
    }
    const sourceFile = after.sourceFiles.find(file => file.source?.path === 'workspace:/notes/imported.md')
    if (!sourceFile) {
      throw new Error('expected bootstrap workspace materialization to still mirror the active file into Source Files')
    }
    if (sourceFile.enabled !== true) {
      throw new Error('expected bootstrap workspace materialization to keep the active source file enabled without applying graph state')
    }
  } finally {
    restore()
  }
}

export function testWorkspaceBootstrapMaterializeNormalizesActiveWorkspacePathResolution() {
  const normalizedFromOverride = resolveMaterializedWorkspaceActivePath({
    activePathOverride: ' workspace:/notes/demo.md/ ' as never,
  })
  if (normalizedFromOverride !== '/notes/demo.md') {
    throw new Error(`expected workspace materialization active-path helper to normalize override paths, got ${String(normalizedFromOverride)}`)
  }

  const normalizedFromExplorer = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: '\\notes\\demo.md\\' as never,
  })
  if (normalizedFromExplorer !== '/notes/demo.md') {
    throw new Error(`expected workspace materialization active-path helper to normalize explorer paths, got ${String(normalizedFromExplorer)}`)
  }

  const missing = resolveMaterializedWorkspaceActivePath({
    activePathOverride: ' / ' as never,
  })
  if (missing !== null) {
    throw new Error('expected workspace materialization active-path helper to treat the workspace root as a non-materializable file path')
  }

  const key = buildMaterializedWorkspaceActivePathKey({
    explorerActivePath: 'workspace:/notes/demo.md/' as never,
  })
  const equivalentKey = buildMaterializedWorkspaceActivePathKey({ activePathOverride: '/notes/demo.md' as never })
  if (!key || key !== equivalentKey) throw new Error(`expected workspace materialization active-path key helper to hash equivalent normalized path strings identically, got ${String(key)} and ${String(equivalentKey)}`)

  const forceIncludePaths = buildMaterializedWorkspaceForceIncludePaths({ explorerActivePath: 'workspace:/notes/demo.md/' as never })
  if (forceIncludePaths.length !== 1 || forceIncludePaths[0] !== '/notes/demo.md') {
    throw new Error('expected workspace materialization force-include helper to reuse the canonical normalized active workspace path')
  }
}

export async function testWorkspaceBootstrapMaterializeSharedSnapshotHelpersCentralizeReuseRules() {
  const pathA = '/notes/snapshot-a.md'
  const pathB = '/notes/snapshot-b.md'
  const baseFs = createMemoryWorkspaceFs({ initialEntries: [
    { kind: 'file', path: pathA, parentPath: '/notes', name: 'snapshot-a.md', text: '# before', updatedAtMs: 1 },
    { kind: 'file', path: pathB, parentPath: '/notes', name: 'snapshot-b.md', text: '# second', updatedAtMs: 1 },
  ] })
  let listEntriesCalls = 0
  let readFileTextCalls = 0
  const fs: WorkspaceFs = {
    ...baseFs,
    listEntries: async () => {
      listEntriesCalls += 1
      return baseFs.listEntries()
    },
    readFileText: async path => {
      readFileTextCalls += 1
      return baseFs.readFileText(path)
    },
  }
  const workspaceEntries = await fs.listEntries()

  const reused = await readWorkspaceActiveEntrySnapshot({ fs, activePath: pathA, workspaceEntries })
  if (reused.length !== 1 || reused[0]?.path !== pathA || reused[0]?.text !== '# before') {
    throw new Error(`expected shared workspace active snapshot helper to return only the active entry from a provided snapshot, got ${JSON.stringify(reused)}`)
  }
  reused[0]!.text = '# caller changed its returned projection'
  if (workspaceEntries.find(entry => entry.path === pathA)?.text !== '# before') {
    throw new Error('expected a returned active entry to preserve the supplied snapshot')
  }

  const activeOnly = await readWorkspaceActiveEntrySnapshot({ fs, activePath: pathB })
  if (activeOnly.length !== 1 || activeOnly[0]?.path !== pathB || activeOnly[0]?.text !== '# second') {
    throw new Error(`expected shared workspace active snapshot helper to read only the requested active file when no snapshot is provided, got ${JSON.stringify(activeOnly)}`)
  }
  if (listEntriesCalls !== 1 || readFileTextCalls !== 1) {
    throw new Error(`expected the supplied snapshot to avoid IO and only the absent snapshot to read its file, got ${String(listEntriesCalls)} listEntries and ${String(readFileTextCalls)} readFileText calls`)
  }

  const reusableSnapshot = readReusableWorkspaceEntriesSnapshot(workspaceEntries)
  if (reusableSnapshot !== workspaceEntries) {
    throw new Error('expected shared workspace snapshot reuse helper to keep non-empty snapshots intact')
  }
  if (readReusableWorkspaceEntriesSnapshot([]) !== undefined) {
    throw new Error('expected shared workspace snapshot reuse helper to drop empty snapshots so callers can relist when needed')
  }

  const skippedSnapshot = buildInitialWorkspaceStartupSnapshot({
    currentActivePath: '/README.md' as never,
    desiredActivePath: '/README.md' as never,
    workspaceEntries,
    lastSetActivePath: true,
    preferCustomValidationSeed: false,
  })
  if (skippedSnapshot.activePath !== '/README.md' || skippedSnapshot.workspaceEntries.length !== 0) {
    throw new Error('expected shared startup snapshot helper to reuse the current active path while omitting redundant workspace relist payloads')
  }

  const changedSnapshot = buildInitialWorkspaceStartupSnapshot({
    currentActivePath: '/README.md' as never,
    desiredActivePath: '/notes/demo.md' as never,
    workspaceEntries,
    lastSetActivePath: true,
    preferCustomValidationSeed: false,
  })
  if (changedSnapshot.activePath !== '/notes/demo.md' || changedSnapshot.workspaceEntries !== workspaceEntries) {
    throw new Error('expected shared startup snapshot helper to preserve the provided snapshot when startup must materialize a different active file')
  }

  const canonicalExisting = resolveExistingWorkspaceStartupCanonicalPath({
    activePath: '/demo.md' as never,
    workspaceEntries: [
      { kind: 'folder', path: '/docs' as never, parentPath: '/', name: 'docs', updatedAtMs: 1 },
      { kind: 'file', path: '/docs/demo.md' as never, parentPath: '/docs', name: 'demo.md', text: '', updatedAtMs: 1 },
    ],
  })
  if (canonicalExisting !== '/docs/demo.md') {
    throw new Error(`expected startup active-path resolver to canonicalize only existing file entries, got ${String(canonicalExisting)}`)
  }

  const missingExisting = resolveExistingWorkspaceStartupCanonicalPath({
    activePath: '/missing.md' as never,
    workspaceEntries: [
      { kind: 'folder', path: '/docs' as never, parentPath: '/', name: 'docs', updatedAtMs: 1 },
      { kind: 'file', path: '/docs/demo.md' as never, parentPath: '/docs', name: 'demo.md', text: '', updatedAtMs: 1 },
    ],
  })
  if (missingExisting !== null) {
    throw new Error(`expected startup active-path resolver to reject missing file entries without fallback remapping, got ${String(missingExisting)}`)
  }

  const staleStartupApply = resolveWorkspaceStartupActivePathToApply({
    currentActivePath: '/docs/old.md' as never,
    latestActivePath: '/docs/new.md' as never,
    snapshotActivePath: '/docs/old.md' as never,
    preferCustomValidationSeed: false,
  })
  if (staleStartupApply !== null) {
    throw new Error(`expected delayed startup active-path apply to preserve a newer user-selected file, got ${String(staleStartupApply)}`)
  }

  const defaultStartupApply = resolveWorkspaceStartupActivePathToApply({
    currentActivePath: null,
    latestActivePath: null,
    snapshotActivePath: '/docs/default.md' as never,
    preferCustomValidationSeed: false,
  })
  if (defaultStartupApply !== '/docs/default.md') {
    throw new Error(`expected initial startup active-path apply to initialize when no newer selection exists, got ${String(defaultStartupApply)}`)
  }

  if (shouldInitializeWorkspaceStartupDefaultStarter({
    activePath: '/docs/selected.md' as never,
    hasDesiredActiveText: false,
    preferCustomValidationSeed: false,
  })) {
    throw new Error('expected startup default initialization to preserve an explicit active path while its text snapshot hydrates')
  }

  if (!shouldInitializeWorkspaceStartupDefaultStarter({
    activePath: null,
    hasDesiredActiveText: false,
    preferCustomValidationSeed: false,
  })) {
    throw new Error('expected startup default initialization to run only when no active path has been selected')
  }

  const startupActivePath = '/docs/startup-active.md'
  invalidateCachedWorkspaceActiveEntrySnapshot()
  try {
    const startupBaseFs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
        { path: startupActivePath, parentPath: '/docs', kind: 'file', name: 'startup-active.md', text: '', updatedAtMs: 1 },
      ],
    })
    let startupReadCalls = 0
    const startupFs: WorkspaceFs = {
      ...startupBaseFs,
      // Missing inline text requires hydration; an explicit empty string is an
      // authored empty document and must not be replaced by another source.
      listEntries: async () => (await startupBaseFs.listEntries()).map(entry =>
        entry.path === startupActivePath ? { ...entry, text: undefined } : entry),
      readFileText: async path => {
        startupReadCalls += 1
        await new Promise(resolve => setTimeout(resolve, 0))
        return String(path || '').trim() === startupActivePath ? '# Startup Active' : null
      },
    }
    const startupEntries = await startupFs.listEntries()
    const readStartupEntries = createWorkspaceStartupSourceRootEntriesReader({
      fs: startupFs,
      startupWorkspaceEntries: startupEntries,
    })
    const [firstStartup, secondStartup] = await Promise.all([
      readStartupEntries(startupActivePath),
      readStartupEntries(startupActivePath),
    ])
    if (startupReadCalls !== 1) {
      throw new Error(`expected startup active-path snapshot hydration to be coalesced, got ${startupReadCalls} active reads`)
    }
    const firstText = firstStartup.find(entry => entry.path === startupActivePath)?.text || ''
    const secondText = secondStartup.find(entry => entry.path === startupActivePath)?.text || ''
    if (firstText !== '# Startup Active' || secondText !== '# Startup Active') {
      throw new Error(`expected coalesced startup snapshots to preserve active text, got ${JSON.stringify([firstText, secondText])}`)
    }
    await readStartupEntries(startupActivePath)
    if (startupReadCalls !== 1) {
      throw new Error(`expected retained startup active-path snapshot without another active read, got ${startupReadCalls}`)
    }
  } finally {
    invalidateCachedWorkspaceActiveEntrySnapshot()
  }
}

export async function testMaterializeActiveWorkspaceEntryHydratesBlankExistingSourceFileText() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath('/docs/workspace-readme.md')
    useGraphStore.getState().setSourceFiles([
      {
        id: 'ws:maps-readme',
        name: 'workspace-readme.md',
        text: '',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'workspace:/docs/workspace-readme.md' },
      },
    ])
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [
        {
          path: '/docs/workspace-readme.md',
          parentPath: '/docs',
          kind: 'file',
          name: 'workspace-readme.md',
          updatedAtMs: 1,
        },
      ],
      readFileText: async (path: string) =>
        String(path || '').trim() === '/docs/workspace-readme.md' ? '# Maps Readme' : null,
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: '/docs/workspace-readme.md',
      fs,
      applyToGraph: false,
    })
    const active = useGraphStore
      .getState()
      .sourceFiles
      .find(file => String(file.source?.path || '') === 'workspace:/docs/workspace-readme.md') || null
    if (!active) throw new Error('expected active workspace source file to stay present after materialization')
    if (String(active.text || '').trim() !== '# Maps Readme') {
      throw new Error(`expected blank active workspace source file text to hydrate from workspace fs, got "${String(active.text || '')}"`)
    }
  } finally {
    restore()
  }
}

export async function testHydrateWorkspaceEntriesInlineTextHydratesEmptyInlineFileTextFromFs() {
  const fs: WorkspaceFs = {
    ensureSeed: async () => false,
    listEntries: async () => [],
    readFileText: async (path: string) => (String(path || '').trim() === '/docs/agentic-graph-video-demo.md' ? '# hydrated from fs' : null),
    writeFileText: async () => void 0,
    createFile: async () => '/docs/tmp.md',
    createFolder: async () => '/docs',
    deleteEntry: async () => void 0,
  }
  const entries = [
    {
      path: '/docs/agentic-graph-video-demo.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'agentic-graph-video-demo.md',
      text: '',
      updatedAtMs: 1,
    },
  ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
  const hydrated = await hydrateWorkspaceEntriesInlineText({ fs, workspaceEntries: entries })
  if (hydrated === entries) throw new Error('expected empty inline file text to trigger hydration from workspace fs')
  if (String(hydrated[0]?.text || '').trim() !== '# hydrated from fs') {
    throw new Error(`expected hydrated workspace entry text from fs, got ${String(hydrated[0]?.text || '')}`)
  }
}

export async function testMaterializeActiveWorkspaceEntryHydratesBlankTextWhenParsedHashAlreadyMatches() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const activePath = '/docs/workspace-readme.md'
    const activeSourcePath = 'workspace:/docs/workspace-readme.md'
    const fileText = '# Maps Readme'
    const textHash = buildSourceFileParseIdentityHash({
      cacheNamespace: `workspace-import:${activePath}`,
      name: workspaceDocumentKey(activePath),
      text: fileText,
    })
    useMarkdownExplorerStore.getState().setActivePath(activePath)
    useGraphStore.getState().setSourceFiles([
      {
        id: 'ws:maps-readme',
        name: 'workspace-readme.md',
        text: '',
        enabled: true,
        status: 'parsed',
        parsedParserId: 'markdown-frontmatter',
        parsedTextHash: textHash,
        parsedGraphRevision: 1,
        parsedGraphData: {
          type: 'Graph',
          nodes: [{ id: 'n1', label: 'Maps', type: 'Thing', properties: {} }],
          edges: [],
          metadata: {},
        },
        source: { kind: 'local', path: activeSourcePath },
      },
    ])
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [
        {
          path: activePath,
          parentPath: '/docs',
          kind: 'file',
          name: 'workspace-readme.md',
          updatedAtMs: 1,
        },
      ],
      readFileText: async (path: string) => (String(path || '').trim() === activePath ? fileText : null),
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: activePath,
      fs,
      applyToGraph: true,
      workspaceEntries: [
        {
          path: activePath,
          parentPath: '/docs',
          kind: 'file',
          name: 'workspace-readme.md',
          updatedAtMs: 1,
        },
      ],
      sourcesByPath: {
        [activePath]: { kind: 'local', originalName: 'workspace-readme.md' },
      },
    })
    const active = useGraphStore
      .getState()
      .sourceFiles
      .find(file => String(file.source?.path || '') === activeSourcePath) || null
    if (!active) throw new Error('expected active workspace source file to stay present after graph-mode materialization')
    if (String(active.text || '').trim() !== fileText) {
      throw new Error(`expected parsed-hash cache-hit path to still hydrate blank source-file text, got "${String(active.text || '')}"`)
    }
  } finally {
    restore()
  }
}
