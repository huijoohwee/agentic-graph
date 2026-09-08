import { assertOnlyCanonicalXrFile } from './xrPhysicsWorkspaceBootstrap.testSupport'
import { LS_KEYS } from '@/lib/config'
import { lsBool } from '@/lib/persistence'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { readEnvString, readEnvStringFromRecord } from '@/lib/config.env'
import { resolveWorkspaceStartupCanonicalPath } from '@/features/source-files/sourceFilesRuntimeStartup'
import { GEOSPATIAL_WORKSPACE_SEED_PATH, TEST_VALIDATION_WORKSPACE_SEED_BASENAME, TEST_VALIDATION_WORKSPACE_SEED_PATH, WORKSPACE_README_SEED_PATH, XR_PHYSICS_WORKSPACE_SEED_PATH, resolveWorkspaceStartupActivePath, sortWorkspaceEntriesForExplorer } from '@/features/workspace-fs/workspaceFs'
import { resolveWorkspaceSourceIndexSnapshot, readReusableWorkspaceSourceIndexSnapshot, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { buildFailedWorkspaceRefreshSnapshot, pruneWorkspaceEntriesForInlineSnapshot, buildWorkspaceRefreshSnapshot } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.shared'
import { resolveWorkspaceEntryInlineText, resolveWorkspaceSourceFileInlineText, upsertWorkspaceEntryInlineText } from '@/features/workspace-fs/workspaceInlineText'
import { applyActiveMarkdownDocumentPayload, buildActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import { shouldTrustEmptyWorkspaceSelectionCache } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceIndexing'

export async function testWorkspaceEnsureSeedDoesNotReseedAfterUserDeletesAllFiles() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path: '/notes/custom.md', parentPath: '/notes', kind: 'file', name: 'custom.md', text: '# Custom', updatedAtMs: 1 },
      ],
    })

    await fs.deleteEntry('/notes/custom.md' as never)

    const afterDelete = await fs.listEntries()
    if (afterDelete.some(e => e.kind === 'file')) throw new Error('expected all files deleted')

    await fs.ensureSeed()
    const afterEnsureSeedAgain = await fs.listEntries()
    assertOnlyCanonicalXrFile(afterEnsureSeedAgain)
    if (!lsBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, false)) {
      throw new Error('expected cleared marker to keep ordinary defaults and deleted user files suppressed')
    }
    if (await fs.ensureSeed()) throw new Error('expected repeated cleared-workspace initialization to be a no-op')
    if (JSON.stringify(await fs.listEntries()) !== JSON.stringify(afterEnsureSeedAgain)) {
      throw new Error('expected protected seed restoration to preserve its settled entries and timestamps')
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceEnsureSeedKeepsUserDeletedDefaultSeedEntryRemoved() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        {
          path: WORKSPACE_README_SEED_PATH,
          parentPath: '/',
          kind: 'file',
          name: 'README.md',
          text: [
            '---',
            'kgCanvas2dRenderer: "d3"',
            'kgFrontmatterModeEnabled: true',
            '---',
            '# README',
          ].join('\n'),
          updatedAtMs: 1,
        },
        {
          path: TEST_VALIDATION_WORKSPACE_SEED_PATH,
          parentPath: '/',
          kind: 'file',
          name: TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
          text: [
            '---',
            'kgCanvas2dRenderer: "storyboard"',
            'kgFrontmatterModeEnabled: true',
            '---',
            '# Validation',
          ].join('\n'),
          updatedAtMs: 1,
        },
        {
          path: GEOSPATIAL_WORKSPACE_SEED_PATH,
          parentPath: '/',
          kind: 'file',
          name: 'agentic-graph-maps-grabmap-multim-demo.md',
          text: [
            '---',
            'kgCanvasSurfaceMode: "geospatial"',
            'kgCanvas2dRenderer: "storyboard"',
            'kgFrontmatterModeEnabled: true',
            '---',
            '# Geospatial',
          ].join('\n'),
          updatedAtMs: 1,
        },
      ],
    })
    await fs.ensureSeed()

    const entries = await fs.listEntries()
    const readmeEntry = entries.find(e => e.path === WORKSPACE_README_SEED_PATH && e.kind === 'file')
    const geospatialEntry = entries.find(e => e.path === GEOSPATIAL_WORKSPACE_SEED_PATH && e.kind === 'file')
    if (!readmeEntry || typeof readmeEntry.text !== 'string' || !readmeEntry.text.includes('kgCanvas2dRenderer: "d3"')) {
      throw new Error('expected README seed entry to exist before deletion')
    }
    if (!geospatialEntry || typeof geospatialEntry.text !== 'string' || !geospatialEntry.text.includes('kgCanvasSurfaceMode: "geospatial"')) {
      throw new Error('expected geospatial seed entry to exist before deletion')
    }

    const fsWithoutValidation = createMemoryWorkspaceFs({
      initialEntries: entries.filter(entry => entry.path !== TEST_VALIDATION_WORKSPACE_SEED_PATH),
    })
    await fsWithoutValidation.ensureSeed()
    const afterDelete = await fsWithoutValidation.listEntries()
    if (afterDelete.some(e => e.path === TEST_VALIDATION_WORKSPACE_SEED_PATH && e.kind === 'file')) {
      throw new Error('expected deleted default seed entry to stay removed after ensureSeed')
    }
  } finally {
    restore()
  }
}

