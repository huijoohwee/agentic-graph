import path from 'node:path'

import type { SourceFile } from '@/hooks/store/types'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { mergeWorkspaceEntriesIntoSourceFiles, resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import {
  GEOSPATIAL_WORKSPACE_SOURCE_PATH,
  TEST_VALIDATION_SOURCE_PATH,
  WORKSPACE_README_SOURCE_PATH,
  reconcileDefaultWorkspaceSeedSourceFiles,
  resolveWorkspaceSeedSourcePath,
} from '@/features/source-files/workspaceSeedSourceFiles'
import {
  GEOSPATIAL_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
  WORKSPACE_README_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'

const normalizeFsPath = (value: string): string => String(value || '').replace(/\\/g, '/')
const ABSOLUTE_DOCS_VIDEO_DEMO_PATH = normalizeFsPath(
  path.resolve(process.cwd(), '..', '..', 'huijoohwee', 'docs', 'agenticgraph-video-demo.md'),
)

export async function testWorkspaceSourceFilesSyncMergesAndPreservesNonWorkspace() {
  const existing: SourceFile[] = [
    {
      id: 'remote-1',
      name: 'remote.json',
      text: '{}',
      enabled: true,
      status: 'idle',
      source: { kind: 'url', url: 'https://example.com/remote.json' },
    },
    {
      id: 'ws-prev',
      name: 'old.md',
      text: 'prev',
      enabled: false,
      status: 'parsed',
      parsedTextHash: 'h',
      parsedGraphData: { type: 'graph', nodes: [{ id: 'n1', type: 'Entity', label: 'n1', properties: {} }], edges: [] },
      source: { kind: 'local', path: 'workspace:/old.md' },
    },
  ]

  const workspaceEntries: WorkspaceEntry[] = [
    { kind: 'file', path: '/a.md', parentPath: '/', name: 'a.md', text: '# A', updatedAtMs: 1 },
    { kind: 'file', path: '/b.md', parentPath: '/', name: 'b.md', updatedAtMs: 1 },
  ]

  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries,
    sourcesByPath: { '/b.md': { kind: 'url', url: 'https://example.com/b.md' } },
  })

  const ids = new Set(next.map(f => f.id))
  if (!ids.has('remote-1')) throw new Error('expected non-workspace source file to be preserved')
  if (ids.has('ws-prev')) throw new Error('expected removed workspace file to be dropped')

  const wsA = next.find(f => f.source?.path === 'workspace:/a.md')
  if (wsA) throw new Error('expected /a.md to be omitted until explicitly added as a source')

  const wsB = next.find(f => f.source?.path === 'workspace:/b.md')
  if (!wsB) throw new Error('expected /b.md to be mapped into Source Files')
  if (wsB.source?.kind !== 'url') throw new Error('expected /b.md to carry url source kind')
  if (wsB.source?.url !== 'https://example.com/b.md') throw new Error('expected /b.md to carry url')
}

export async function testWorkspaceSourceFilesSyncPreservesParsedGraphRevision() {
  const parsedGraphData = { type: 'Graph', nodes: [{ id: 'n1', type: 'Entity', label: 'n1', properties: {} }], edges: [] } as SourceFile['parsedGraphData']
  const existing: SourceFile[] = [
    {
      id: 'ws-prev',
      name: 'a.md',
      text: 'prev',
      enabled: true,
      status: 'parsed',
      parsedTextHash: 'h',
      parsedGraphRevision: 7,
      parsedGraphData,
      source: { kind: 'local', path: 'workspace:/a.md' },
    },
  ]

  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries: [{ kind: 'file', path: '/a.md', parentPath: '/', name: 'a.md', updatedAtMs: 1 }],
    sourcesByPath: { '/a.md': { kind: 'local', originalName: 'a.md' } },
  })

  if (next[0] !== existing[0]) throw new Error('expected unchanged workspace source file object to be reused')
  if (next[0]?.parsedGraphRevision !== 7) throw new Error('expected parsedGraphRevision to be preserved across workspace source sync')
}

