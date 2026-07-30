import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function normalizeGameFlightSimCandidateBranch(branch) {
  const normalized = String(branch || '').trim()
  if (!normalized) throw new Error('Flight browser proof candidate branch is required')
  return normalized === 'HEAD' ? 'detached' : normalized
}

export function resolveGameFlightSimBrowserPaths(moduleUrl) {
  const scriptDirectory = path.dirname(fileURLToPath(moduleUrl))
  const canvasRoot = path.resolve(scriptDirectory, '..')
  const repoRoot = path.resolve(canvasRoot, '..')

  return Object.freeze({
    canvasRoot,
    distIndexPath: path.join(canvasRoot, 'dist', 'index.html'),
    repoRoot,
  })
}
