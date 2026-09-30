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

/** Content-addressed copies never overwrite either captured sources or edited local copies. */
export async function saveWorkspaceRevealSnapshot(outputRoot: string, snapshot: WorkspaceRevealSnapshot): Promise<string> {
  const value = parseWorkspaceRevealSnapshot(snapshot)
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
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const version = path.join(root, digest)
  const target = path.join(version, ...value.workspacePath.slice(1).split('/'))
  const verify = async () => {
    // Reject even in-store symlink substitution, not just escapes.
    if (await fs.realpath(target) !== target) throw new WorkspaceRevealSnapshotError(409, 'The existing local copy was replaced; it was preserved')
    const stat = await fs.stat(target)
    if (!stat.isFile() || stat.size !== Buffer.byteLength(value.text) || await fs.readFile(target, 'utf8') !== value.text) {
      throw new WorkspaceRevealSnapshotError(409, 'The existing local copy was edited; it was preserved')
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
    const stagedTarget = path.join(staging, ...value.workspacePath.slice(1).split('/'))
    await fs.mkdir(path.dirname(stagedTarget), { recursive: true })
    await fs.writeFile(stagedTarget, value.text, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    try { await fs.rename(staging, version) } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code || '')) throw error
    }
    return await verify()
  } finally { await fs.rm(staging, { recursive: true, force: true }) }
}