export async function testWorkspaceSourceFilesSyncDropsStaleRuntimeOnlyAgenticDocsProjection() {
  const runtimeOnlyPath = '/agentic-canvas-os/docs/AGENT-DEFINITIONS.md'
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [
      {
        id: 'ws-runtime-doc',
        name: 'AGENT-DEFINITIONS.md',
        text: '# Runtime reference',
        enabled: true,
        status: 'parsed',
        source: { kind: 'local', path: `workspace:${runtimeOnlyPath}` },
      },
    ],
    workspaceEntries: [
      {
        kind: 'file',
        path: runtimeOnlyPath,
        parentPath: '/agentic-canvas-os/docs',
        name: 'AGENT-DEFINITIONS.md',
        text: '# Runtime reference',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: { [runtimeOnlyPath]: { kind: 'local', originalName: 'AGENT-DEFINITIONS.md' } },
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: true,
  })

  if (next.some(file => file.source?.path === `workspace:${runtimeOnlyPath}`)) {
    throw new Error('expected stale Agentic Canvas OS runtime reference to be removed from Source Files')
  }
}

export async function testWorkspaceSourceFilesSyncDoesNotOverwriteExistingTextWithBlankWorkspaceInlineText() {
  const existing: SourceFile[] = [
    {
      id: 'ws-video-demo',
      name: 'agenticgraph-video-demo.md',
      text: '# hydrated markdown',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'workspace:/docs/agenticgraph-video-demo.md' },
    },
  ]
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries: [
      {
        kind: 'file',
        path: '/docs/agenticgraph-video-demo.md',
        parentPath: '/docs',
        name: 'agenticgraph-video-demo.md',
        text: '',
        updatedAtMs: 2,
      },
    ],
    sourcesByPath: {
      '/docs/agenticgraph-video-demo.md': { kind: 'local', originalName: 'agenticgraph-video-demo.md' },
    },
  })
  const file = next.find(entry => String(entry.source?.path || '') === 'workspace:/docs/agenticgraph-video-demo.md') || null
  if (!file) throw new Error('expected docs workspace source file to stay present')
  if (String(file.text || '').trim() !== '# hydrated markdown') {
    throw new Error(`expected blank workspace inline text not to clobber existing hydrated source text, got "${String(file.text || '')}"`)
  }
}

export async function testWorkspaceSourceFilesSyncForceIncludesActiveWorkspaceMarkdown() {
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      { kind: 'file', path: '/active.md', parentPath: '/', name: 'active.md', text: '---\ntitle: Active\n---\n', updatedAtMs: 1 },
    ],
    sourcesByPath: {},
    forceIncludePaths: ['/active.md'],
  })

  const active = next.find(f => f.source?.path === 'workspace:/active.md')
  if (!active) throw new Error('expected active workspace markdown path to be mirrored into Source Files when force-included')
  if (active.source?.kind !== 'local') throw new Error('expected active workspace markdown source kind to default to local')
  if (active.enabled !== true) throw new Error('expected newly mirrored active workspace markdown source to be enabled when force-included as the active workspace doc')
}

export async function testWorkspaceSourceFilesSyncForceIncludeReenablesExistingDisabledValidationSeed() {
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [
      {
        id: 'ws-validation',
        name: 'agenticgraph-demo-video.md',
        text: '---\ntitle: Validation\n---\n',
        enabled: false,
        status: 'idle',
        source: { kind: 'local', path: TEST_VALIDATION_SOURCE_PATH },
      },
    ],
    workspaceEntries: [
      {
        kind: 'file',
        path: TEST_VALIDATION_WORKSPACE_SEED_PATH,
        parentPath: '/',
        name: 'agenticgraph-video-demo.md',
        text: '---\ntitle: Validation\nkgCanvas2dRenderer: "storyboard"\n---\n',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: {},
    forceIncludePaths: [TEST_VALIDATION_WORKSPACE_SEED_PATH],
  })

  const validation = next.find(f => f.source?.path === TEST_VALIDATION_SOURCE_PATH)
  if (!validation) throw new Error('expected canonical validation seed to remain present in Source Files')
  if (validation.enabled !== true) {
    throw new Error('expected force-included active validation seed to be re-enabled so it participates in composed graph rendering')
  }
}

