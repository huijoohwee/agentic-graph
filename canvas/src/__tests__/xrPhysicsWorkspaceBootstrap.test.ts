import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { LS_KEYS } from '@/lib/config'
import {
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  CANONICAL_XR_WORKSPACE_PATH,
  EXISTING_WORKSPACE_FILE_PATH,
  EXISTING_WORKSPACE_FILE_TEXT,
  FOLDER_XR_WORKSPACE_ALIAS_PATH,
  IMPORT_XR_WORKSPACE_ALIAS_PATH,
  MISSING_XR_SOURCE_ALIAS_PATH,
  ROOT_XR_WORKSPACE_ALIAS_PATH,
  assertCanonicalXrEntry,
  assertExistingWorkspaceFilePreserved,
  assertOnlyCanonicalXrFile,
} from './xrPhysicsWorkspaceBootstrap.testSupport'

export async function testXrPhysicsCanonicalSeedMaterializesOnceInFreshOrdinaryDevWorkspace() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const requestedUrls: string[] = []

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    return new Response('', { status: 404 })
  }) as typeof fetch

  try {
    const { createMemoryWorkspaceFs } = await import('@/features/workspace-fs/workspaceFsMemory')
    const workspaceFs = createMemoryWorkspaceFs()
    const firstChanged = await workspaceFs.ensureSeed()
    const firstEntries = await workspaceFs.listEntries()
    if (!firstChanged) throw new Error('expected fresh ordinary dev memory bootstrap to report a materialized workspace')
    assertCanonicalXrEntry(firstEntries)

    const secondChanged = await workspaceFs.ensureSeed()
    const secondEntries = await workspaceFs.listEntries()
    if (secondChanged) throw new Error('expected repeated memory bootstrap not to duplicate or rewrite the canonical XR entry')
    assertCanonicalXrEntry(secondEntries)
    if (requestedUrls.some(url => /huijoohwee|agentic-canvas-os/i.test(url))) {
      throw new Error(`expected canonical XR seed bootstrap not to require an external or sibling docs mirror, requested ${JSON.stringify(requestedUrls)}`)
    }
  } finally {
    globalThis.fetch = previousFetch
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    if (previousRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
  }
}

