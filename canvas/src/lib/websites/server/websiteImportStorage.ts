import path from 'node:path'

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
  const storeRootAbs = path.resolve(configuredStoreRoot || path.join(repoRootAbs, '..', 'sandbox'))
  const physicalRel = [WEBSITE_IMPORT_OUTPUT_ROOT, ...parts.slice(1)].join('/')
  const abs = path.resolve(storeRootAbs, physicalRel)
  if (!abs.startsWith(storeRootAbs + path.sep) && abs !== storeRootAbs) return { ok: false, error: 'outputDirRel escapes workspace store root' }
  return { ok: true, abs, rel: normalized, storeRootAbs }
}