export async function testWorkspaceSourceFilesSyncAlwaysIncludesCanonicalSeedFiles() {
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      { kind: 'file', path: WORKSPACE_README_SEED_PATH, parentPath: '/', name: 'workspace-readme.md', text: '# Readme', updatedAtMs: 1 },
      {
        kind: 'file',
        path: TEST_VALIDATION_WORKSPACE_SEED_PATH,
        parentPath: '/',
        name: 'agenticgraph-video-demo.md',
        text: '# Demo',
        updatedAtMs: 1,
      },
      {
        kind: 'file',
        path: GEOSPATIAL_WORKSPACE_SEED_PATH,
        parentPath: '/',
        name: 'agenticgraph-maps-places.md',
        text: '# Maps',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: {},
  })

  const readme = next.find(f => f.source?.path === WORKSPACE_README_SOURCE_PATH)
  const demo = next.find(f => f.source?.path === TEST_VALIDATION_SOURCE_PATH)
  const geospatial = next.find(f => f.source?.path === GEOSPATIAL_WORKSPACE_SOURCE_PATH)
  if (!readme) throw new Error('expected canonical README seed to always be mirrored into Source Files')
  if (!demo) throw new Error('expected canonical validation demo seed to always be mirrored into Source Files')
  if (!geospatial) throw new Error('expected canonical geospatial seed to always be mirrored into Source Files')
  if (readme.enabled !== true) throw new Error('expected canonical README seed to stay enabled by default')
  if (demo.enabled !== false) throw new Error('expected canonical validation demo seed to stay disabled by default until explicitly activated')
  if (geospatial.enabled !== false) throw new Error('expected canonical geospatial seed to stay disabled by default until explicitly activated')
}

export async function testWorkspaceSourceFilesSyncSuppressesLegacyRootSeedAliasesWhenDocsMirrorExists() {
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      { kind: 'file', path: WORKSPACE_README_SEED_PATH, parentPath: '/', name: 'workspace-readme.md', text: '# Readme root', updatedAtMs: 1 },
      { kind: 'file', path: GEOSPATIAL_WORKSPACE_SEED_PATH, parentPath: '/', name: 'agenticgraph-maps-places.md', text: '# Places root', updatedAtMs: 1 },
      { kind: 'file', path: '/docs/workspace-readme.md', parentPath: '/docs', name: 'workspace-readme.md', text: '# Readme docs', updatedAtMs: 1 },
      { kind: 'file', path: '/docs/agenticgraph-maps-places.md', parentPath: '/docs', name: 'agenticgraph-maps-places.md', text: '# Places docs', updatedAtMs: 1 },
    ],
    sourcesByPath: {
      '/docs/workspace-readme.md': { kind: 'local', originalName: 'workspace-readme.md' },
      '/docs/agenticgraph-maps-places.md': { kind: 'local', originalName: 'agenticgraph-maps-places.md' },
    },
  })

  const rootReadme = next.find(f => f.source?.path === WORKSPACE_README_SOURCE_PATH)
  if (rootReadme) throw new Error('expected root README seed alias to be suppressed when docs mirror provides canonical file with same basename')
  const rootGeospatial = next.find(f => f.source?.path === GEOSPATIAL_WORKSPACE_SOURCE_PATH)
  if (rootGeospatial) throw new Error('expected root geospatial seed alias to be suppressed when docs mirror provides canonical file with same basename')
  const docsReadme = next.find(f => f.source?.path === 'workspace:/docs/workspace-readme.md')
  if (!docsReadme) throw new Error('expected docs mirrored README to stay present as canonical Source Files entry')
  const docsPlaces = next.find(f => f.source?.path === 'workspace:/docs/agenticgraph-maps-places.md')
  if (!docsPlaces) throw new Error('expected docs mirrored places markdown to stay present as canonical Source Files entry')
}