export async function testXrPhysicsCanonicalSeedReconcilesExistingMemoryWorkspace() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const requestedUrls: string[] = []
  let sourceIndexModule: typeof import('@/features/workspace-fs/sourceIndex') | null = null
  let previousCanonicalSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null
  let previousImportSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null
  let previousMissingSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null
  let previousUnrelatedSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    return new Response('', { status: 404 })
  }) as typeof fetch

  try {
    sourceIndexModule = await import('@/features/workspace-fs/sourceIndex')
    const initialSourceIndex = sourceIndexModule.loadWorkspaceSourceIndex()
    previousCanonicalSource = initialSourceIndex[CANONICAL_XR_WORKSPACE_PATH] || null
    previousImportSource = initialSourceIndex[IMPORT_XR_WORKSPACE_ALIAS_PATH] || null
    previousMissingSource = initialSourceIndex[MISSING_XR_SOURCE_ALIAS_PATH] || null
    previousUnrelatedSource = initialSourceIndex[EXISTING_WORKSPACE_FILE_PATH] || null
    sourceIndexModule.setWorkspaceEntrySource(CANONICAL_XR_WORKSPACE_PATH, { kind: 'local', originalName: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME }, { persist: 'sync' })
    sourceIndexModule.setWorkspaceEntrySource(IMPORT_XR_WORKSPACE_ALIAS_PATH, { kind: 'url', url: 'https://example.test/stale-xr-import.md' }, { persist: 'sync' })
    sourceIndexModule.setWorkspaceEntrySource(MISSING_XR_SOURCE_ALIAS_PATH, { kind: 'url', url: 'https://example.test/removed-xr-import.md' }, { persist: 'sync' })
    sourceIndexModule.setWorkspaceEntrySource(EXISTING_WORKSPACE_FILE_PATH, { kind: 'local', originalName: EXISTING_WORKSPACE_FILE_PATH.slice(1) }, { persist: 'sync' })
    const { createMemoryWorkspaceFs } = await import('@/features/workspace-fs/workspaceFsMemory')
    const workspaceFs = createMemoryWorkspaceFs({
      initialEntries: [
        {
          path: EXISTING_WORKSPACE_FILE_PATH,
          parentPath: '/',
          kind: 'file',
          name: EXISTING_WORKSPACE_FILE_PATH.slice(1),
          text: EXISTING_WORKSPACE_FILE_TEXT,
          updatedAtMs: 1,
        },
        {
          path: ROOT_XR_WORKSPACE_ALIAS_PATH,
          parentPath: '/',
          kind: 'file',
          name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
          text: '# Stale root XR alias',
          updatedAtMs: 2,
        },
        {
          path: IMPORT_XR_WORKSPACE_ALIAS_PATH,
          parentPath: '/imports',
          kind: 'file',
          name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
          text: '# Stale imported XR alias',
          updatedAtMs: 3,
        },
        {
          path: FOLDER_XR_WORKSPACE_ALIAS_PATH,
          parentPath: '/folder-collision',
          kind: 'folder',
          name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
          updatedAtMs: 4,
        },
      ],
    })
    const firstChanged = await workspaceFs.ensureSeed()
    const firstEntries = await workspaceFs.listEntries()
    if (!firstChanged) throw new Error('expected ordinary dev memory reconciliation to materialize the missing canonical XR document')
    assertCanonicalXrEntry(firstEntries)
    assertExistingWorkspaceFilePreserved(firstEntries)
    if (!firstEntries.some(entry => entry.path === FOLDER_XR_WORKSPACE_ALIAS_PATH && entry.kind === 'folder')) {
      throw new Error('expected existing-memory reconciliation to preserve same-named folders')
    }
    const migratedSourceIndex = sourceIndexModule.loadWorkspaceSourceIndex()
    if (
      migratedSourceIndex[CANONICAL_XR_WORKSPACE_PATH]
      || migratedSourceIndex[IMPORT_XR_WORKSPACE_ALIAS_PATH]
      || migratedSourceIndex[MISSING_XR_SOURCE_ALIAS_PATH]
    ) {
      throw new Error('expected existing-memory reconciliation to clear canonical and duplicate XR source ownership')
    }
    if (!migratedSourceIndex[EXISTING_WORKSPACE_FILE_PATH]) {
      throw new Error('expected existing-memory reconciliation to preserve unrelated source ownership')
    }

    const secondChanged = await workspaceFs.ensureSeed()
    const secondEntries = await workspaceFs.listEntries()
    if (secondChanged) throw new Error('expected repeated existing-memory reconciliation to remain idempotent')
    assertCanonicalXrEntry(secondEntries)
    assertExistingWorkspaceFilePreserved(secondEntries)
    if (requestedUrls.some(url => /huijoohwee|agentic-canvas-os/i.test(url))) {
      throw new Error(`expected existing-memory XR reconciliation not to require an external docs mirror, requested ${JSON.stringify(requestedUrls)}`)
    }
  } finally {
    sourceIndexModule?.setWorkspaceEntrySource(CANONICAL_XR_WORKSPACE_PATH, previousCanonicalSource, { persist: 'sync' })
    sourceIndexModule?.setWorkspaceEntrySource(IMPORT_XR_WORKSPACE_ALIAS_PATH, previousImportSource, { persist: 'sync' })
    sourceIndexModule?.setWorkspaceEntrySource(MISSING_XR_SOURCE_ALIAS_PATH, previousMissingSource, { persist: 'sync' })
    sourceIndexModule?.setWorkspaceEntrySource(EXISTING_WORKSPACE_FILE_PATH, previousUnrelatedSource, { persist: 'sync' })
    globalThis.fetch = previousFetch
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    if (previousRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
  }
}

