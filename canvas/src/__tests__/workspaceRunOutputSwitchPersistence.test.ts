import fsPromises from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readCachedWorkspaceSelectionResolvedTextForActivePath,
  readWorkspaceSelectionResolvedTextForActivePath,
  type MarkdownWorkspaceSelectionResolvedTextCache,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionResolvedText'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import {
  settleWorkspaceSourceTextWrites,
  trackWorkspaceSourceTextPublication,
} from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'

const SOURCE_ONLY_TEXT = '---\nflow:\n  nodes:\n    - id: n1\n---\n'
const GENERATED_TEXT = '---\nflow:\n  nodes:\n    - id: n1\n    - id: generated-output\n---\n'

const buildWorkspaceFs = (readText: () => string): WorkspaceFs => ({
  ensureSeed: async () => true,
  listEntries: async () => [],
  readFileText: async () => readText(),
  writeFileText: async () => {},
  createFile: async () => '/notes/new.md',
  createFolder: async () => '/notes/new-folder',
  deleteEntry: async () => {},
})

const buildNoteEntry = (): WorkspaceEntry => ({
  path: '/notes/run-output.md',
  parentPath: '/notes',
  kind: 'file',
  name: 'run-output.md',
  text: SOURCE_ONLY_TEXT,
  updatedAtMs: 1,
})

export async function testWorkspaceRunOutputSwitchPrefersAuthoredNoteFsOverStaleDocsMirror() {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-run-output-switch-'))
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousStorageBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  try {
    await fsPromises.mkdir(path.join(tempRoot, 'notes'), { recursive: true })
    await fsPromises.writeFile(path.join(tempRoot, 'notes', 'run-output.md'), SOURCE_ONLY_TEXT)
    const resolved = await readWorkspaceSelectionResolvedTextForActivePath({
      activePath: '/notes/run-output.md',
      activeEntry: buildNoteEntry(),
      preferPathResolvedText: true,
      fs: buildWorkspaceFs(() => GENERATED_TEXT),
    })
    if (resolved !== GENERATED_TEXT) {
      throw new Error('expected authored-note Workspace FS output to outrank a stale docs-root fallback')
    }
  } finally {
    if (typeof previousDocsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceRunOutputSwitchRefreshesSettledPathReadAfterFsWrite() {
  let fsText = SOURCE_ONLY_TEXT
  const cacheRef: { current: MarkdownWorkspaceSelectionResolvedTextCache | null } = { current: null }
  const args = {
    activePath: '/notes/run-output.md' as const,
    activeEntry: buildNoteEntry(),
    preferPathResolvedText: true,
    fs: buildWorkspaceFs(() => fsText),
    cacheRef,
  }
  const before = await readCachedWorkspaceSelectionResolvedTextForActivePath(args)
  fsText = GENERATED_TEXT
  const after = await readCachedWorkspaceSelectionResolvedTextForActivePath(args)
  if (before !== SOURCE_ONLY_TEXT || after !== GENERATED_TEXT) {
    throw new Error('expected a later file switch to reread Workspace FS after generated output persistence')
  }
}

export async function testWorkspaceRunOutputSwitchWaitsForRunPublication() {
  let releasePublication = () => void 0
  const publicationRelease = new Promise<void>(resolve => {
    releasePublication = resolve
  })
  const publication = trackWorkspaceSourceTextPublication(async () => {
    await publicationRelease
  })
  let selectionFenceSettled = false
  const selectionFence = settleWorkspaceSourceTextWrites().then(() => {
    selectionFenceSettled = true
  })

  await Promise.resolve()
  await Promise.resolve()
  if (selectionFenceSettled) {
    throw new Error('expected file switching to wait while a Canvas Run publication is still in flight')
  }

  releasePublication()
  await Promise.all([publication, selectionFence])
  if (!selectionFenceSettled) {
    throw new Error('expected file switching to continue after the Canvas Run publication settles')
  }
}

export function testWorkspaceRunOutputSwitchStableHydrationReadsDurablePath() {
  const selectionText = readFileSync(
    path.resolve(process.cwd(), 'src/lib/markdown-workspace-runtime/useMarkdownWorkspaceSelection.ts'),
    'utf8',
  )
  const durablePathReads = selectionText.match(/preferPathResolvedText: true/g) || []
  if (durablePathReads.length < 3) {
    throw new Error('expected switched and stable workspace hydration to reread durable path authority before Canvas apply')
  }
}