export async function testWorkspaceSourceFilesSyncSuppressesEmptyRootDocsAliasWhenDocsMirrorExists() {
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      { kind: 'file', path: '/agenticgraph-storyboard-demo.md', parentPath: '/', name: 'agenticgraph-storyboard-demo.md', text: '# stale root alias', updatedAtMs: 1 },
      { kind: 'file', path: '/docs/agenticgraph-storyboard-demo.md', parentPath: '/docs', name: 'agenticgraph-storyboard-demo.md', text: '# Storyboard docs', updatedAtMs: 1 },
    ],
    sourcesByPath: {
      '/docs/agenticgraph-storyboard-demo.md': { kind: 'local', originalName: 'agenticgraph-storyboard-demo.md' },
    },
    workspaceDocsOnly: true,
  })

  const staleRootAlias = next.find(f => f.source?.path === 'workspace:/agenticgraph-storyboard-demo.md')
  if (staleRootAlias) throw new Error('expected stale root docs alias to be suppressed when docs mirror provides canonical storyboard file')
  const docsStoryboard = next.find(f => f.source?.path === 'workspace:/docs/agenticgraph-storyboard-demo.md')
  if (!docsStoryboard) throw new Error('expected docs mirrored storyboard markdown to remain as canonical Source Files entry')
}

export async function testWorkspaceSourceFilesSyncDeduplicatesLegacyAliasFamilyToSingleCanonicalSourcePath() {
  const docsValidationAliasPath = `/${TEST_VALIDATION_WORKSPACE_SEED_REL_PATH}`
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      {
        kind: 'file',
        path: TEST_VALIDATION_WORKSPACE_SEED_PATH,
        parentPath: '/',
        name: 'agenticgraph-video-demo.md',
        text: '# root validation alias',
        updatedAtMs: 1,
      },
      {
        kind: 'file',
        path: docsValidationAliasPath,
        parentPath: '/docs',
        name: 'agenticgraph-video-demo.md',
        text: '# docs validation alias',
        updatedAtMs: 2,
      },
    ],
    sourcesByPath: {
      [docsValidationAliasPath]: { kind: 'local', originalName: 'agenticgraph-video-demo.md' },
    },
  })

  const validationAliases = next.filter(f => f.source?.path === TEST_VALIDATION_SOURCE_PATH)
  if (validationAliases.length !== 1) {
    throw new Error(`expected legacy validation alias family to collapse to one canonical Source Files entry, got ${validationAliases.length}`)
  }
  if (validationAliases[0]?.text !== '# docs validation alias') {
    throw new Error('expected canonical validation Source Files entry to prefer the docs mirror alias over the root seed alias')
  }
  if (next.some(f => f.source?.path === `workspace:${docsValidationAliasPath}`)) {
    throw new Error('expected docs validation alias not to create a duplicate workspace:/docs source-file key')
  }
}

export async function testWorkspaceSourceFilesSyncDocsOnlyModeExcludesNonDocsWorkspaceFiles() {
  const nonDocsPath = '/scratch/places-demo.md'
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      { kind: 'file', path: '/docs/documents/agenticgraph-storage-sync-document.md', parentPath: '/docs/documents', name: 'agenticgraph-storage-sync-document.md', text: '# docs', updatedAtMs: 1 },
      { kind: 'file', path: nonDocsPath, parentPath: '/scratch', name: 'places-demo.md', text: '# demo', updatedAtMs: 1 },
    ],
    sourcesByPath: {
      '/docs/documents/agenticgraph-storage-sync-document.md': { kind: 'local', originalName: 'agenticgraph-storage-sync-document.md' },
      [nonDocsPath]: { kind: 'local', originalName: 'places-demo.md' },
    },
    workspaceDocsOnly: true,
  })

  const docs = next.find(f => f.source?.path === 'workspace:/docs/documents/agenticgraph-storage-sync-document.md')
  if (!docs) throw new Error('expected docs mirror entry to remain in docs-only mode')
  const nonDocs = next.find(f => f.source?.path === `workspace:${nonDocsPath}`)
  if (nonDocs) throw new Error('expected non-docs workspace entries to be excluded in docs-only mode')
}

