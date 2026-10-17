import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(canvasRoot, '..')
const viteCli = resolve(repositoryRoot, 'node_modules/vite/bin/vite.js')

for (const phase of ['app', 'finalize']) {
  const result = spawnSync(process.execPath, [viteCli, 'build', '--configLoader', 'runner'], {
    cwd: canvasRoot,
    env: { ...process.env, AGENTIC_GRAPH_PWA_BUILD_PHASE: phase },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