export function testWorkspaceStartupActivePathUsesPhysicsPlaygroundForDefaultSeedFamily() {
  const next = resolveWorkspaceStartupActivePath({
    workspaceFilePaths: [
      WORKSPACE_README_SEED_PATH,
      TEST_VALIDATION_WORKSPACE_SEED_PATH,
      XR_PHYSICS_WORKSPACE_SEED_PATH,
    ],
    activePath: null,
    preferDefaultStarter: true,
  })
  if (next !== XR_PHYSICS_WORKSPACE_SEED_PATH) {
    throw new Error(`expected default seed startup to use the Physics Playground, got ${String(next)}`)
  }
}

export function testWorkspaceStartupActivePathFallsBackToReadmeWithoutPhysicsSeed() {
  const next = resolveWorkspaceStartupActivePath({
    workspaceFilePaths: [
      WORKSPACE_README_SEED_PATH,
      TEST_VALIDATION_WORKSPACE_SEED_PATH,
      GEOSPATIAL_WORKSPACE_SEED_PATH,
    ],
    activePath: null,
    preferDefaultStarter: true,
  })
  if (next !== WORKSPACE_README_SEED_PATH) {
    throw new Error(`expected startup without the Physics Playground seed to fall back to the workspace README, got ${String(next)}`)
  }
}

export function testWorkspaceStartupActivePathPreservesExplicitDefaultSeedSelection() {
  const next = resolveWorkspaceStartupActivePath({
    workspaceFilePaths: [
      WORKSPACE_README_SEED_PATH,
      TEST_VALIDATION_WORKSPACE_SEED_PATH,
      GEOSPATIAL_WORKSPACE_SEED_PATH,
    ],
    activePath: WORKSPACE_README_SEED_PATH,
    preferDefaultStarter: true,
  })
  if (next !== WORKSPACE_README_SEED_PATH) {
    throw new Error(`expected explicit default seed selection to be preserved, got ${String(next)}`)
  }
}

export function testWorkspaceStartupActivePathForcesValidationSeedWhenCustomTargetExists() {
  const next = resolveWorkspaceStartupActivePath({
    workspaceFilePaths: [
      WORKSPACE_README_SEED_PATH,
      TEST_VALIDATION_WORKSPACE_SEED_PATH,
      GEOSPATIAL_WORKSPACE_SEED_PATH,
      '/notes/agentic-graph-pitchdeck.md',
    ],
    activePath: '/notes/agentic-graph-pitchdeck.md' as never,
    preferDefaultStarter: true,
    forceValidationSeedIfPresent: true,
  })
  if (next !== TEST_VALIDATION_WORKSPACE_SEED_PATH) {
    throw new Error(`expected custom validation target startup to force validation seed when present, got ${String(next)}`)
  }
}

