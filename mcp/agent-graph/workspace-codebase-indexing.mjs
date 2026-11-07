import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

export const WORKSPACE_CODEBASE_INDEX_LIMITS = Object.freeze({
  maxFiles: 20_000,
  maxFileBytes: 3_000_000,
  maxTotalBytes: 100_000_000,
  maxDurationMs: 60_000,
  projectionLimit: 1_000,
  projectionByteLimit: 450_000,
})

const excludedPaths = Object.freeze([
  '.*', '*credentials*', '*secrets*', '*.pem', '*.key', '*.p12', '*.pfx',
])

/** Shared bounded local cache for repeated indexes of the same canonical repository. */
export function workspaceCodebaseIndexOutputRoot(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) {
    throw new Error('Codebase index root must be an absolute local path')
  }
  const canonicalPath = path.resolve(rootPath)
  const rootKey = createHash('sha256').update(canonicalPath).digest('hex').slice(0, 24)
  return path.join(os.tmpdir(), 'agentic-graph-codebase-index', rootKey)
}

/** Shared bounded ingest request for local codebase indexing and manifest generation. */
export function buildWorkspaceCodebaseIndexArgs(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) {
    throw new Error('Codebase index root must be an absolute local path')
  }
  return {
    rootPath,
    ...WORKSPACE_CODEBASE_INDEX_LIMITS,
    strict: true,
    useCache: true,
    exclude: [...excludedPaths],
  }
}
