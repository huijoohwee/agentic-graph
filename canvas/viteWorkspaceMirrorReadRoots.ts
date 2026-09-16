import path from 'node:path'
import { createRequire } from 'node:module'

// Request-time loads must outlive Vite's short-lived configuration runner.
const requireNative = createRequire(import.meta.url)

const normalizeRoot = (value: unknown): string => {
  const root = String(value || '').trim()
  return root ? path.resolve(root) : ''
}

export function resolveWorkspaceMirrorReadRoots(args: {
  repoRoot: string
  configuredRoots?: readonly unknown[]
}): string[] {
  const repoRoot = path.resolve(args.repoRoot)
  return [...new Set([
    repoRoot,
    path.resolve(repoRoot, '..'),
    path.resolve(repoRoot, '..', '..'),
    ...(args.configuredRoots || []).map(normalizeRoot).filter(Boolean),
  ])]
}

export function isWorkspaceMirrorReadPathAllowed(candidate: string, allowedRoots: readonly string[]): boolean {
  const resolved = path.resolve(candidate)
  return allowedRoots.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}

// On-demand compatibility projection for the persisted flat documentation IDs.
export async function readNativeWorkspaceDocs(rootAbsPath: string, graphRoot: string, maxFiles: number) {
  if (!rootAbsPath.endsWith('/agentic-os/catalog/dictionaries')) return null
  const { resolveAgenticCanvasOsDocsRoot } = requireNative('../mcp/agentic-canvas-os-docs-runtime.js')
  if (rootAbsPath !== resolveAgenticCanvasOsDocsRoot({ rootDir: graphRoot })) return null
  const { readRuntimeDocsSources } = requireNative('../scripts/runtime-docs-sources.mjs') as typeof import('../scripts/runtime-docs-sources.mjs')
  const { stat } = requireNative('node:fs/promises') as typeof import('node:fs/promises')
  const sources = await readRuntimeDocsSources({ docsRoot: rootAbsPath, graphRoot })
  if (sources.length > maxFiles) throw new Error('Native docs projection exceeds the requested file limit')
  return Promise.all(sources.map(async entry => ({ relPath: entry.fileName,
    text: entry.bytes.toString('utf8'), updatedAtMs: Math.floor((await stat(entry.filePath)).mtimeMs) })))
}