export function testWorkspaceStartupActivePathPreservesCustomWorkspaceSelection() {
  const next = resolveWorkspaceStartupActivePath({
    workspaceFilePaths: [
      WORKSPACE_README_SEED_PATH,
      TEST_VALIDATION_WORKSPACE_SEED_PATH,
      GEOSPATIAL_WORKSPACE_SEED_PATH,
      '/notes/custom.md',
    ],
    activePath: TEST_VALIDATION_WORKSPACE_SEED_PATH,
  })
  if (next !== TEST_VALIDATION_WORKSPACE_SEED_PATH) {
    throw new Error(`expected custom workspace startup to preserve the requested active path, got ${String(next)}`)
  }
}

export function testWorkspaceExplorerSortPrefersReadmeFirstForCanonicalDefaultFamily() {
  const next = sortWorkspaceEntriesForExplorer([
    {
      kind: 'folder',
      path: '/sandbox',
      parentPath: '/',
      name: 'sandbox',
      updatedAtMs: 1,
    },
    {
      kind: 'file',
      path: WORKSPACE_README_SEED_PATH,
      parentPath: '/',
      name: 'README.md',
      text: '# README',
      updatedAtMs: 1,
    },
  ])
  if (next[0]?.path !== WORKSPACE_README_SEED_PATH) {
    throw new Error(`expected canonical explorer order to show README first, got ${String(next[0]?.path || '')}`)
  }
}

export function testWorkspaceExplorerSortKeepsFoldersFirstForCustomWorkspaceEntries() {
  const next = sortWorkspaceEntriesForExplorer([
    {
      kind: 'folder',
      path: '/sandbox',
      parentPath: '/',
      name: 'sandbox',
      updatedAtMs: 1,
    },
    {
      kind: 'file',
      path: '/notes.md',
      parentPath: '/',
      name: 'notes.md',
      text: '# Notes',
      updatedAtMs: 1,
    },
  ])
  if (next[0]?.path !== '/sandbox') {
    throw new Error(`expected non-default explorer order to keep folders first, got ${String(next[0]?.path || '')}`)
  }
}

export function testCanvasEnvBridgeReadsImportMetaStyleRecordFirst() {
  const next = readEnvStringFromRecord(
    {
      VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH: 'huijoohwee.github.io/template/agentic-graph-video-script-template.md',
    },
    'VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH',
  )
  if (next !== 'huijoohwee.github.io/template/agentic-graph-video-script-template.md') {
    throw new Error(`expected import-meta style env record to win, got ${String(next)}`)
  }
}

export function testCanvasEnvBridgeFallsBackToProcessEnvOutsideBrowser() {
  const prev = process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH
  process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH = 'huijoohwee.github.io/template/agentic-graph-video-script-template.md'
  try {
    const next = readEnvString(
      'VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH',
      'docs/default-validation.md',
    )
    if (next !== 'huijoohwee.github.io/template/agentic-graph-video-script-template.md') {
      throw new Error(`expected process env fallback to resolve custom validation target, got ${String(next)}`)
    }
  } finally {
    if (typeof prev === 'string') process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH = prev
    else delete process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH
  }
}