export async function testXrPhysicsCanonicalSeedSurvivesFreshPersistedDocsOnlyBootstrap() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const requestedUrls: string[] = []

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    return new Response('', { status: 404 })
  }) as typeof fetch

  try {
    const isolatedModuleUrl = new URL(
      `../features/workspace-fs/workspaceFsPersisted.ts?xr-docs-only=${Date.now()}`,
      import.meta.url,
    ).href
    const persistedModule = await import(isolatedModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
    const workspaceFs = persistedModule.createWorkspacePersistedFs()
    const firstChanged = await workspaceFs.ensureSeed()
    const firstEntries = await workspaceFs.listEntries()
    if (!firstChanged) throw new Error('expected fresh persisted docs-only bootstrap to materialize its canonical docs tree')
    assertCanonicalXrEntry(firstEntries)
    if (firstEntries.some(entry => (
      entry.kind === 'file'
      && entry.path === `/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
    ))) {
      throw new Error('expected persisted docs-only bootstrap not to create a duplicate root XR alias')
    }

    const secondChanged = await workspaceFs.ensureSeed()
    const secondEntries = await workspaceFs.listEntries()
    if (secondChanged) throw new Error('expected repeated persisted docs-only bootstrap not to duplicate or rewrite the canonical XR entry')
    assertCanonicalXrEntry(secondEntries)
    if (requestedUrls.some(url => /huijoohwee|agentic-canvas-os/i.test(url))) {
      throw new Error(`expected persisted canonical XR bootstrap not to require an external or sibling docs mirror, requested ${JSON.stringify(requestedUrls)}`)
    }
  } finally {
    globalThis.fetch = previousFetch
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    if (previousRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
  }
}

export async function testXrPhysicsCanonicalSeedSurvivesClearedAllWorkspace() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch

  try {
    const memoryStorage = new MemoryStorage()
    memoryStorage.setItem(LS_KEYS.markdownWorkspaceUserClearedAllFiles, '1')
    const { restore: restoreMemoryWindow } = initWindowHarness({ storage: memoryStorage })
    try {
      const { createMemoryWorkspaceFs } = await import('@/features/workspace-fs/workspaceFsMemory')
      const memoryFs = createMemoryWorkspaceFs()
      const firstChanged = await memoryFs.ensureSeed()
      if (!firstChanged) throw new Error('expected cleared-all memory migration to materialize the protected XR document')
      assertOnlyCanonicalXrFile(await memoryFs.listEntries())
      const secondChanged = await memoryFs.ensureSeed()
      if (secondChanged) throw new Error('expected cleared-all memory migration to remain idempotent')
      assertOnlyCanonicalXrFile(await memoryFs.listEntries())
      if (memoryStorage.getItem(LS_KEYS.markdownWorkspaceUserClearedAllFiles) !== '1') {
        throw new Error('expected cleared-all memory migration to preserve the cleared marker for other default seeds')
      }
    } finally {
      restoreMemoryWindow()
    }

    const clearedDocsRoot = `/virtual/knowgrph-xr-cleared-all-${Date.now()}/docs`
    process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = clearedDocsRoot
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (!url.endsWith('/__kg_fs_list')) return new Response('', { status: 404 })
      const requestBody = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { path?: unknown }
        : {}
      const files = requestBody.path === clearedDocsRoot
        ? [{ relPath: 'must-stay-cleared.md', text: '# Must stay cleared', updatedAtMs: Date.now() }]
        : []
      return new Response(JSON.stringify({ ok: true, files }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const persistedStorage = new MemoryStorage()
    persistedStorage.setItem(LS_KEYS.markdownWorkspaceUserClearedAllFiles, '1')
    const { restore: restorePersistedWindow } = initWindowHarness({ storage: persistedStorage })
    try {
      const isolatedModuleUrl = new URL(
        `../features/workspace-fs/workspaceFsPersisted.ts?xr-cleared-all=${Date.now()}`,
        import.meta.url,
      ).href
      const persistedModule = await import(isolatedModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
      const persistedFs = persistedModule.createWorkspacePersistedFs()
      const firstChanged = await persistedFs.ensureSeed()
      if (!firstChanged) throw new Error('expected cleared-all repo-local persisted migration to materialize only the protected XR document')
      assertOnlyCanonicalXrFile(await persistedFs.listEntries())
      const secondChanged = await persistedFs.ensureSeed()
      if (secondChanged) throw new Error('expected cleared-all persisted migration to remain idempotent')
      assertOnlyCanonicalXrFile(await persistedFs.listEntries())
      if (persistedStorage.getItem(LS_KEYS.markdownWorkspaceUserClearedAllFiles) !== '1') {
        throw new Error('expected cleared-all persisted migration to preserve the cleared marker for other defaults and mirror files')
      }
    } finally {
      restorePersistedWindow()
    }
  } finally {
    globalThis.fetch = previousFetch
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    if (previousRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
  }
}

export async function testXrPhysicsCanonicalSeedReconcilesExistingPersistedWorkspace() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const requestedUrls: string[] = []
  let sourceIndexModule: typeof import('@/features/workspace-fs/sourceIndex') | null = null
  let previousCanonicalSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null
  let previousImportSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null
  let previousMissingSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null
  let previousUnrelatedSource: import('@/features/workspace-fs/sourceIndex').WorkspaceEntrySource | null = null

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    return new Response('', { status: 404 })
  }) as typeof fetch

  try {
    sourceIndexModule = await import('@/features/workspace-fs/sourceIndex')
    const initialSourceIndex = sourceIndexModule.loadWorkspaceSourceIndex()
    previousCanonicalSource = initialSourceIndex[CANONICAL_XR_WORKSPACE_PATH] || null
    previousImportSource = initialSourceIndex[IMPORT_XR_WORKSPACE_ALIAS_PATH] || null
    previousMissingSource = initialSourceIndex[MISSING_XR_SOURCE_ALIAS_PATH] || null
    previousUnrelatedSource = initialSourceIndex[EXISTING_WORKSPACE_FILE_PATH] || null
    sourceIndexModule.setWorkspaceEntrySource(CANONICAL_XR_WORKSPACE_PATH, { kind: 'local', originalName: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME }, { persist: 'sync' })
    sourceIndexModule.setWorkspaceEntrySource(IMPORT_XR_WORKSPACE_ALIAS_PATH, { kind: 'url', url: 'https://example.test/stale-persisted-xr-import.md' }, { persist: 'sync' })
    sourceIndexModule.setWorkspaceEntrySource(MISSING_XR_SOURCE_ALIAS_PATH, { kind: 'url', url: 'https://example.test/removed-persisted-xr-import.md' }, { persist: 'sync' })
    sourceIndexModule.setWorkspaceEntrySource(EXISTING_WORKSPACE_FILE_PATH, { kind: 'local', originalName: EXISTING_WORKSPACE_FILE_PATH.slice(1) }, { persist: 'sync' })
    const isolatedModuleUrl = new URL(
      `../features/workspace-fs/workspaceFsPersisted.ts?xr-existing-docs-only=${Date.now()}`,
      import.meta.url,
    ).href
    const persistedModule = await import(isolatedModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
    const workspaceFs = persistedModule.createWorkspacePersistedFs()
    await workspaceFs.createFile({
      parentPath: '/',
      name: EXISTING_WORKSPACE_FILE_PATH.slice(1),
      text: EXISTING_WORKSPACE_FILE_TEXT,
    })
    await workspaceFs.createFile({
      parentPath: '/',
      name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
      text: '# Stale persisted root XR alias',
    })
    await workspaceFs.createFile({
      parentPath: '/imports',
      name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
      text: '# Stale persisted imported XR alias',
    })
    await workspaceFs.createFolder({
      parentPath: '/folder-collision',
      name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
    })

    const firstChanged = await workspaceFs.ensureSeed()
    const firstEntries = await workspaceFs.listEntries()
    if (!firstChanged) throw new Error('expected ordinary dev persisted reconciliation to materialize the missing canonical XR document')
    assertCanonicalXrEntry(firstEntries)
    assertExistingWorkspaceFilePreserved(firstEntries)
    if (!firstEntries.some(entry => entry.path === FOLDER_XR_WORKSPACE_ALIAS_PATH && entry.kind === 'folder')) {
      throw new Error('expected existing-persisted reconciliation to preserve same-named folders')
    }
    const migratedSourceIndex = sourceIndexModule.loadWorkspaceSourceIndex()
    if (
      migratedSourceIndex[CANONICAL_XR_WORKSPACE_PATH]
      || migratedSourceIndex[IMPORT_XR_WORKSPACE_ALIAS_PATH]
      || migratedSourceIndex[MISSING_XR_SOURCE_ALIAS_PATH]
    ) {
      throw new Error('expected existing-persisted reconciliation to clear canonical and duplicate XR source ownership')
    }
    if (!migratedSourceIndex[EXISTING_WORKSPACE_FILE_PATH]) {
      throw new Error('expected existing-persisted reconciliation to preserve unrelated source ownership')
    }

    const secondChanged = await workspaceFs.ensureSeed()
    const secondEntries = await workspaceFs.listEntries()
    if (secondChanged) throw new Error('expected repeated existing-persisted reconciliation to remain idempotent')
    assertCanonicalXrEntry(secondEntries)
    assertExistingWorkspaceFilePreserved(secondEntries)
    if (requestedUrls.some(url => /huijoohwee|agentic-canvas-os/i.test(url))) {
      throw new Error(`expected existing-persisted XR reconciliation not to require an external docs mirror, requested ${JSON.stringify(requestedUrls)}`)
    }
  } finally {
    sourceIndexModule?.setWorkspaceEntrySource(CANONICAL_XR_WORKSPACE_PATH, previousCanonicalSource, { persist: 'sync' })
    sourceIndexModule?.setWorkspaceEntrySource(IMPORT_XR_WORKSPACE_ALIAS_PATH, previousImportSource, { persist: 'sync' })
    sourceIndexModule?.setWorkspaceEntrySource(MISSING_XR_SOURCE_ALIAS_PATH, previousMissingSource, { persist: 'sync' })
    sourceIndexModule?.setWorkspaceEntrySource(EXISTING_WORKSPACE_FILE_PATH, previousUnrelatedSource, { persist: 'sync' })
    globalThis.fetch = previousFetch
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    if (previousRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
  }
}

export async function testXrPhysicsCanonicalSeedOverridesStalePersistedSourceOwnership() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousFetch = globalThis.fetch
  const docsRoot = `/virtual/knowgrph-xr-source-owned-${Date.now()}/docs`
  const sourceOwnedUnrelatedPath = '/docs/source-owned-unrelated.md'
  const sourceOwnedUnrelatedText = '# Preserve this unrelated source-owned document'
  const sourceOwnedXrDuplicatePath = `/docs/imports/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const xrNamedFolderPath = `/docs/folder-collision/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const storage = new MemoryStorage()
  const now = Date.now()
  storage.setItem('kg:workspace-fs', JSON.stringify({
    entries: {
      '/': { path: '/', parentPath: '', kind: 'folder', name: '', updatedAtMs: now },
      '/docs': { path: '/docs', parentPath: '', kind: 'folder', name: 'docs', updatedAtMs: now },
      '/docs/workspace-seeds': {
        path: '/docs/workspace-seeds',
        parentPath: '/docs',
        kind: 'folder',
        name: 'workspace-seeds',
        updatedAtMs: now,
      },
      [CANONICAL_XR_WORKSPACE_PATH]: {
        path: CANONICAL_XR_WORKSPACE_PATH,
        parentPath: '/docs/workspace-seeds',
        kind: 'file',
        name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
        text: '# Stale source-owned XR content',
        updatedAtMs: now,
      },
      [sourceOwnedUnrelatedPath]: {
        path: sourceOwnedUnrelatedPath,
        parentPath: '/docs',
        kind: 'file',
        name: 'source-owned-unrelated.md',
        text: sourceOwnedUnrelatedText,
        updatedAtMs: now,
      },
      [sourceOwnedXrDuplicatePath]: {
        path: sourceOwnedXrDuplicatePath,
        parentPath: '/docs/imports',
        kind: 'file',
        name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
        text: '# Stale source-owned duplicate XR document',
        updatedAtMs: now,
      },
      [xrNamedFolderPath]: {
        path: xrNamedFolderPath,
        parentPath: '/docs/folder-collision',
        kind: 'folder',
        name: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
        updatedAtMs: now,
      },
    },
  }))
  const { restore: restoreWindow } = initWindowHarness({ storage })

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = docsRoot
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.endsWith('/__kg_fs_list')) {
      const requestBody = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { path?: unknown }
        : {}
      const files = requestBody.path === docsRoot
        ? [
            {
              relPath: `workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`,
              text: '# Conflicting external XR content',
              updatedAtMs: now + 1,
            },
            { relPath: 'external-mirror-note.md', text: '# External mirror note', updatedAtMs: now + 2 },
          ]
        : []
      return new Response(JSON.stringify({ ok: true, files }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch

  const { loadWorkspaceSourceIndex, setWorkspaceEntrySource } = await import('@/features/workspace-fs/sourceIndex')
  const previousCanonicalSource = loadWorkspaceSourceIndex()[CANONICAL_XR_WORKSPACE_PATH] || null
  const previousUnrelatedSource = loadWorkspaceSourceIndex()[sourceOwnedUnrelatedPath] || null
  const previousDuplicateSource = loadWorkspaceSourceIndex()[sourceOwnedXrDuplicatePath] || null
  setWorkspaceEntrySource(CANONICAL_XR_WORKSPACE_PATH, { kind: 'local', originalName: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME }, { persist: 'sync' })
  setWorkspaceEntrySource(sourceOwnedUnrelatedPath, { kind: 'local', originalName: 'source-owned-unrelated.md' }, { persist: 'sync' })
  setWorkspaceEntrySource(sourceOwnedXrDuplicatePath, { kind: 'url', url: 'https://example.test/stale-source-owned-xr.md' }, { persist: 'sync' })

  try {
    const isolatedModuleUrl = new URL(
      `../features/workspace-fs/workspaceFsPersisted.ts?xr-stale-source-owned=${Date.now()}`,
      import.meta.url,
    ).href
    const persistedModule = await import(isolatedModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
    const workspaceFs = persistedModule.createWorkspacePersistedFs()
    const firstChanged = await workspaceFs.ensureSeed()
    const firstEntries = await workspaceFs.listEntries()
    if (!firstChanged) throw new Error('expected persisted migration to replace stale source-owned XR content')
    assertCanonicalXrEntry(firstEntries)
    const unrelated = firstEntries.find(entry => entry.path === sourceOwnedUnrelatedPath)
    if (unrelated?.kind !== 'file' || unrelated.text !== sourceOwnedUnrelatedText) {
      throw new Error(`expected unrelated source-owned paths to remain protected, got ${JSON.stringify(unrelated)}`)
    }
    if (!firstEntries.some(entry => entry.path === xrNamedFolderPath && entry.kind === 'folder')) {
      throw new Error('expected docs-mirror migration to preserve same-named folders while removing duplicate files')
    }
    const migratedSourceIndex = loadWorkspaceSourceIndex()
    if (migratedSourceIndex[CANONICAL_XR_WORKSPACE_PATH] || migratedSourceIndex[sourceOwnedXrDuplicatePath]) {
      throw new Error('expected canonical XR migration to clear canonical and duplicate local/external source ownership')
    }
    if (!migratedSourceIndex[sourceOwnedUnrelatedPath]) {
      throw new Error('expected canonical XR migration to preserve unrelated source ownership metadata')
    }

    const secondChanged = await workspaceFs.ensureSeed()
    const secondEntries = await workspaceFs.listEntries()
    if (secondChanged) throw new Error('expected stale-source-ownership migration to be idempotent after canonical reconciliation')
    assertCanonicalXrEntry(secondEntries)
  } finally {
    setWorkspaceEntrySource(CANONICAL_XR_WORKSPACE_PATH, previousCanonicalSource, { persist: 'sync' })
    setWorkspaceEntrySource(sourceOwnedUnrelatedPath, previousUnrelatedSource, { persist: 'sync' })
    setWorkspaceEntrySource(sourceOwnedXrDuplicatePath, previousDuplicateSource, { persist: 'sync' })
    globalThis.fetch = previousFetch
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    if (previousRepoLocal === undefined) delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
    else process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
  }
}
