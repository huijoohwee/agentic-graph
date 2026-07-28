import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  buildNewMarkdownSourceFileName,
  createNewMarkdownSourceFile,
} from '@/features/source-files/createNewMarkdownSourceFile'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { LS_KEYS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { parseCanvasWorkspaceFrontmatterPreset, extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'

const KG_HUIJOOHWEE_DOCS_ROOT = '/workspace/huijoohwee/docs'

class SizeLimitedStorage extends MemoryStorage {
  constructor(private readonly maxValueChars: number) {
    super()
  }

  override setItem(key: string, value: string): void {
    if (value.length > this.maxValueChars) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    super.setItem(key, value)
  }
}

export async function testCreateNewMarkdownSourceFileDefaultsToAuthoredNotesRoot() {
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useMarkdownExplorerStore.getState().setActivePath(null)
  writeGeospatialOverlayEnabledPreference(true)
  try {
    const timestampMs = Date.UTC(2026, 6, 9, 0, 1, 2)
    const firstName = buildNewMarkdownSourceFileName(timestampMs)
    const secondName = buildNewMarkdownSourceFileName(timestampMs + 1000)

    const firstPath = await createNewMarkdownSourceFile({ timestampMs })
    const secondPath = await createNewMarkdownSourceFile({ timestampMs })

    if (firstPath !== `/notes/${firstName}`) {
      throw new Error(`expected first Launch markdown file in /notes, got ${JSON.stringify(firstPath)}`)
    }
    if (secondPath !== `/notes/${secondName}`) {
      throw new Error(`expected same-second Launch markdown collision to allocate a fresh timestamp, got ${JSON.stringify(secondPath)}`)
    }

    const fs = await getWorkspaceFs()
    const firstText = await fs.readFileText(firstPath)
    const secondText = await fs.readFileText(secondPath)
    const firstFrontmatter = extractYamlFrontmatterBlock(firstText || '')
    const secondFrontmatter = extractYamlFrontmatterBlock(secondText || '')
    const firstPreset = parseCanvasWorkspaceFrontmatterPreset(firstText || '')
    const secondPreset = parseCanvasWorkspaceFrontmatterPreset(secondText || '')
    if (
      !firstFrontmatter?.yamlText.includes(`title: ${JSON.stringify(firstName.replace(/\.md$/, ''))}`)
      || !secondFrontmatter?.yamlText.includes(`title: ${JSON.stringify(secondName.replace(/\.md$/, ''))}`)
      || firstPreset?.canvasSurfaceMode !== '2d'
      || firstPreset.canvasRenderMode !== '2d'
      || secondPreset?.canvasSurfaceMode !== '2d'
      || secondPreset.canvasRenderMode !== '2d'
    ) {
      throw new Error(`expected new authored notes to start with titled 2D YAML frontmatter, got ${JSON.stringify({ firstText, secondText })}`)
    }

    const state = useGraphStore.getState()
    if (readGeospatialOverlayEnabledPreference() || state.canvasRenderMode !== '2d') {
      throw new Error(`expected Launch-created Markdown to leave Geospatial Mode for 2D Mode, got ${JSON.stringify({
        geospatialModeEnabled: readGeospatialOverlayEnabledPreference(),
        canvasRenderMode: state.canvasRenderMode,
      })}`)
    }
    if (state.workspaceViewMode !== 'editor' || state.editorWorkspacePane !== 'markdown' || !state.workspaceCanvasPaneOpen) {
      throw new Error(`expected new markdown creation to open the Markdown editor, got ${JSON.stringify({
        workspaceViewMode: state.workspaceViewMode,
        editorWorkspacePane: state.editorWorkspacePane,
        workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
      })}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== secondPath) {
      throw new Error('expected latest new markdown file to be selected in Source Files')
    }
  } finally {
    writeGeospatialOverlayEnabledPreference(false)
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
  }
}

export async function testCreateNewMarkdownSourceFileDoesNotWriteIntoDocsMirror() {
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useMarkdownExplorerStore.getState().setActivePath(null)
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const calls: Array<{ url: string; body: string; method: string }> = []
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = KG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method || 'GET')
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    calls.push({ url, body: String(init?.body || ''), method })
    if (method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  try {
    const timestampMs = Date.UTC(2026, 6, 9, 0, 3, 4)
    const fileName = buildNewMarkdownSourceFileName(timestampMs)
    const createdPath = await createNewMarkdownSourceFile({ timestampMs })
    if (createdPath !== `/notes/${fileName}`) {
      throw new Error(`expected Launch-created markdown path in /notes, got ${JSON.stringify(createdPath)}`)
    }
    const docsWrite = calls.find(call => (
      call.method === 'POST'
      && call.url === '/__kg_fs_write'
      && call.body.includes(KG_HUIJOOHWEE_DOCS_ROOT)
    ))
    if (docsWrite) {
      throw new Error(`expected authored notes to stay out of the canonical docs mirror, got ${JSON.stringify(docsWrite)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
  }
}

export async function testCreateNewMarkdownSourceFileSurvivesDocsMirrorRefreshSync() {
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useMarkdownExplorerStore.getState().setActivePath(null)
  try {
    const timestampMs = Date.UTC(2026, 6, 9, 0, 2, 3)
    const createdPath = await createNewMarkdownSourceFile({ timestampMs })
    const sourceIndex = loadWorkspaceSourceIndex()
    const source = sourceIndex[createdPath]
    if (!source || source.kind !== 'local') {
      throw new Error(`expected Launch-created markdown path to be source-indexed as local, got ${JSON.stringify(source)}`)
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(String(LS_KEYS.markdownWorkspaceSourcesByPath))
      const persisted = raw ? JSON.parse(raw) as Record<string, { kind?: unknown }> : {}
      const persistedSource = persisted[createdPath]
      if (!persistedSource || persistedSource.kind !== 'local') {
        throw new Error(`expected Launch-created markdown source mark to be persisted before refresh, got ${String(raw || '')}`)
      }
    }

    if (!resolveWorkspaceSourceRootPaths().includes('/notes')) {
      throw new Error('expected authored notes to remain materialized through workspace source-root refreshes')
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
  }
}

export async function testAuthoredMarkdownNoteSurvivesReloadBesideLargeDocsMirror() {
  const { restore } = initWindowHarness({ storage: new SizeLimitedStorage(3_000) })
  try {
    const firstModuleUrl = new URL(
      `../features/workspace-fs/workspaceFsPersisted.ts?authored-note-before-reload=${Date.now()}`,
      import.meta.url,
    ).href
    const firstModule = await import(firstModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
    const firstFs = firstModule.createWorkspacePersistedFs()
    await firstFs.createFolder({ parentPath: '/', name: 'docs_' })
    await firstFs.createFile({
      parentPath: '/docs_',
      name: 'large-canonical-mirror.md',
      text: '# Canonical mirror\n\n' + 'x'.repeat(8_000),
    })
    await firstFs.createFolder({ parentPath: '/', name: 'notes' })
    const notePath = await firstFs.createFile({
      parentPath: '/notes',
      name: 'note_20260721T133700Z.md',
      text: '',
    })

    const secondModuleUrl = new URL(
      `../features/workspace-fs/workspaceFsPersisted.ts?authored-note-after-reload=${Date.now() + 1}`,
      import.meta.url,
    ).href
    const secondModule = await import(secondModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
    const reloadedFs = secondModule.createWorkspacePersistedFs()
    if (await reloadedFs.readFileText(notePath) !== '') {
      throw new Error(`expected empty authored Markdown note to survive workspace reload: ${notePath}`)
    }
    const reloadedEntries = await reloadedFs.listEntries()
    if (!reloadedEntries.some(entry => entry.path === notePath && entry.kind === 'file')) {
      throw new Error(`expected authored note in reloaded Source Files tree: ${notePath}`)
    }
  } finally {
    restore()
  }
}

export async function testLegacyLaunchMarkdownFileMigratesOutOfDocsRoot() {
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  useMarkdownExplorerStore.getState().setActivePath(null)
  try {
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const docsFolderExists = (await fs.listEntries()).some(entry => entry.path === '/docs')
    if (!docsFolderExists) await fs.createFolder({ parentPath: '/', name: 'docs' })
    const legacyPath = await fs.createFile({
      parentPath: '/docs',
      name: 'note_20260709T000203Z.md',
      text: '# Local note',
    })
    setWorkspaceEntrySource(legacyPath, { kind: 'local', originalName: null }, { persist: 'sync' })

    const changed = await fs.ensureSeed()
    if (!changed || await fs.readFileText(legacyPath) !== null) {
      throw new Error(`expected locally authored legacy note to leave the canonical docs namespace: ${legacyPath}`)
    }
    const sourceIndex = loadWorkspaceSourceIndex()
    let migratedPath = ''
    for (const path of Object.keys(sourceIndex)) {
      if (!path.startsWith('/notes/note_20260709T000203Z') || sourceIndex[path]?.kind !== 'local') continue
      if (await fs.readFileText(path) !== '# Local note') continue
      migratedPath = path
      break
    }
    if (await fs.readFileText(migratedPath) !== '# Local note') {
      throw new Error('expected legacy authored note text to survive migration into /notes')
    }
    if (sourceIndex[legacyPath] || sourceIndex[migratedPath]?.kind !== 'local') {
      throw new Error(`expected local source ownership to migrate with the note, got ${JSON.stringify(sourceIndex)}`)
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
  }
}
