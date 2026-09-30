import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { WORKSPACE_REVEAL_MAX_BYTES, type WorkspaceRevealSnapshot } from './src/features/workspace-fs/workspaceRevealContract'

export class WorkspaceRevealSnapshotError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const inside = (root: string, target: string) => target.startsWith(root + path.sep)

export function parseWorkspaceRevealSnapshot(value: unknown): WorkspaceRevealSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkspaceRevealSnapshotError(400, 'Invalid document copy')
  const { workspacePath, text } = value as Record<string, unknown>
  if (typeof workspacePath !== 'string' || !workspacePath.startsWith('/') || workspacePath.length > 4096
    || /[\\:<>"|?*]/.test(workspacePath) || [...workspacePath].some(char => char.charCodeAt(0) < 32) || typeof text !== 'string') {
    throw new WorkspaceRevealSnapshotError(400, 'A portable workspace file path and text are required')
  }
  const parts = workspacePath.slice(1).split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || Buffer.byteLength(part) > 240)) {
    throw new WorkspaceRevealSnapshotError(400, 'Invalid workspace file path')
  }
  if (Buffer.byteLength(text) > WORKSPACE_REVEAL_MAX_BYTES) throw new WorkspaceRevealSnapshotError(413, 'Document copy exceeds 500 KB; export the document instead')
  return { workspacePath, text }
}

type FolderEntry = { workspacePath: string; kind: 'file' | 'folder'; text?: string }
export type WorkspaceRevealFolderSnapshot = { workspacePath: string; entries: FolderEntry[] }

export function parseWorkspaceRevealFolderSnapshot(value: unknown): WorkspaceRevealFolderSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkspaceRevealSnapshotError(400, 'Invalid folder copy')
  const input = value as Record<string, unknown>
  const root = parseWorkspaceRevealSnapshot({ workspacePath: input.workspacePath, text: '' }).workspacePath
  if (!Array.isArray(input.entries) || input.entries.length > 1_000) throw new WorkspaceRevealSnapshotError(400, 'Folder copy exceeds 1,000 entries; reveal a smaller folder')
  const paths = new Map<string, FolderEntry['kind']>()
  const entries = input.entries.map((raw: unknown): FolderEntry => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new WorkspaceRevealSnapshotError(400, 'Invalid folder entry')
    const entry = raw as Record<string, unknown>
    if (entry.kind !== 'file' && entry.kind !== 'folder') throw new WorkspaceRevealSnapshotError(400, 'Invalid folder entry kind')
    const parsed = parseWorkspaceRevealSnapshot({ workspacePath: entry.workspacePath, text: entry.kind === 'folder' ? '' : entry.text })
    const key = parsed.workspacePath.normalize('NFC').toLowerCase()
    if (!parsed.workspacePath.startsWith(root + '/') || paths.has(key)) throw new WorkspaceRevealSnapshotError(400, 'Folder entries must be distinct descendants of the selected folder')
    paths.set(key, entry.kind)
    return entry.kind === 'file' ? { ...parsed, kind: 'file' } : { workspacePath: parsed.workspacePath, kind: 'folder' }
  }).sort((a, b) => a.workspacePath < b.workspacePath ? -1 : a.workspacePath > b.workspacePath ? 1 : 0)
  const complete = new Map(entries.map(entry => [entry.workspacePath, entry]))
  const spellings = new Map(entries.map(entry => [entry.workspacePath.normalize('NFC').toLowerCase(), entry.workspacePath]))
  for (const entry of entries) {
    let parent = path.posix.dirname(entry.workspacePath)
    while (parent !== root) {
      const key = parent.normalize('NFC').toLowerCase()
      if (paths.get(key) === 'file') throw new WorkspaceRevealSnapshotError(400, 'A file cannot contain folder entries')
      if (spellings.has(key) && spellings.get(key) !== parent) throw new WorkspaceRevealSnapshotError(400, 'Folder paths collide on a portable filesystem')
      spellings.set(key, parent)
      if (!complete.has(parent)) complete.set(parent, { workspacePath: parent, kind: 'folder' })
      if (complete.size > 1_000) throw new WorkspaceRevealSnapshotError(400, 'Folder copy exceeds 1,000 entries; reveal a smaller folder')
      parent = path.posix.dirname(parent)
    }
  }
  const snapshot = { workspacePath: root, entries: [...complete.values()].sort((a, b) => a.workspacePath < b.workspacePath ? -1 : a.workspacePath > b.workspacePath ? 1 : 0) }
  if (Buffer.byteLength(JSON.stringify(snapshot)) > WORKSPACE_REVEAL_MAX_BYTES) throw new WorkspaceRevealSnapshotError(413, 'Folder copy exceeds 500 KB; reveal a smaller folder or export instead')
  return snapshot
}

