import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  readCachedWorkspaceSelectionResolvedTextForActivePath,
  readWorkspaceSelectionResolvedTextForActivePath,
  type MarkdownWorkspaceSelectionResolvedTextCache,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionResolvedText'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'

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
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
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
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
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
