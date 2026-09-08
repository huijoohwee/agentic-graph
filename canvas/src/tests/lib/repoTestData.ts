import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveWorkspaceRoot } from '../../../../scripts/surface/workspace-paths.mjs'
import { parseFrontmatter } from '../../../../scripts/collaboration-contract.mjs'
import { resolveRuntimeDocsDependency } from '../../../../scripts/runtime-readiness-contract.mjs'
import { resolveAgenticCanvasOsDocsRoot, resolveAgenticCanvasOsDocsRevision } from '../../../../mcp/agentic-canvas-os-docs-runtime.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const normalizeTestDataBasename = (filename: string): string => {
  const name = String(filename || '').trim()
  if (!name || name !== path.basename(name) || name.includes('/') || name.includes('\\')) {
    throw new Error(`expected repo test-data basename, got ${filename}`)
  }
  return name
}

export const resolveRepoTestDataPath = (filename: string): string =>
  path.join(repoRoot, 'data', 'test-data', normalizeTestDataBasename(filename))

export const resolveRepoSourcePath = (relativePath: string, repositoryRoot = repoRoot): string => {
  const resolvedRoot = path.resolve(repositoryRoot)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  const relative = path.relative(resolvedRoot, resolvedPath)
  if (path.isAbsolute(relativePath) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`expected candidate-relative source path, got ${relativePath}`)
  }
  return resolvedPath
}

export const resolveSiblingFixturePath = (
  repository: 'huijoohwee' | 'huijoohwee.github.io',
  relativePath: string,
  repositoryRoot = repoRoot,
): string => resolveRepoSourcePath(
  relativePath,
  path.join(resolveWorkspaceRoot({ repositoryRoot }), repository),
)

export const resolvePinnedAgenticDocsRoot = async ({
  repositoryRoot = repoRoot,
  env = process.env,
}: { repositoryRoot?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> => {
  const contractPath = resolveRepoSourcePath('docs/runtime-readiness-contract.md', repositoryRoot)
  const dependency = resolveRuntimeDocsDependency(parseFrontmatter(readFileSync(contractPath, 'utf8'), contractPath))
  const docsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: repositoryRoot, env })
  const revision = await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot: docsRoot, env })
  if (revision !== dependency.ref) {
    throw new Error(`expected pinned Agentic Canvas OS ${dependency.ref}, got ${revision} at ${docsRoot}`)
  }
  return docsRoot
}
