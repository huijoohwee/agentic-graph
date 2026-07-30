import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import path from 'node:path'
import os from 'node:os'
import fsPromises from 'node:fs/promises'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { readEnvString, readEnvStringFromRecord } from '@/lib/config.env'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { SourceFilesPersistenceBootstrap } from '@/features/source-files/SourceFilesPersistenceBootstrap'
import {
  createWorkspaceStartupSourceRootEntriesReader,
  resolveExistingWorkspaceStartupCanonicalPath,
  resolveWorkspaceStartupActivePathToApply,
  resolveWorkspaceStartupCanonicalPath,
  shouldInitializeWorkspaceStartupDefaultStarter,
} from '@/features/source-files/sourceFilesRuntimeStartup'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import {
  buildInitialWorkspaceStartupSnapshot,
  buildMaterializedWorkspaceActivePathKey,
  buildMaterializedWorkspaceForceIncludePaths,
  hydrateWorkspaceEntriesInlineText,
  materializeActiveWorkspaceEntryIntoSourceFiles,
  readReusableWorkspaceEntriesSnapshot,
  readWorkspaceActiveEntrySnapshot,
  readWorkspaceSourceRootEntriesSnapshot,
  resolveMaterializedWorkspaceActivePath,
} from '@/features/source-files/sourceFilesRuntimeShared'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  GEOSPATIAL_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  WORKSPACE_README_SEED_PATH,
  XR_PHYSICS_WORKSPACE_SEED_PATH,
  resolveWorkspaceStartupActivePath,
  sortWorkspaceEntriesForExplorer,
} from '@/features/workspace-fs/workspaceFs'
import {
  resolveWorkspaceSourceIndexSnapshot,
  readReusableWorkspaceSourceIndexSnapshot,
  setWorkspaceEntrySource,
} from '@/features/workspace-fs/sourceIndex'
import {
  buildFailedWorkspaceRefreshSnapshot,
  pruneWorkspaceEntriesForInlineSnapshot,
  buildWorkspaceRefreshSnapshot,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.shared'
import {
  resolveWorkspaceEntryInlineText,
  resolveWorkspaceSourceFileInlineText,
  upsertWorkspaceEntryInlineText,
} from '@/features/workspace-fs/workspaceInlineText'
import {
  applyActiveMarkdownDocumentPayload,
  buildActiveMarkdownDocumentPayload,
} from '@/features/markdown/activeMarkdownDocument'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
import {
  ensureWorkspaceChatMirrorFolder,
  ensureWorkspaceDocsMirrorFolder,
  readWorkspaceInitializationDocsMirrorEntries,
  upsertWorkspaceChatMirrorText,
  upsertWorkspaceDocsMirrorText,
  readWorkspaceInitializationSeedText,
  upsertWorkspaceInitializationSeedText,
} from '@/features/workspace-fs/workspaceSeedProvider'
import { shouldTrustEmptyWorkspaceSelectionCache } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceIndexing'

const normalizeFsPath = (value: string): string => String(value || '').replace(/\\/g, '/')
const KG_GITHUB_ROOT = normalizeFsPath(path.resolve(process.cwd(), '..', '..'))
const KG_HUIJOOHWEE_DOCS_ROOT = `${KG_GITHUB_ROOT}/huijoohwee/docs`
const KG_HUIJOOHWEE_CHAT_LOG_ROOT = `${KG_GITHUB_ROOT}/huijoohwee/chat-log`
const KG_KNOWGRPH_DOCS_ROOT = `${KG_GITHUB_ROOT}/knowgrph/docs`
const KG_HUIJOOHWEE_DOCS_FS_PREFIX = `/@fs${KG_HUIJOOHWEE_DOCS_ROOT}`
const MIRROR_REPAIR_FIXTURE_BASENAME = 'mirror-active-validation.md'
const MIRROR_REPAIR_FIXTURE_PATH = `/docs/${MIRROR_REPAIR_FIXTURE_BASENAME}`

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
    if (afterEnsureSeedAgain.some(e => e.kind === 'file')) {
      throw new Error('expected ensureSeed not to reseed after user deleted all files')
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
          name: 'knowgrph-maps-grabmap-multim-demo.md',
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
      '/notes/knowgrph-pitchdeck.md',
    ],
    activePath: '/notes/knowgrph-pitchdeck.md' as never,
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
      VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH: 'huijoohwee.github.io/template/knowgrph-video-script-template.md',
    },
    'VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH',
  )
  if (next !== 'huijoohwee.github.io/template/knowgrph-video-script-template.md') {
    throw new Error(`expected import-meta style env record to win, got ${String(next)}`)
  }
}