export async function testWorkspaceSourceFilesSyncDocsOnlyModeKeepsCanonicalChatRootFilesVisible() {
  const chatRootPath = '/chat-log/20260527T150000Z/kgc-trace_20260527T150000Z.md'
  const nonCanonicalPath = '/scratch/places-demo.md'
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      {
        kind: 'file',
        path: '/docs/documents/agenticgraph-storage-sync-document.md',
        parentPath: '/docs/documents',
        name: 'agenticgraph-storage-sync-document.md',
        text: '# docs',
        updatedAtMs: 1,
      },
      {
        kind: 'file',
        path: chatRootPath,
        parentPath: '/chat-log/20260527T150000Z',
        name: 'kgc-trace_20260527T150000Z.md',
        text: '# KGC Trace',
        updatedAtMs: 1,
      },
      {
        kind: 'file',
        path: nonCanonicalPath,
        parentPath: '/scratch',
        name: 'places-demo.md',
        text: '# demo',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: {
      '/docs/documents/agenticgraph-storage-sync-document.md': { kind: 'local', originalName: 'agenticgraph-storage-sync-document.md' },
      [chatRootPath]: { kind: 'local', originalName: 'kgc-trace_20260527T150000Z.md' },
      [nonCanonicalPath]: { kind: 'local', originalName: 'places-demo.md' },
    },
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs', '/chat-log'],
  })

  const docs = next.find(f => f.source?.path === 'workspace:/docs/documents/agenticgraph-storage-sync-document.md')
  if (!docs) throw new Error('expected docs canonical workspace source file to remain visible')
  const chatLog = next.find(f => f.source?.path === `workspace:${chatRootPath}`)
  if (!chatLog) throw new Error('expected canonical chat workspace source file to remain visible in Source Files')
  const nonCanonical = next.find(f => f.source?.path === `workspace:${nonCanonicalPath}`)
  if (nonCanonical) throw new Error('expected non-canonical workspace entry to remain excluded in canonical-root mode')
}

export async function testWorkspaceSourceFilesSyncDocsOnlyModeKeepsConfiguredShareExportRootFilesVisible() {
  const shareExportPath = '/docs_/MiroThinker-global-oil-price-trajectory-simulation-20260407/MiroThinker-global-oil-price-trajectory-simulation-20260407.md'
  const chatRootPath = '/chat-log/20260527T150000Z/kgc-trace_20260527T150000Z.md'
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [
      {
        kind: 'file',
        path: shareExportPath,
        parentPath: '/docs_/MiroThinker-global-oil-price-trajectory-simulation-20260407',
        name: 'MiroThinker-global-oil-price-trajectory-simulation-20260407.md',
        text: '# imported share export',
        updatedAtMs: 1,
      },
      {
        kind: 'file',
        path: chatRootPath,
        parentPath: '/chat-log/20260527T150000Z',
        name: 'kgc-trace_20260527T150000Z.md',
        text: '# KGC Trace',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: {
      [shareExportPath]: { kind: 'local', originalName: 'MiroThinker-global-oil-price-trajectory-simulation-20260407.md' },
      [chatRootPath]: { kind: 'local', originalName: 'kgc-trace_20260527T150000Z.md' },
    },
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs_', '/docs', '/chat-log'],
  })

  const shareExport = next.find(f => f.source?.path === `workspace:${shareExportPath}`)
  if (!shareExport) throw new Error('expected configured /docs_ share export workspace file to remain visible in Source Files')
  const chatLog = next.find(f => f.source?.path === `workspace:${chatRootPath}`)
  if (!chatLog) throw new Error('expected canonical chat workspace source file to remain visible alongside configured /docs_ root')
}