export function testCanvasEnvBridgeReadsAgenticGraphStorageBaseUrlFromProcessEnv() {
  const prev = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'http://127.0.0.1:8787'
  try {
    const next = readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', '')
    if (next !== 'http://127.0.0.1:8787') {
      throw new Error(`expected storage base url to be readable through canvas env bridge, got ${String(next)}`)
    }
  } finally {
    if (typeof prev === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = prev
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  }
}

export function testWorkspaceSourceIndexSnapshotHelpersCentralizeReuseRules() {
  const provided: Record<string, { kind: 'local'; originalName?: string | null }> = {
    '/notes/demo.md': { kind: 'local', originalName: 'demo.md' },
  }
  if (readReusableWorkspaceSourceIndexSnapshot(provided as never) !== (provided as never)) {
    throw new Error('expected shared workspace source-index snapshot helper to preserve provided snapshots by identity')
  }

  if (readReusableWorkspaceSourceIndexSnapshot(null) !== undefined) {
    throw new Error('expected shared workspace source-index snapshot helper to ignore missing snapshots')
  }

  if (resolveWorkspaceSourceIndexSnapshot(provided as never) !== (provided as never)) {
    throw new Error('expected shared workspace source-index resolver to reuse provided snapshots without reloading the cached source index')
  }

  const cached = setWorkspaceEntrySource('/notes/cached.md' as never, { kind: 'url', url: 'https://example.com/cached.md' })
  const resolved = resolveWorkspaceSourceIndexSnapshot(undefined)
  if (resolved !== cached) {
    throw new Error('expected shared workspace source-index resolver to fall back to the canonical cached source index when no snapshot is provided')
  }
}

export function testWorkspaceRefreshSnapshotHelpersCentralizeFallbackState() {
  const providedSources = {
    '/notes/demo.md': { kind: 'local', originalName: 'demo.md' },
  } as const
  const providedEntries = [
    { path: '/notes/demo.md', parentPath: '/notes', kind: 'file', name: 'demo.md', updatedAtMs: 1 },
  ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]

  const built = buildWorkspaceRefreshSnapshot({
    entries: providedEntries,
    sourcesByPath: providedSources as never,
  })
  if (built.entries !== providedEntries || built.sourcesByPath !== (providedSources as never)) {
    throw new Error('expected shared workspace refresh snapshot helper to preserve provided entries and source-index snapshots by identity')
  }

  const failed = buildFailedWorkspaceRefreshSnapshot()
  if (!Array.isArray(failed.entries) || failed.entries.length !== 0) {
    throw new Error('expected shared workspace refresh failure snapshot helper to return empty entries')
  }

  const cached = setWorkspaceEntrySource('/notes/refresh-cached.md' as never, { kind: 'url', url: 'https://example.com/refresh-cached.md' })
  const fallback = buildWorkspaceRefreshSnapshot({
    entries: providedEntries,
  })
  if (fallback.sourcesByPath !== cached) {
    throw new Error('expected shared workspace refresh snapshot helper to reuse the canonical cached source index when no snapshot is provided')
  }
}

export function testWorkspaceStartupCanonicalPathPromotesRootDocsAliasToDocsMirrorPath() {
  const docsReadmePath = '/docs/workspace-readme.md' as never
  const canonical = resolveWorkspaceStartupCanonicalPath({
    activePath: WORKSPACE_README_SEED_PATH,
    workspaceEntries: [{
      path: docsReadmePath,
      parentPath: '/docs',
      kind: 'file',
      name: 'workspace-readme.md',
      text: '# Maps Readme',
      updatedAtMs: 1,
    }],
  })
  if (canonical !== docsReadmePath) {
    throw new Error(`expected startup canonical path helper to promote README root alias to docs mirror path, got ${String(canonical)}`)
  }
}

export function testWorkspaceRefreshPruningHelperCentralizesOversizedInlineTextRule() {
  const safeEntries = [
    { path: '/notes/a.md', parentPath: '/notes', kind: 'file', name: 'a.md', text: 'short', updatedAtMs: 1 },
    { path: '/notes', parentPath: '/', kind: 'folder', name: 'notes', updatedAtMs: 1 },
  ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
  const safeResult = pruneWorkspaceEntriesForInlineSnapshot(safeEntries, 10)
  if (safeResult !== safeEntries) {
    throw new Error('expected shared workspace refresh pruning helper to preserve entry-array identity when no oversized inline text needs pruning')
  }

  const oversizedEntries = [
    { path: '/notes/large.md', parentPath: '/notes', kind: 'file', name: 'large.md', text: '0123456789ABC', updatedAtMs: 1 },
    { path: '/notes/small.md', parentPath: '/notes', kind: 'file', name: 'small.md', text: 'small', updatedAtMs: 1 },
  ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
  const pruned = pruneWorkspaceEntriesForInlineSnapshot(oversizedEntries, 10)
  if (pruned === oversizedEntries) {
    throw new Error('expected shared workspace refresh pruning helper to create a new snapshot when oversized inline text must be dropped')
  }
  if (typeof pruned[0]?.text !== 'undefined') {
    throw new Error('expected shared workspace refresh pruning helper to drop oversized inline file text')
  }
  if (pruned[1] !== oversizedEntries[1]) {
    throw new Error('expected shared workspace refresh pruning helper to preserve identity for entries that do not need pruning')
  }
}

export function testWorkspaceInlineTextHelpersCentralizeEntryAndSourceFileRules() {
  if (resolveWorkspaceEntryInlineText('012345', 5) !== undefined) {
    throw new Error('expected workspace entry inline-text helper to drop oversized entry text')
  }
  if (resolveWorkspaceEntryInlineText('short', 5) !== 'short') {
    throw new Error('expected workspace entry inline-text helper to preserve bounded entry text')
  }
  if (resolveWorkspaceSourceFileInlineText('012345', 5) !== '012345') {
    throw new Error('expected workspace source-file inline-text helper to preserve oversized source text when inline snapshot is capped')
  }

  const entries = [
    { path: '/notes/demo.md', parentPath: '/notes', kind: 'file', name: 'demo.md', text: 'old', updatedAtMs: 1 },
  ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
  const unchanged = upsertWorkspaceEntryInlineText({
    entries,
    path: '/notes/demo.md' as never,
    text: 'old',
    updatedAtMs: 2,
  })
  if (unchanged !== entries) {
    throw new Error('expected workspace entry inline-text helper to preserve entry-array identity when inline text is unchanged')
  }

  const inserted = upsertWorkspaceEntryInlineText({
    entries: [],
    path: '/notes/added.md' as never,
    text: 'fresh',
    createIfMissing: true,
    updatedAtMs: 3,
  })
  if (inserted.length !== 1 || inserted[0]?.path !== '/notes/added.md' || inserted[0]?.text !== 'fresh') {
    throw new Error('expected workspace entry inline-text helper to centralize missing-entry creation with normalized inline text')
  }
}

export async function testActiveMarkdownDocumentHelpersCentralizePayloadDefaults() {
  const calls: Array<ReturnType<typeof buildActiveMarkdownDocumentPayload>> = []
  const base = buildActiveMarkdownDocumentPayload({
    name: 'demo.md',
    text: 'body',
    sourceUrl: 'https://example.com/demo',
    applyToGraph: true,
    forceApplyToGraph: true,
  })
  if (base.normalizeMermaidMmd !== false || base.sourceUrl !== 'https://example.com/demo') {
    throw new Error('expected active markdown document payload helper to centralize normalizeMermaidMmd and source-url defaults')
  }

  await applyActiveMarkdownDocumentPayload({
    setActiveMarkdownDocument: async payload => {
      calls.push(payload)
      return true
    },
    name: 'demo.md',
    text: ['---', 'kgWebpageUrl: https://example.com/demo', '---', '# Demo'].join('\n'),
    sourceUrl: 'https://example.com/demo',
    autoEnableFrontmatter: false,
    applyViewPreset: false,
    normalizeWebpageFrontmatterToMarkdown: true,
  })
  if (
    calls.length !== 1 ||
    calls[0]?.normalizeMermaidMmd !== false ||
    calls[0]?.autoEnableFrontmatter !== false ||
    calls[0]?.applyViewPreset !== false
  ) {
    throw new Error('expected active markdown document apply helper to preserve shared payload defaults across runtime/import callers')
  }
}

export function testWorkspaceSelectionCacheDoesNotTrustBlankForInitializationDocs() {
  const trusted = shouldTrustEmptyWorkspaceSelectionCache({
    cachedText: '',
    path: '/docs/workspace-readme.md',
    lastLoaded: { path: '/docs/workspace-readme.md', text: '' },
  })
  if (trusted) {
    throw new Error('expected initialization docs to bypass blank cache trust and rehydrate from source')
  }
}

export {
  testWorkspaceBootstrapMaterializesActiveWorkspaceEntryIntoParsedSourceFile,
  testWorkspaceBootstrapMaterializeReusesProvidedWorkspaceSnapshotWithoutExtraListEntries,
  testWorkspaceBootstrapMaterializeDoesNotApplyGraphWithoutExplicitOptIn,
  testWorkspaceBootstrapMaterializeNormalizesActiveWorkspacePathResolution,
  testWorkspaceBootstrapMaterializeSharedSnapshotHelpersCentralizeReuseRules,
  testMaterializeActiveWorkspaceEntryHydratesBlankExistingSourceFileText,
  testHydrateWorkspaceEntriesInlineTextHydratesEmptyInlineFileTextFromFs,
  testMaterializeActiveWorkspaceEntryHydratesBlankTextWhenParsedHashAlreadyMatches,
} from './workspaceSeedMaterialization.test'

export {
  testWorkspaceSeedProviderPrefersConfiguredAbsoluteDocsRoot,
  testWorkspaceSeedProviderUsesDeclaredReadRootWithoutDocsFallback,
  testWorkspaceSeedProviderBrowserUpsertWritesViaKgFsProxy,
  testWorkspaceSeedProviderBrowserUpsertDocsMirrorWritesViaKgFsProxy,
  testWorkspaceSeedProviderBrowserUpsertDocsMirrorSkipsHiddenDocumentWrites,
  testWorkspaceSeedProviderBrowserUpsertChatLogMirrorWritesViaKgFsProxy,
  testWorkspaceSeedProviderKeepsEmptyAndModelAssetDocsMirrorFiles,
  testWorkspaceSeedProviderReadsDocsMirrorFromSourceFilesState,
  testWorkspaceSeedProviderCollapsesRedundantDocsPrefixFromSourceFilesState,
  testWorkspaceSeedProviderResolvesRelativeDocsPathForAbsoluteSelectedFolder,
  testWorkspaceSeedProviderTreatsSelectedFilePathAsSelectedFolder,
} from './workspaceSeedProviderLocal.test'

export {
  testWorkspaceSeedProviderPrefersAgenticGraphStorageExportWhenConfigured,
  testWorkspaceSeedProviderPrefersSourceFilesDocViewOverLargerStorageExportDataset,
  testWorkspaceSeedProviderPrefersCompleteStorageExportDatasetForSync,
  testWorkspaceSeedProviderStorageExportRebuildsMarkdownFromChunksWhenContentMdBlank,
  testWorkspaceSeedProviderUsesSameOriginStoragePathOnLocalhostDev,
} from './workspaceSeedProviderRemote.test'

export {
  testWorkspaceSeedProviderReadsDocsMirrorFromSelectedLocalFolderHandle,
  testWorkspaceSeedProviderPrefersSelectedLocalFolderHandleOverStorageExportInFullBootstrap,
  testWorkspaceSourceRootSnapshotKeepsFullDocsTreeForSourceFilesSync,
  testRuntimeSourceFilesReflectWorkspaceSeedFileContentChanges,
  testRuntimeSourceFilesSyncsFullDocsMirrorTree,
  testHydrateWorkspaceEntriesInlineTextFallsBackToAgenticGraphStorageDocWhenFsTextIsBlank,
  testHydrateWorkspaceEntriesInlineTextStorageFallbackCanonicalizesDuplicatedDocsPrefixPath,
} from './workspaceSeedBootstrap.test'

export {
  testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterLabelResidue,
  testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterNodeTypeResidue,
  testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterNodeStringPropertyResidue,
  testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterEdgeStringResidue,
  testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterEdgeEndpointResidue,
  testReadWorkspaceActiveEntrySnapshotKeepsOrdinaryFrontmatterStringEdits,
} from './workspaceSeedReadProjection.test'
