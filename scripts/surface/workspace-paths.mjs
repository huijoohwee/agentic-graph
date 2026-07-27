import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SURFACE_PATHS } from './constants.mjs'

const surfaceRoot = path.dirname(fileURLToPath(import.meta.url))
export const knowgrphRoot = path.resolve(surfaceRoot, '..', '..')

export function resolveWorkspaceRoot({
  repositoryRoot = knowgrphRoot,
  git = defaultGit,
} = {}) {
  const commonDir = git(['rev-parse', '--git-common-dir'], repositoryRoot)
  const absoluteCommonDir = path.resolve(repositoryRoot, commonDir)
  const canonicalRepositoryRoot = path.dirname(absoluteCommonDir)
  return path.dirname(canonicalRepositoryRoot)
}

export function resolveSurfacePaths({
  repositoryRoot = knowgrphRoot,
  workspaceRoot = resolveWorkspaceRoot({ repositoryRoot }),
} = {}) {
  return {
    repositoryRoot,
    workspaceRoot,
    publicOriginRoot: path.join(workspaceRoot, 'huijoohwee'),
    agenticCanvasOsRoot: path.join(workspaceRoot, 'agentic-canvas-os'),
    registryPath: path.join(repositoryRoot, DEFAULT_SURFACE_PATHS.registry),
    licenseRegistryPath: path.join(repositoryRoot, DEFAULT_SURFACE_PATHS.licenses),
    schemaPath: path.join(repositoryRoot, DEFAULT_SURFACE_PATHS.schema),
    stagingRoot: path.join(repositoryRoot, DEFAULT_SURFACE_PATHS.staging),
    ledgerRoot: path.join(repositoryRoot, DEFAULT_SURFACE_PATHS.ledger),
  }
}

function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}