export async function testWorkspaceSourceFilesSyncPreservesExistingCanonicalChatRootFilesAcrossActiveOnlyRefresh() {
  const activePath = '/chat-log/20260527T150000Z/kgc_20260527T150000Z.md'
  const existingTracePath = '/chat-log/20260527T150000Z/kgc-trace_20260527T150000Z.md'
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [
      {
        id: 'existing-trace',
        name: 'kgc-trace_20260527T150000Z.md',
        text: '# KGC Trace',
        enabled: false,
        status: 'idle',
        source: { kind: 'local', path: `workspace:${existingTracePath}` },
      },
    ],
    workspaceEntries: [
      {
        kind: 'file',
        path: activePath,
        parentPath: '/chat-log/20260527T150000Z',
        name: 'kgc_20260527T150000Z.md',
        text: '# active',
        updatedAtMs: 1,
      },
    ],
    sourcesByPath: {
      [activePath]: { kind: 'local', originalName: 'kgc_20260527T150000Z.md' },
    },
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs', '/chat-log'],
  })

  const active = next.find(f => f.source?.path === `workspace:${activePath}`)
  if (!active) throw new Error('expected active canonical chat workspace file to remain visible after active-only refresh')
  const trace = next.find(f => f.source?.path === `workspace:${existingTracePath}`)
  if (!trace) throw new Error('expected existing canonical chat trace file to stay visible across active-only refresh')
  if (trace.enabled !== false) throw new Error('expected preserved canonical chat trace file to keep its previous disabled state')
}

export async function testWorkspaceSourceFilesSyncDocsOnlyModeDropsExistingNonWorkspaceEntries() {
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [
      {
        id: 'external-root-readme',
        name: 'workspace-readme.md',
        text: '# external root',
        enabled: true,
        status: 'idle',
        source: { kind: 'url', url: 'https://example.com/workspace-readme.md', path: 'external:root:workspace-readme.md' },
      },
    ],
    workspaceEntries: [
      { kind: 'file', path: '/docs/agenticgraph-storage-sync-cloudflare-d1.md', parentPath: '/docs', name: 'agenticgraph-storage-sync-cloudflare-d1.md', text: '# docs', updatedAtMs: 1 },
    ],
    sourcesByPath: {
      '/docs/agenticgraph-storage-sync-cloudflare-d1.md': { kind: 'local', originalName: 'agenticgraph-storage-sync-cloudflare-d1.md' },
    },
    workspaceDocsOnly: true,
  })

  const externalRoot = next.find(f => f.id === 'external-root-readme')
  if (externalRoot) throw new Error('expected docs-only mode to remove existing non-workspace source files')
  const docs = next.find(f => f.source?.path === 'workspace:/docs/agenticgraph-storage-sync-cloudflare-d1.md')
  if (!docs) throw new Error('expected docs-only mode to keep docs mirrored source files')
}

export async function testWorkspaceSeedSourceFilesResolveCurrentSeedsToCanonicalSourcePath() {
  if (resolveWorkspaceSeedSourcePath(WORKSPACE_README_SEED_PATH) !== WORKSPACE_README_SOURCE_PATH) {
    throw new Error('expected README workspace seed path to resolve onto the canonical README source-file path')
  }
  if (resolveWorkspaceSeedSourcePath(TEST_VALIDATION_WORKSPACE_SEED_PATH) !== TEST_VALIDATION_SOURCE_PATH) {
    throw new Error('expected validation workspace seed path to resolve onto the canonical validation source-file path')
  }
  if (resolveWorkspaceSeedSourcePath(GEOSPATIAL_WORKSPACE_SEED_PATH) !== GEOSPATIAL_WORKSPACE_SOURCE_PATH) {
    throw new Error('expected geospatial workspace seed path to resolve onto the canonical geospatial source-file path')
  }
  if (resolveWorkspaceSeedSourcePath('/docs/documents/agenticgraph-storage-sync-document.md') !== 'workspace:/docs/documents/agenticgraph-storage-sync-document.md') {
    throw new Error('expected docs-mirrored workspace paths to resolve into canonical workspace source-file paths')
  }
  if (
    resolveWorkspaceSeedSourcePath(ABSOLUTE_DOCS_VIDEO_DEMO_PATH)
    !== 'workspace:/docs/agenticgraph-video-demo.md'
  ) {
    throw new Error('expected absolute docs file paths to resolve into canonical /docs workspace source-file paths')
  }
  if (
    resolveWorkspaceSeedSourcePath('/docs/huijoohwee/docs/agenticgraph-video-demo.md')
    !== 'workspace:/docs/agenticgraph-video-demo.md'
  ) {
    throw new Error('expected duplicated docs prefix paths to collapse into canonical /docs workspace source-file paths')
  }
  if (resolveWorkspaceSeedSourcePath('/notes/custom.md') !== null) {
    throw new Error('expected non-seed workspace paths to stay outside canonical seed source-file remapping')
  }
}

