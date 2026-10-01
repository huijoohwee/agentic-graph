import path from 'node:path'
import fs from 'node:fs/promises'

/** Atomically reserve an existing-format run ID before any artifact write. */
export async function reserveWebsiteImportRun(workspaceAbs: string, token: unknown, request: unknown): Promise<{ importId: string; existing: boolean }> {
  await fs.mkdir(workspaceAbs, { recursive: true })
  const explicit = isWebsiteImportGenerationToken(token) ? String(token).trim() : ''
  const binding = JSON.stringify(request)
  const now = Date.now()
  for (let offset = 0; offset < 256; offset += 1) {
    // Preserve the portable UTC-slot grammar; startedAtMs records actual wall time.
    const importId = explicit || formatWebsiteImportGenerationToken(now + offset * 1000)
    const directory = path.join(workspaceAbs, importId)
    try { await fs.mkdir(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!explicit) continue
      let prior: string
      try { prior = await fs.readFile(path.join(directory, 'request.json'), 'utf8') }
      catch { throw new Error('Import run is unbound or still being reserved; start a fresh run') }
      if (prior !== binding) throw new Error('Import run belongs to a different URL, selection or options; start a fresh run')
      return { importId, existing: true }
    }
    await fs.writeFile(path.join(directory, 'request.json'), binding, { encoding: 'utf8', flag: 'wx' })
    return { importId, existing: false }
  }
  throw new Error('Import run capacity reached; retry with a fresh run later')
}

export const WEBSITE_IMPORT_OUTPUT_DIR_REL_DEFAULT = 'agentic-graph-workspace/website-imports'
const WEBSITE_IMPORT_OUTPUT_ROOT_LEGACY = '.agentic-graph-workspace'
const WEBSITE_IMPORT_OUTPUT_ROOT = 'agentic-graph-workspace'

const normalizeRel = (raw: string): string => String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')

export const isWebsiteImportGenerationToken = (raw: unknown): raw is string => {
  const token = String(raw || '').trim()
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(token)
  if (!match) return false
  const [, yyyy, mm, dd, hh, min, sec] = match
  const time = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(sec))
  if (!Number.isFinite(time)) return false
  const canonical = new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return canonical === token
}

export const formatWebsiteImportGenerationToken = (timestampMs: number): string => {
  const date = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now())
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export const resolveWebsiteImportGenerationToken = (raw: unknown, timestampMs = Date.now()): string => {
  const existing = String(raw || '').trim()
  return isWebsiteImportGenerationToken(existing) ? existing : formatWebsiteImportGenerationToken(timestampMs)
}

/** Reuse the configured document mirror's sibling output directory on every device. */
export const resolveWorkspaceDocumentOutputRoot = (repoRoot: string): string => {
  const docsRoot = String(process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT || '').trim()
  return docsRoot ? path.resolve(docsRoot, '..', 'docs_') : path.resolve(repoRoot, '..', 'docs_')
}

export const resolveWebsiteImportWorkspaceRoot = (args: {
  repoRoot: string
  outputDirRel?: string | null
  storeRoot?: string | null
}): { ok: true; abs: string; rel: string; storeRootAbs: string } | { ok: false; error: string } => {
  const relRaw = normalizeRel(args.outputDirRel || WEBSITE_IMPORT_OUTPUT_DIR_REL_DEFAULT) || WEBSITE_IMPORT_OUTPUT_DIR_REL_DEFAULT
  const normalized = path.posix.normalize(relRaw)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return { ok: false, error: 'Missing outputDirRel' }
  if (parts[0] !== WEBSITE_IMPORT_OUTPUT_ROOT && parts[0] !== WEBSITE_IMPORT_OUTPUT_ROOT_LEGACY) {
    return { ok: false, error: 'outputDirRel must be under agentic-graph-workspace' }
  }
  if (normalized.startsWith('..') || normalized.includes('/../')) return { ok: false, error: 'Invalid outputDirRel' }

  const repoRootAbs = path.resolve(args.repoRoot)
  const configuredStoreRoot = String(args.storeRoot || process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT || '').trim()
  const storeRootAbs = path.resolve(configuredStoreRoot || resolveWorkspaceDocumentOutputRoot(repoRootAbs))
  const physicalRel = [WEBSITE_IMPORT_OUTPUT_ROOT, ...parts.slice(1)].join('/')
  const abs = path.resolve(storeRootAbs, physicalRel)
  if (!abs.startsWith(storeRootAbs + path.sep) && abs !== storeRootAbs) return { ok: false, error: 'outputDirRel escapes workspace store root' }
  return { ok: true, abs, rel: normalized, storeRootAbs }
}

/** Existing generations keep their original location; only new runs use the new default. */
export async function resolveExistingWebsiteImportWorkspaceRoot(args: { repoRoot: string; outputDirRel?: string | null; importId: unknown }) {
  const current = resolveWebsiteImportWorkspaceRoot(args)
  if (current.ok !== true || !isWebsiteImportGenerationToken(args.importId) || process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT?.trim()) return current
  const legacy = resolveWebsiteImportWorkspaceRoot({ ...args, storeRoot: path.resolve(args.repoRoot, '..', 'sandbox') })
  if (legacy.ok !== true || legacy.abs === current.abs) return current
  for (const candidate of [current, legacy]) {
    try {
      // An incomplete current generation still owns its ID; never mix artifacts between stores.
      if ((await fs.lstat(path.join(candidate.abs, args.importId))).isDirectory()) return candidate
      return current
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return current
}
