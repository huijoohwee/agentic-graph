import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(canvasRoot, '..')
const viteCli = resolve(repositoryRoot, 'node_modules/vite/bin/vite.js')
// Request earlier esbuild Go collection while preserving minification and native lazy chunks.
// https://go.dev/doc/gc-guide#Memory_limit
const buildEnvironment = process.env.GITHUB_ACTIONS === 'true' ? {
  GOMEMLIMIT: process.env.GOMEMLIMIT ?? '512MiB',
  GOMAXPROCS: process.env.GOMAXPROCS ?? '2',
} : {}

for (const phase of ['app', 'finalize']) {
  const result = spawnSync(process.execPath, [viteCli, 'build', '--configLoader', 'runner'], {
    cwd: canvasRoot,
    env: { ...process.env, ...buildEnvironment, AGENTIC_GRAPH_PWA_BUILD_PHASE: phase },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Vite ${phase} failed: status=${result.status}, signal=${result.signal ?? 'none'}`)
  }
}