export async function testWorkspaceSeedSourceFilesResolveBundledValidationAliasToCanonicalSourcePath() {
  const docsValidationAliasPath = `/${TEST_VALIDATION_WORKSPACE_SEED_REL_PATH}`
  if (resolveWorkspaceSeedSourcePath(docsValidationAliasPath) !== TEST_VALIDATION_SOURCE_PATH) {
    throw new Error('expected bundled validation docs alias to resolve onto the canonical validation source-file path')
  }
  if (resolveWorkspaceSourcePathKey(docsValidationAliasPath) !== TEST_VALIDATION_SOURCE_PATH) {
    throw new Error('expected bundled validation docs alias source key to reuse the canonical validation source-file path')
  }
}

export async function testWorkspaceSourceFilesSyncResolvesCanonicalSourceKeyForSeedAliases() {
  const docsValidationAliasPath = `/${TEST_VALIDATION_WORKSPACE_SEED_REL_PATH}`
  const absoluteDocsPath = ABSOLUTE_DOCS_VIDEO_DEMO_PATH
  if (resolveWorkspaceSourcePathKey(docsValidationAliasPath) !== TEST_VALIDATION_SOURCE_PATH) {
    throw new Error('expected configured docs validation seed path to resolve onto canonical validation source-file key')
  }
  if (resolveWorkspaceSourcePathKey(absoluteDocsPath) !== 'workspace:/docs/agenticgraph-video-demo.md') {
    throw new Error('expected absolute docs path to resolve onto canonical docs workspace source-file key')
  }
  if (resolveWorkspaceSourcePathKey('/docs/huijoohwee/docs/agenticgraph-video-demo.md') !== 'workspace:/docs/agenticgraph-video-demo.md') {
    throw new Error('expected duplicated docs workspace path to resolve onto canonical docs workspace source-file key')
  }
}

export async function testWorkspaceSeedSourceFilesReconcilePersistedDefaultFamilyToCanonicalOrder() {
  const next = reconcileDefaultWorkspaceSeedSourceFiles([
    {
      id: 'readme',
      name: 'workspace-readme.md',
      text: '# Readme',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: WORKSPACE_README_SOURCE_PATH },
    },
  ])

  if (next.length !== 3) throw new Error(`expected canonical default source-file family to contain exactly three entries, got ${next.length}`)
  if (next[0]?.source?.path !== WORKSPACE_README_SOURCE_PATH) {
    throw new Error('expected reconciled default source-file family to restore README first')
  }
  if (next[1]?.source?.path !== TEST_VALIDATION_SOURCE_PATH) {
    throw new Error('expected reconciled default source-file family to restore validation demo second')
  }
  if (next[2]?.source?.path !== GEOSPATIAL_WORKSPACE_SOURCE_PATH) {
    throw new Error('expected reconciled default source-file family to restore geospatial demo third')
  }
  if (next[0]?.enabled !== true) throw new Error('expected reconciled README seed source file to stay enabled')
  if (next[1]?.enabled !== false) throw new Error('expected reconciled validation demo seed source file to stay disabled')
  if (next[2]?.enabled !== false) throw new Error('expected reconciled geospatial seed source file to stay disabled')
}

export async function testWorkspaceSeedSourceFilesReconcilePreservesEnabledValidationSeed() {
  const next = reconcileDefaultWorkspaceSeedSourceFiles([
    {
      id: 'readme',
      name: 'README.md',
      text: '# README',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: WORKSPACE_README_SOURCE_PATH },
    },
    {
      id: 'validation',
      name: 'agenticgraph-demo-video.md',
      text: '# Validation',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: TEST_VALIDATION_SOURCE_PATH },
    },
  ])

  const validation = next.find(file => file.source?.path === TEST_VALIDATION_SOURCE_PATH)
  if (!validation) throw new Error('expected canonical validation seed source file to remain present after reconciliation')
  if (validation.enabled !== true) {
    throw new Error('expected canonical seed reconciliation to preserve an already-enabled validation source file')
  }
}