export async function saveWorkspaceRevealSnapshot(outputRoot: string, snapshot: WorkspaceRevealSnapshot): Promise<string> {
  const value = parseWorkspaceRevealSnapshot(snapshot)
  return saveNamedSnapshot(outputRoot, value.workspacePath, JSON.stringify(value), [{ ...value, kind: 'file' }], false)
}

export async function saveWorkspaceRevealFolderSnapshot(outputRoot: string, snapshot: WorkspaceRevealFolderSnapshot): Promise<string> {
  const value = parseWorkspaceRevealFolderSnapshot(snapshot)
  return saveNamedSnapshot(outputRoot, value.workspacePath, JSON.stringify(value), value.entries, true)
}

/** Publish one complete revision atomically; never overwrite edited copies. */
async function saveNamedSnapshot(outputRoot: string, workspacePath: string, identity: string, entries: FolderEntry[], folder: boolean): Promise<string> {
  if (!path.isAbsolute(outputRoot)) throw new WorkspaceRevealSnapshotError(400, 'A local output folder is required')
  const base = path.resolve(outputRoot)
  let ancestor = base
  while (true) {
    try { await fs.lstat(ancestor); break } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      ancestor = path.dirname(ancestor)
    }
  }
  if (await fs.realpath(ancestor) !== ancestor) throw new WorkspaceRevealSnapshotError(403, 'Document copy directory must not be a symlink')
  await fs.mkdir(base, { recursive: true })
  const realStore = await fs.realpath(base)
  if (realStore !== base) throw new WorkspaceRevealSnapshotError(403, 'Document copy directory must not be a symlink')
  const root = path.join(realStore, 'revealed')
  await fs.mkdir(root).catch(error => { if (error.code !== 'EEXIST') throw error })
  const real = await fs.realpath(root)
  if (real !== root || !inside(realStore, real)) throw new WorkspaceRevealSnapshotError(403, 'Document copy directory must not be a symlink')
  const digest = createHash('sha256').update(identity).digest('hex')
  const version = path.join(root, digest)
  const target = path.join(version, workspacePath)
  const expected = new Map(entries.map(entry => [entry.workspacePath, entry]))
  if (folder) expected.set(workspacePath, { workspacePath, kind: 'folder' })
  for (const entry of entries) {
    let parent = path.posix.dirname(entry.workspacePath)
    while (folder && (parent === workspacePath || parent.startsWith(workspacePath + '/'))) {
      if (!expected.has(parent)) expected.set(parent, { workspacePath: parent, kind: 'folder' })
      parent = path.posix.dirname(parent)
    }
  }
  const verify = async () => {
    for (const entry of expected.values()) {
      const item = path.join(version, entry.workspacePath)
      if (await fs.realpath(item) !== item) throw new WorkspaceRevealSnapshotError(409, 'The existing local copy was replaced; it was preserved')
      const stat = await fs.stat(item)
      if (entry.kind === 'file') {
        if (!stat.isFile() || stat.size !== Buffer.byteLength(entry.text!) || await fs.readFile(item, 'utf8') !== entry.text) throw new WorkspaceRevealSnapshotError(409, 'The existing local copy was edited; it was preserved')
      } else {
        if (!stat.isDirectory() || (await fs.readdir(item)).some(name => !expected.has(entry.workspacePath + '/' + name))) throw new WorkspaceRevealSnapshotError(409, 'The existing local copy was edited; it was preserved')
      }
    }
    return target
  }
  let exists = false
  try { await fs.lstat(version); exists = true } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (exists) return verify().catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WorkspaceRevealSnapshotError(409, 'The existing local copy was moved; its directory was preserved')
    throw error
  })
  const staging = await fs.mkdtemp(path.join(root, '.pending-'))
  try {
    for (const entry of expected.values()) {
      const stagedTarget = path.join(staging, entry.workspacePath)
      if (entry.kind === 'folder') await fs.mkdir(stagedTarget, { recursive: true })
      else {
        await fs.mkdir(path.dirname(stagedTarget), { recursive: true })
        await fs.writeFile(stagedTarget, entry.text!, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      }
    }
    try { await fs.rename(staging, version) } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code || '')) throw error
    }
    return await verify()
  } finally { await fs.rm(staging, { recursive: true, force: true }) }
}
