import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Connect } from 'vite'
import type { KgFsPathPolicy } from './viteWorkspaceArtifactBridge'
import { resolveWebsiteImportWorkspaceRoot, isWebsiteImportGenerationToken } from './src/lib/websites/server/websiteImportStorage'

export const WORKSPACE_REVEAL_PATH = '/__agentic_os_fs_reveal'
const execute = promisify(execFile)
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const inside = (root: string, target: string) => target === root || target.startsWith(root + path.sep)

class RevealError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function resolveWorkspaceRevealTarget(repoRoot: string, policy: KgFsPathPolicy, input: unknown): Promise<string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RevealError(400, 'Invalid reveal request')
  const request = input as Record<string, unknown>
  let target: string
  let allowed: (candidate: string) => boolean = policy.isAllowed
  if (request.website) {
    const meta = request.website as Record<string, unknown>
    if (!isWebsiteImportGenerationToken(meta.importId) || typeof meta.nodeId !== 'string'
      || !/^[a-zA-Z0-9_-]{1,160}$/.test(meta.nodeId)
      || (meta.outputDirRel !== undefined && typeof meta.outputDirRel !== 'string')) {
      throw new RevealError(400, 'Invalid import artifact identity')
    }
    const root = resolveWebsiteImportWorkspaceRoot({ repoRoot, outputDirRel: meta.outputDirRel as string | undefined })
    if (root.ok !== true) throw new RevealError(400, root.error)
    target = path.join(root.abs, meta.importId as string, 'nodes', meta.nodeId, 'page.md')
    const realRoot = await fs.realpath(root.abs)
    allowed = candidate => inside(realRoot, candidate)
  } else {
    const canonical = typeof request.workspacePath === 'string' ? policy.resolveCanonicalWorkspacePath(request.workspacePath) : null
    const raw = request.path
    if (canonical) target = canonical
    else if (typeof raw === 'string' && path.isAbsolute(raw) && !raw.includes('\0')) target = path.resolve(raw)
    else throw new RevealError(400, 'A saved local file or folder path is required')
    if (!policy.isAllowed(target)) throw new RevealError(403, 'Path is outside the local workspace')
  }
  let real: string
  try { real = await fs.realpath(target) } catch { throw new RevealError(404, 'This item has no saved local file or folder to reveal') }
  if (!allowed(real)) throw new RevealError(403, 'Path is outside the local workspace')
  return real
}

export function workspaceRevealCommand(target: string, platform = process.platform): { command: string; args: string[]; message: string } {
  if (platform === 'darwin') return { command: 'open', args: ['-R', target], message: 'Revealed in Finder' }
  if (platform === 'win32') return { command: 'explorer.exe', args: ['/select,', target], message: 'Revealed in File Explorer' }
  if (platform === 'linux') return { command: 'xdg-open', args: [path.dirname(target)], message: 'Opened containing folder' }
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
    if (busy) return reply(409, { ok: false, error: 'A file manager request is already running' })
    busy = true
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > 8192) throw new RevealError(413, 'Reveal request is too large')
        chunks.push(bytes)
      }
      let body: unknown
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new RevealError(400, 'Invalid reveal request') }
      const target = await resolveWorkspaceRevealTarget(repoRoot, policy, body)
      const action = workspaceRevealCommand(target)
      await run(action.command, action.args)
      reply(200, { ok: true, path: target, message: action.message })
    } catch (error) {
      reply(error instanceof RevealError ? error.status : 500, { ok: false,
        error: error instanceof RevealError ? error.message : 'The local host could not open its file manager' })
    } finally { busy = false }
  }
}
