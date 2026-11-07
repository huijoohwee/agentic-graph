import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gitCommonDir = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
if (gitCommonDir.status !== 0) throw new Error('Could not resolve the Graph repository git common directory.')

const graphRoot = path.dirname(gitCommonDir.stdout.trim())
const workspaceRoot = path.dirname(graphRoot)
const configuredDocsRoot = String(process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT || '').trim()
const sharedDocsRoot = path.resolve(configuredDocsRoot || path.join(workspaceRoot, 'agentic-canvas-os', 'docs'))
if (!existsSync(path.join(sharedDocsRoot, 'PROMPT-PRESETS.md'))) {
  throw new Error(`The shared prompt preset catalog is unavailable at ${path.join(sharedDocsRoot, 'PROMPT-PRESETS.md')}`)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npm, [
  'run', 'dev:docs', '--workspace=@agentic-graph/canvas', '--', ...process.argv.slice(2),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: sharedDocsRoot,
  },
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