export function testCanvasEnvBridgeFallsBackToProcessEnvOutsideBrowser() {
  const prev = process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH
  process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH = 'huijoohwee.github.io/template/knowgrph-video-script-template.md'
  try {
    const next = readEnvString(
      'VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH',
      'docs/default-validation.md',
    )
    if (next !== 'huijoohwee.github.io/template/knowgrph-video-script-template.md') {
      throw new Error(`expected process env fallback to resolve custom validation target, got ${String(next)}`)
    }
  } finally {
    if (typeof prev === 'string') process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH = prev
    else delete process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH
  }
}

export function testCanvasEnvBridgeReadsKnowgrphStorageBaseUrlFromProcessEnv() {
  const prev = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'http://127.0.0.1:8787'
  try {
    const next = readEnvString('VITE_KNOWGRPH_STORAGE_BASE_URL', '')
    if (next !== 'http://127.0.0.1:8787') {
      throw new Error(`expected storage base url to be readable through canvas env bridge, got ${String(next)}`)
    }
  } finally {
    if (typeof prev === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = prev
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  }
}

export async function testWorkspaceBootstrapMaterializesActiveWorkspaceEntryIntoParsedSourceFile() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        {
          path: '/huijoohwee.github.io/template/knowgrph-video-script-template.md',
          parentPath: '/huijoohwee.github.io/template',
          kind: 'file',
          name: 'knowgrph-video-script-template.md',
          text: [
            '---',
            'title: "Knowgrph · Video Script Template"',
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
      activePathOverride: '/huijoohwee.github.io/template/knowgrph-video-script-template.md' as never,
      fs,
      applyToGraph: true,
    })
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const state = useGraphStore.getState()
    const sourceFile = state.sourceFiles.find(
      file => file.source?.path === 'workspace:/huijoohwee.github.io/template/knowgrph-video-script-template.md',
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
  const baseFs = createMemoryWorkspaceFs()
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
  await fs.ensureSeed()
  const workspaceEntries = await fs.listEntries()

  const reused = await readWorkspaceActiveEntrySnapshot({ fs, activePath: WORKSPACE_README_SEED_PATH, workspaceEntries })
  if (reused.length !== 1 || reused[0]?.path !== WORKSPACE_README_SEED_PATH) {
    throw new Error(`expected shared workspace active snapshot helper to return only the active entry from a provided snapshot, got ${JSON.stringify(reused)}`)
  }

  const activeOnly = await readWorkspaceActiveEntrySnapshot({ fs, activePath: TEST_VALIDATION_WORKSPACE_SEED_PATH })
  if (activeOnly.length !== 1 || activeOnly[0]?.path !== TEST_VALIDATION_WORKSPACE_SEED_PATH) {
    throw new Error(`expected shared workspace active snapshot helper to read only the requested active file when no snapshot is provided, got ${JSON.stringify(activeOnly)}`)
  }
  if (listEntriesCalls !== 1 || readFileTextCalls !== 1) {
    throw new Error(`expected active snapshot helper to avoid full relists and read only one active file, got ${String(listEntriesCalls)} listEntries and ${String(readFileTextCalls)} readFileText calls`)
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

export async function testWorkspaceSeedProviderPrefersConfiguredAbsoluteDocsRoot() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  const previousFetch = globalThis.fetch
  const calls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    calls.push(url)
    if (url.includes(`${KG_HUIJOOHWEE_DOCS_FS_PREFIX}/knowgrph-video-demo.md`)) {
      return new Response('# absolute docs seed', { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  try {
    const text = await readWorkspaceInitializationSeedText({
      basename: 'knowgrph-video-demo.md',
      relPathCandidates: ['docs/knowgrph-video-demo.md'],
    })
    if (text !== '# absolute docs seed') {
      throw new Error(`expected absolute docs seed provider path to win, got ${String(text || '')}`)
    }
    if (!calls.some(url => url.includes(`${KG_HUIJOOHWEE_DOCS_FS_PREFIX}/knowgrph-video-demo.md`))) {
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

export async function testWorkspaceSeedProviderResolvesDocsWorkspaceSeedsFromConfiguredAbsoluteDocsRoot() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  const previousFetch = globalThis.fetch
  const calls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    calls.push(url)
    if (url.includes(`/@fs${KG_KNOWGRPH_DOCS_ROOT}/workspace-seeds/knowgrph-video-demo.md`)) {
      return new Response('# docs workspace-seeds absolute root', { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  try {
    const text = await readWorkspaceInitializationSeedText({
      basename: 'knowgrph-video-demo.md',
      relPathCandidates: ['docs/workspace-seeds/knowgrph-video-demo.md', 'docs/knowgrph-video-demo.md'],
    })
    if (text !== '# docs workspace-seeds absolute root') {
      throw new Error(`expected docs/workspace-seeds absolute docs-root seed to resolve, got ${String(text || '')}`)
    }
    if (!calls.some(url => url.includes(`/@fs${KG_KNOWGRPH_DOCS_ROOT}/workspace-seeds/knowgrph-video-demo.md`))) {
      throw new Error('expected workspace seed provider to probe the canonical Knowgrph workspace-seeds root')
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

export async function testWorkspaceSeedProviderBrowserUpsertWritesViaKgFsProxy() {
  const previousWindow = globalThis.window
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const calls: Array<{ url: string; body: string }> = []
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
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
      basename: 'knowgrph-video-demo.md',
      text: '# mirrored seed',
    })
    if (!ok) {
      throw new Error('expected browser upsert to succeed through /__kg_fs_write proxy')
    }
    const writeCall = calls.find(call => call.url === '/__kg_fs_write')
    if (!writeCall) {
      throw new Error('expected workspace seed provider to call /__kg_fs_write in browser mode')
    }
    if (!writeCall.body.includes(`${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md`)) {
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
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
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
      workspacePath: '/docs/20260527T123654Z/kgc-trace_20260527T123654Z.md',
      text: '# streamed',
    })
    if (!folderOk || !fileOk) {
      throw new Error('expected browser docs mirror writes to succeed through /__kg_fs_write proxy')
    }
    const folderCall = calls.find(call => call.body.includes('"mkdirOnly":true'))
    if (!folderCall || !folderCall.body.includes(`${KG_HUIJOOHWEE_DOCS_ROOT}/20260527T123654Z`)) {
      throw new Error('expected docs mirror folder creation payload to target configured docs absolute path')
    }
    const fileCall = calls.find(call => call.body.includes('kgc-trace_20260527T123654Z.md'))
    if (!fileCall || !fileCall.body.includes(`${KG_HUIJOOHWEE_DOCS_ROOT}/20260527T123654Z/kgc-trace_20260527T123654Z.md`)) {
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
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
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
      workspacePath: '/docs/20260527T123654Z/kgc-trace_20260527T123654Z.md',
      text: '# streamed while hidden',
    })
    if (fileOk) {
      throw new Error('expected hidden-document docs mirror writes to be skipped during browser teardown')
    }
    if (calls.some(call => call.url === '/__kg_fs_write')) {
      throw new Error('expected hidden-document docs mirror writes not to call /__kg_fs_write while the page is hidden')
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
  process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = KG_HUIJOOHWEE_CHAT_LOG_ROOT
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
      workspacePath: '/chat-log/20260527T123654Z/kgc-trace_20260527T123654Z.md',
      text: '# streamed',
    })
    if (!folderOk || !fileOk) {
      throw new Error('expected browser chat-log mirror writes to succeed through /__kg_fs_write proxy')
    }
    const folderCall = calls.find(call => call.body.includes('"mkdirOnly":true'))
    if (!folderCall || !folderCall.body.includes(`${KG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260527T123654Z`)) {
      throw new Error('expected chat-log mirror folder creation payload to target sibling chat-log absolute path')
    }
    const fileCall = calls.find(call => call.body.includes('kgc-trace_20260527T123654Z.md'))
    if (!fileCall || !fileCall.body.includes(`${KG_HUIJOOHWEE_CHAT_LOG_ROOT}/20260527T123654Z/kgc-trace_20260527T123654Z.md`)) {
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

export async function testWorkspaceSeedProviderReadsDocsMirrorFromSelectedLocalFolderHandle() {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  type MockFsEntry = {
    kind: 'file' | 'directory'
    name: string
    entries?: () => AsyncIterable<[string, MockFsEntry]>
    getDirectoryHandle?: (name: string) => Promise<MockFsEntry>
    getFile?: () => Promise<File>
  }
  const makeDirectoryEntry = (name: string, children: Record<string, MockFsEntry>): MockFsEntry => ({
    kind: 'directory',
    name,
    entries: async function* () {
      const keys = Object.keys(children).sort((a, b) => a.localeCompare(b))
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]!
        const child = children[key]
        if (!child) continue
        yield [key, child]
      }
    },
    getDirectoryHandle: async (childName: string) => {
      const child = children[String(childName || '').trim()]
      if (!child || child.kind !== 'directory') throw new Error(`missing directory ${childName}`)
      return child
    },
  })
  const makeFileEntry = (name: string, text: string, lastModified: number): MockFsEntry => ({
    kind: 'file',
    name,
    getFile: async () => new File([text], name, { lastModified }),
  })
  const workspaceSeedsDir = makeDirectoryEntry('workspace-seeds', {
    'knowgrph-video-demo.md': makeFileEntry('knowgrph-video-demo.md', '# seed from selected folder handle', 1710000000000),
    'ignore.txt': makeFileEntry('ignore.txt', 'ignore me', 1710000000000),
  })
  const docsDir = makeDirectoryEntry('docs', {
    'workspace-seeds': workspaceSeedsDir,
  })
  const rootDir = makeDirectoryEntry('root', {
    docs: docsDir,
  })

  try {
    store.setLocalMarkdownFolderHandle(rootDir as unknown as FileSystemDirectoryHandle, { accessMode: 'fs-access', name: 'root' })
    store.setLocalMarkdownSelectedFolderPath('docs/workspace-seeds')
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('seed from selected folder handle')) {
      throw new Error(`expected docs mirror to read markdown from selected local folder handle, got ${JSON.stringify(mirrored)}`)
    }
    if (mirrored.some(entry => String(entry.relPath || '').toLowerCase().endsWith('.txt'))) {
      throw new Error('expected docs mirror to include markdown-like files only from selected local folder handle')
    }
  } finally {
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
  }
}

export async function testWorkspaceSeedProviderKeepsEmptyAndModelAssetDocsMirrorFiles() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-docs-mirror-'))
  const glbBytes = Buffer.from([0x67, 0x6c, 0x54, 0x46])
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tmpRoot
    await fsPromises.writeFile(path.join(tmpRoot, 'empty-placeholder.md'), '')
    await fsPromises.writeFile(path.join(tmpRoot, 'model.gltf'), '{"asset":{"version":"2.0"}}')
    await fsPromises.writeFile(path.join(tmpRoot, 'model.glb'), glbBytes)

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
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tmpRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceSourceRootSnapshotKeepsFullDocsTreeForSourceFilesSync() {
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      { path: '/docs/active.md', parentPath: '/docs', kind: 'file', name: 'active.md', text: '# Active', updatedAtMs: 2 },
      { path: '/docs/empty-placeholder.md', parentPath: '/docs', kind: 'file', name: 'empty-placeholder.md', text: '', updatedAtMs: 3 },
      { path: '/docs/model.gltf', parentPath: '/docs', kind: 'file', name: 'model.gltf', text: '{"asset":{"version":"2.0"}}', updatedAtMs: 4 },
    ],
  })
  const snapshot = await readWorkspaceSourceRootEntriesSnapshot({
    fs,
    activePath: '/docs/active.md',
  })
  const paths = snapshot
    .filter(entry => entry.kind === 'file')
    .map(entry => entry.path)
    .sort()
  for (const expectedPath of ['/docs/active.md', '/docs/empty-placeholder.md', '/docs/model.gltf']) {
    if (!paths.includes(expectedPath)) {
      throw new Error(`expected Source Files sync snapshot to keep full docs tree path ${expectedPath}, got ${JSON.stringify(paths)}`)
    }
  }
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
    store.setLocalMarkdownSelectedFolderPath(KG_HUIJOOHWEE_DOCS_ROOT)
    store.setSourceFiles([
      {
        id: 'sf-remote-video',
        name: 'knowgrph-video-demo.md',
        text: '# remote source files state',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md` },
      },
      {
        id: 'sf-outside-root',
        name: 'outside.md',
        text: '# outside root should be ignored',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${KG_KNOWGRPH_DOCS_ROOT}/outside.md` },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
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
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  try {
    delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    delete process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath(null)
    store.setSourceFiles([
      {
        id: 'sf-docs-double',
        name: 'docs/docs/knowgrph-video-demo.md',
        text: '# dedupe docs prefix',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'docs/docs/knowgrph-video-demo.md' },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    if (mirrored.length !== 1 || mirrored[0]?.relPath !== 'knowgrph-video-demo.md') {
      throw new Error(`expected redundant docs/docs prefix to collapse to single mirror relPath, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
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
    store.setLocalMarkdownSelectedFolderPath(KG_HUIJOOHWEE_DOCS_ROOT)
    store.setSourceFiles([
      {
        id: 'sf-relative-docs',
        name: 'docs/knowgrph-video-demo.md',
        text: '# relative docs path should map',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'docs/knowgrph-video-demo.md' },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
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
    store.setLocalMarkdownSelectedFolderPath(`${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-maps-places.md`)
    store.setSourceFiles([
      {
        id: 'sf-selected-file-path',
        name: 'docs/knowgrph-video-demo.md',
        text: '# selected file path should still include sibling docs',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'docs/knowgrph-video-demo.md' },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
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


export async function testWorkspaceSeedProviderPrefersKnowgrphStorageExportWhenConfigured() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000005000,
      documents: [
        {
          id: 'sf:video',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md`,
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# from knowgrph storage export',
          contentHash: 'x',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000005000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('from knowgrph storage export')) {
      throw new Error(`expected docs mirror to prefer knowgrph storage export when configured, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}

export async function testWorkspaceSeedProviderPrefersSourceFilesDocViewOverLargerStorageExportDataset() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (url.includes('/api/storage/doc/')) {
      if (
        url.includes(encodeURIComponent('huijoohwee/docs/knowgrph-video-demo.md'))
        || url.includes(encodeURIComponent('docs/knowgrph-video-demo.md'))
      ) {
        return new Response('# from source-files doc view', { status: 200 })
      }
      return new Response('', { status: 404 })
    }
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000007000,
      documents: [
        {
          id: 'sf:maps',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/workspace-readme.md`,
          title: 'workspace-readme.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# stale export maps',
          contentHash: 'maps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006900,
          deleted: false,
        },
        {
          id: 'sf:grabmaps',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-maps-grabmap-multim-demo.md`,
          title: 'knowgrph-maps-grabmap-multim-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# stale export grabmaps',
          contentHash: 'grabmaps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006950,
          deleted: false,
        },
        {
          id: 'sf:video',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md`,
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# stale export video',
          contentHash: 'video',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000007000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([
      {
        id: 'sf-video',
        name: 'knowgrph-video-demo.md',
        text: '',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md` },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    if (mirrored.length !== 1 || mirrored[0]?.relPath !== 'knowgrph-video-demo.md') {
      throw new Error(`expected source-files doc view to stay authoritative for selected workspace files, got ${JSON.stringify(mirrored)}`)
    }
    if (String(mirrored[0]?.text || '').trim() !== '# from source-files doc view') {
      throw new Error(`expected source-files doc view to beat larger stale storage export dataset, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}

export async function testWorkspaceSeedProviderPrefersCompleteStorageExportDatasetForSync() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (url.includes('/api/storage/doc/')) {
      if (
        url.includes(encodeURIComponent('huijoohwee/docs/knowgrph-video-demo.md'))
        || url.includes(encodeURIComponent('docs/knowgrph-video-demo.md'))
      ) {
        return new Response('# from source-files doc view', { status: 200 })
      }
      return new Response('', { status: 404 })
    }
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000007000,
      documents: [
        {
          id: 'sf:maps',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/workspace-readme.md`,
          title: 'workspace-readme.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# export maps',
          contentHash: 'maps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006900,
          deleted: false,
        },
        {
          id: 'sf:grabmaps',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-maps-grabmap-multim-demo.md`,
          title: 'knowgrph-maps-grabmap-multim-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# export grabmaps',
          contentHash: 'grabmaps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006950,
          deleted: false,
        },
        {
          id: 'sf:video',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md`,
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# export video',
          contentHash: 'video',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000007000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([
      {
        id: 'sf-video',
        name: 'knowgrph-video-demo.md',
        text: '',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md` },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    if (mirrored.length !== 3) {
      throw new Error(`expected sync mirror to prefer fuller storage export dataset, got ${JSON.stringify(mirrored)}`)
    }
    const relPaths = mirrored.map(entry => entry.relPath)
    if (!relPaths.includes('knowgrph-video-demo.md') || !relPaths.includes('workspace-readme.md')) {
      throw new Error(`expected sync mirror to keep exported docs set, got ${JSON.stringify(mirrored)}`)
    }
    const video = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
    if (String(video?.text || '').trim() !== '# export video') {
      throw new Error(`expected sync mirror to use export text for complete dataset mode, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}

export async function testWorkspaceSeedProviderStorageExportRebuildsMarkdownFromChunksWhenContentMdBlank() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000006000,
      documents: [
        {
          id: 'docs:video_demo',
          workspaceId: 'kgws:test',
          canonicalPath: `${KG_HUIJOOHWEE_DOCS_ROOT}/knowgrph-video-demo.md`,
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '',
          contentHash: 'sha256:video-demo',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006000,
          deleted: false,
        },
      ],
      documentChunks: [
        {
          id: 'chunk:video_demo:1',
          documentId: 'docs:video_demo',
          workspaceId: 'kgws:test',
          chunkKey: 'second',
          chunkOrder: 1,
          heading: null,
          markdown: 'from chunk 2',
          tokenEstimate: 2,
          contentHash: 'sha256:c2',
          updatedAtMs: 1710000006002,
        },
        {
          id: 'chunk:video_demo:0',
          documentId: 'docs:video_demo',
          workspaceId: 'kgws:test',
          chunkKey: 'first',
          chunkOrder: 0,
          heading: null,
          markdown: '# from chunk 1',
          tokenEstimate: 3,
          contentHash: 'sha256:c1',
          updatedAtMs: 1710000006001,
        },
      ],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'knowgrph-video-demo.md') || null
    if (!target || String(target.text || '').trim() !== '# from chunk 1\n\nfrom chunk 2') {
      throw new Error(`expected docs mirror to reconstruct markdown from export chunks when contentMd is blank, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}

export async function testWorkspaceSeedProviderUsesSameOriginStoragePathOnLocalhostDev() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  const capturedRequestUrls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    capturedRequestUrls.push(String(typeof input === 'string' ? input : (input as URL).toString()))
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000005000,
      documents: [],
      documentChunks: [],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    await readWorkspaceInitializationDocsMirrorEntries()
    if (!capturedRequestUrls.some(url => url.startsWith('/api/storage/export/'))) {
      throw new Error(`expected localhost dev storage export call to use same-origin proxy path, got ${JSON.stringify(capturedRequestUrls)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}

export async function testRuntimeSourceFilesReflectWorkspaceSeedFileContentChanges() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null
  const { restore } = initJsdomHarness()
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  let docsText = '# seed v1\n\nruntime reflection baseline'
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (url.includes(`${KG_HUIJOOHWEE_DOCS_FS_PREFIX}/knowgrph-video-demo.md`)) {
      return new Response(docsText, { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch

  const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (predicate()) return
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
    const debugPaths = useGraphStore
      .getState()
      .sourceFiles
      .map(file => `${String(file.name || '')}::${String(file.source?.path || '')}`)
      .slice(0, 8)
    throw new Error(`timed out waiting for runtime source-file seed reflection; sourceFiles=${JSON.stringify(debugPaths)}`)
  }

  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setSourceFiles([])
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const entries = await fs.listEntries()
    const validationEntryPath = String(
      entries.find(entry => entry.kind === 'file' && String(entry.name || '') === 'knowgrph-video-demo.md')?.path || '',
    ).trim()
    if (!validationEntryPath) {
      throw new Error('expected runtime test workspace seed bootstrap to include knowgrph-video-demo.md entry')
    }
    useMarkdownExplorerStore.getState().setActivePath(validationEntryPath as never)
    const seededText = await fs.readFileText(validationEntryPath as never)
    if (!String(seededText || '').includes('seed v1')) {
      throw new Error(`expected workspace seed file text to load v1 before runtime mount, got ${String(seededText || '')}`)
    }

    const container = document.createElement('section')
    document.body.appendChild(container)
    await act(async () => {
      root = createRoot(container)
      root.render(React.createElement(SourceFilesPersistenceBootstrap))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })

    docsText = '# seed v2\n\nruntime reflection updated'
    await new Promise<void>(resolve => setTimeout(resolve, 80))
    await fs.ensureSeed()
    const seededTextAfterUpdate = await fs.readFileText(validationEntryPath as never)
    if (!String(seededTextAfterUpdate || '').includes('seed v2')) {
      throw new Error(`expected workspace seed file text to update to v2, got ${String(seededTextAfterUpdate || '')}`)
    }
    await waitFor(() => {
      const file = useGraphStore.getState().sourceFiles.find(entry => {
        const sourcePath = String(entry.source?.path || '')
        const name = String(entry.name || '')
        return sourcePath.startsWith('workspace:') && (name === 'knowgrph-video-demo.md' || sourcePath.includes('knowgrph-video-demo.md'))
      })
      return Boolean(file && String(file.text || '').includes('seed v2'))
    })
  } finally {
    try {
      await act(async () => {
        root?.unmount()
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      })
    } catch {
      void 0
    }
    restore()
    resetWorkspaceFsForTests()
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
  }
}

export async function testRuntimeSourceFilesSyncsFullDocsMirrorTree() {
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  let root: ReturnType<typeof createRoot> | null = null
  const { restore } = initJsdomHarness()
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (url.endsWith('/__kg_fs_list')) {
      return new Response(JSON.stringify({
        ok: true,
        files: [
          { relPath: 'active.md', text: '# Active', updatedAtMs: 10 },
          { relPath: 'empty-placeholder.md', text: '', updatedAtMs: 11 },
          { relPath: 'model.glb', text: Buffer.from([0x67, 0x6c, 0x54, 0x46]).toString('base64'), updatedAtMs: 12 },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch

  const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (predicate()) return
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
    const debugPaths = useGraphStore
      .getState()
      .sourceFiles
      .map(file => `${String(file.name || '')}::${String(file.source?.path || '')}`)
    throw new Error(`timed out waiting for full docs mirror Source Files sync; sourceFiles=${JSON.stringify(debugPaths)}`)
  }

  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setSourceFiles([])
    useMarkdownExplorerStore.getState().setActivePath('/docs/active.md')
    const container = document.createElement('section')
    document.body.appendChild(container)
    await act(async () => {
      root = createRoot(container)
      root.render(React.createElement(SourceFilesPersistenceBootstrap))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })
    await waitFor(() => {
      const sourcePaths = new Set(useGraphStore.getState().sourceFiles.map(file => String(file.source?.path || '')))
      return sourcePaths.has('workspace:/docs/active.md')
        && sourcePaths.has('workspace:/docs/empty-placeholder.md')
        && sourcePaths.has('workspace:/docs/model.glb')
    })
  } finally {
    try {
      await act(async () => {
        root?.unmount()
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      })
    } catch {
      void 0
    }
    restore()
    resetWorkspaceFsForTests()
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
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
    readFileText: async (path: string) => (String(path || '').trim() === '/docs/knowgrph-video-demo.md' ? '# hydrated from fs' : null),
    writeFileText: async () => void 0,
    createFile: async () => '/docs/tmp.md',
    createFolder: async () => '/docs',
    deleteEntry: async () => void 0,
  }
  const entries = [
    {
      path: '/docs/knowgrph-video-demo.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-video-demo.md',
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

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterLabelResidue() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-label-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: floating_media_ingestion_source',
    '      type: FloatingPanelMediaSourceWidget',
    '      label: {key: label, type: string, value: "FloatingPanel Media Source"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: floating_media_ingestion_source',
    '      type: FloatingPanelMediaSourceWidget',
    '      label: {key: label, type: string, value: "FloatingPanel Media SourceFloatingPanel Media Source XFloatingPanel Media Source TEST-629B"}',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: staleText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror text to replace corrupted local label residue, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 1 || writes[0]?.path !== MIRROR_REPAIR_FIXTURE_PATH || String(writes[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror reconciliation to repair persisted workspace text once, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterNodeTypeResidue() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-node-type-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidgetComputeWidget stale ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: staleText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror text to replace corrupted local node type residue, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 1 || writes[0]?.path !== MIRROR_REPAIR_FIXTURE_PATH || String(writes[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror reconciliation to repair persisted workspace node type text once, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterNodeStringPropertyResidue() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-property-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary" })',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary" })inputs => ({ outputSrcDoc: "frame summary" }) // stale append',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: staleText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror text to replace corrupted local property residue, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 1 || writes[0]?.path !== MIRROR_REPAIR_FIXTURE_PATH || String(writes[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror reconciliation to repair persisted workspace property text once, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterEdgeStringResidue() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-edge-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_targetinput_metric_targetinput_metric_target // stale append"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: staleText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror text to replace corrupted local edge residue, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 1 || writes[0]?.path !== MIRROR_REPAIR_FIXTURE_PATH || String(writes[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror reconciliation to repair persisted workspace edge text once, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterEdgeEndpointResidue() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-edge-endpoint-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_inputsource_input stale source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summarycompute_summary stale compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: staleText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror text to replace corrupted local edge endpoint residue, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 1 || writes[0]?.path !== MIRROR_REPAIR_FIXTURE_PATH || String(writes[0]?.text || '').trim() !== canonicalText.trim()) {
      throw new Error(`expected canonical docs mirror reconciliation to repair persisted workspace edge endpoint text once, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotKeepsOrdinaryFrontmatterStringEdits() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-no-clobber-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary" })',
    '---',
    '',
  ].join('\n')
  const userEditedText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary V2"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary v2" })',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: userEditedText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== userEditedText.trim()) {
      throw new Error(`expected ordinary frontmatter edits to survive startup without canonical override, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 0) {
      throw new Error(`expected ordinary frontmatter edits to avoid repair writeback, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testHydrateWorkspaceEntriesInlineTextFallsBackToKnowgrphStorageDocWhenFsTextIsBlank() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
  const previousFetch = globalThis.fetch
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = 'kgws:test-fallback'
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/doc/')) return new Response('', { status: 404 })
    const hasCanonicalDocsPath =
      url.includes(encodeURIComponent('huijoohwee/docs/knowgrph-video-demo.md'))
      || url.includes(encodeURIComponent('docs/knowgrph-video-demo.md'))
    if (!hasCanonicalDocsPath) return new Response('', { status: 404 })
    return new Response('# hydrated from storage fallback', { status: 200 })
  }) as typeof fetch
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const entries = [
      {
        path: '/docs/knowgrph-video-demo.md',
        parentPath: '/docs',
        kind: 'file',
        name: 'knowgrph-video-demo.md',
        text: '',
        updatedAtMs: 1,
      },
    ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
    const hydrated = await hydrateWorkspaceEntriesInlineText({ fs, workspaceEntries: entries })
    if (hydrated === entries) throw new Error('expected blank docs workspace entry text to fallback-hydrate from knowgrph storage doc endpoint')
    if (String(hydrated[0]?.text || '').trim() !== '# hydrated from storage fallback') {
      throw new Error(`expected docs entry fallback hydration from knowgrph storage doc endpoint, got ${String(hydrated[0]?.text || '')}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
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

export async function testHydrateWorkspaceEntriesInlineTextStorageFallbackCanonicalizesDuplicatedDocsPrefixPath() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
  const previousFetch = globalThis.fetch
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = 'kgws:test-fallback-canonical'
  const capturedUrls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    if (!url.includes('/api/storage/doc/')) return new Response('', { status: 404 })
    const hasCanonicalDocsPath =
      url.includes(encodeURIComponent('huijoohwee/docs/knowgrph-video-demo.md'))
      || url.includes(encodeURIComponent('docs/knowgrph-video-demo.md'))
    if (!hasCanonicalDocsPath) return new Response('', { status: 404 })
    return new Response('# hydrated from canonicalized docs path', { status: 200 })
  }) as typeof fetch
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const entries = [
      {
        path: '/docs/huijoohwee/docs/knowgrph-video-demo.md',
        parentPath: '/docs/huijoohwee/docs',
        kind: 'file',
        name: 'knowgrph-video-demo.md',
        text: '',
        updatedAtMs: 1,
      },
    ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
    const hydrated = await hydrateWorkspaceEntriesInlineText({ fs, workspaceEntries: entries })
    if (hydrated === entries) throw new Error('expected storage fallback to hydrate duplicated docs-prefix workspace entry path')
    if (String(hydrated[0]?.text || '').trim() !== '# hydrated from canonicalized docs path') {
      throw new Error(`expected duplicated docs-prefix path to resolve to canonical storage doc fallback, got ${String(hydrated[0]?.text || '')}`)
    }
    if (capturedUrls.some(url => url.includes(encodeURIComponent('docs/huijoohwee/docs/knowgrph-video-demo.md')))) {
      throw new Error(`expected duplicated docs-prefix canonical path not to be requested during storage fallback, got ${JSON.stringify(capturedUrls)}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
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
