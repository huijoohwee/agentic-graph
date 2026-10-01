import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Connect } from 'vite'
import type { KgFsPathPolicy } from './viteWorkspaceArtifactBridge'
import { WORKSPACE_REVEAL_MAX_BYTES } from './src/features/workspace-fs/workspaceRevealContract'
import { parseWorkspaceRevealSnapshot, saveWorkspaceRevealSnapshot, parseWorkspaceRevealFolderSnapshot, saveWorkspaceRevealFolderSnapshot, WorkspaceRevealSnapshotError } from './viteWorkspaceRevealSnapshot'
import { resolveWorkspaceDocumentOutputRoot } from './src/lib/websites/server/websiteImportStorage'

export const WORKSPACE_REVEAL_PATH = '/__agentic_os_fs_reveal'
const execute = promisify(execFile)
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

class RevealError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function resolveWorkspaceRevealTarget(_repoRoot: string, policy: KgFsPathPolicy, input: unknown): Promise<string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RevealError(400, 'Invalid reveal request')
  const request = input as Record<string, unknown>
  let target: string
  if ('website' in request || (request.path !== undefined && request.workspacePath !== undefined)) {
    throw new RevealError(400, 'Reveal requires one exact document or folder path, not a capture identity')
  }
  if (request.kind !== undefined && request.kind !== 'file' && request.kind !== 'folder') throw new RevealError(400, 'Invalid item kind')
  {
    const canonical = typeof request.workspacePath === 'string' ? policy.resolveCanonicalWorkspacePath(request.workspacePath) : null
    const raw = request.path
    if (canonical) target = canonical
    else if (typeof raw === 'string' && path.isAbsolute(raw) && !raw.includes('\0')) target = path.resolve(raw)
    else throw new RevealError(400, 'A saved local file or folder path is required')
    if (!policy.isAllowed(target)) throw new RevealError(403, 'Path is outside the local workspace')
  }
  let real: string
  try { real = await fs.realpath(target) } catch { throw new RevealError(404, 'This item has no saved local file or folder to reveal') }
  if (!policy.isAllowed(real)) throw new RevealError(403, 'Path is outside the local workspace')
  const stat = await fs.stat(real)
  if (!(request.kind === 'folder' ? stat.isDirectory() : request.kind === 'file' ? stat.isFile() : stat.isFile() || stat.isDirectory())) {
    throw new RevealError(409, 'The saved item does not match the selected file or folder')
  }
  return real
}

export function workspaceRevealCommand(target: string, platform = process.platform, isDirectory = false): { command: string; args: string[]; message: string } {
  if (platform === 'darwin') return { command: 'open', args: ['-R', target], message: 'Revealed in Finder' }
  if (platform === 'win32') return { command: 'explorer.exe', args: ['/select,', target], message: 'Revealed in File Explorer' }
  if (platform === 'linux') return { command: 'xdg-open', args: [isDirectory ? target : path.dirname(target)], message: isDirectory ? 'Opened folder' : 'Opened containing folder' }
  throw new RevealError(501, 'The local host does not support a file manager')
}

export function createWorkspaceRevealHandler(repoRoot: string, policy: KgFsPathPolicy,
  run: (command: string, args: string[]) => Promise<unknown> = (command, args) => execute(command, args, { timeout: 5000, maxBuffer: 8192 }),
): Connect.NextHandleFunction {
  let busy = false
  return async (req, res) => {
    const reply = (status: number, result: object) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(result))
    }
    if (req.method !== 'POST') return reply(405, { ok: false, error: 'Use POST to reveal a local file' })
    try {
      const origin = new URL(String(req.headers.origin || ''))
      if (!loopback.has(req.socket.remoteAddress || '') || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
        || origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)
        || req.headers['sec-fetch-site'] === 'cross-site') throw new Error()
    } catch { return reply(403, { ok: false, error: 'Reveal requires a same-origin local preview' }) }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, { ok: false, error: 'Use application/json' })
    let ownsFileManager = false
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > WORKSPACE_REVEAL_MAX_BYTES) throw new RevealError(413, 'Document copy exceeds 500 KB; export the document instead')
        chunks.push(bytes)
      }
      let body: unknown
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new RevealError(400, 'Invalid reveal request') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RevealError(400, 'Invalid reveal request')
      const request = body as Record<string, unknown>
      const saveOnly = request.saveOnly === true
      if (saveOnly && (!('snapshot' in request) || 'path' in request || 'folderSnapshot' in request
        || !parseWorkspaceRevealSnapshot(request.snapshot).workspacePath.startsWith('/websites/'))) {
        throw new RevealError(400, 'Saving an import requires a website document')
      }
      if (!saveOnly) {
        if (busy) throw new RevealError(409, 'A file manager request is already running')
        busy = true; ownsFileManager = true
      }
      let target = '', copied = false
      if ('folderSnapshot' in request) {
        if ('snapshot' in request || 'website' in request || 'workspacePath' in request || 'path' in request || request.kind !== 'folder') throw new RevealError(400, 'A folder copy requires a single workspace folder')
        const outputRoot = request.outputRoot ?? resolveWorkspaceDocumentOutputRoot(repoRoot)
        if (typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot) || !policy.isAllowed(outputRoot)) throw new RevealError(403, 'Output folder is outside the local workspace')
        target = await saveWorkspaceRevealFolderSnapshot(outputRoot, parseWorkspaceRevealFolderSnapshot(request.folderSnapshot)); copied = true
      } else if ('snapshot' in request) {
        if ('website' in request || 'workspacePath' in request || (request.kind !== undefined && request.kind !== 'file')) {
          throw new RevealError(400, 'A document copy requires a single workspace file')
        }
        const snapshot = parseWorkspaceRevealSnapshot(request.snapshot)
        // A derived mirror is useful only when it contains this exact document revision.
        if (request.path !== undefined) {
          try {
            const candidate = await resolveWorkspaceRevealTarget(repoRoot, policy, { path: request.path, kind: 'file' })
            if ((await fs.stat(candidate)).size === Buffer.byteLength(snapshot.text) && await fs.readFile(candidate, 'utf8') === snapshot.text) target = candidate
          } catch (error) { if (!(error instanceof RevealError && error.status === 404)) throw error }
        }
        if (!target) {
          const outputRoot = request.outputRoot ?? resolveWorkspaceDocumentOutputRoot(repoRoot)
          if (typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot) || !policy.isAllowed(outputRoot)) {
            throw new RevealError(403, 'Output folder is outside the local workspace')
          }
          target = await saveWorkspaceRevealSnapshot(outputRoot, snapshot); copied = true
        }
      } else target = await resolveWorkspaceRevealTarget(repoRoot, policy, request)
      if (saveOnly) return reply(200, { ok: true, path: target, message: 'Saved website document' })
      const action = workspaceRevealCommand(target, process.platform, (await fs.stat(target)).isDirectory())
      await run(action.command, action.args)
      reply(200, { ok: true, path: target, message: copied ? `Saved local copy. ${action.message}` : action.message })
    } catch (error) {
      const known = error instanceof RevealError || error instanceof WorkspaceRevealSnapshotError
      reply(known ? error.status : 500, { ok: false,
        error: known ? error.message : 'The local host could not save or reveal this item' })
    } finally { if (ownsFileManager) busy = false }
  }
}
