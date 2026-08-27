import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { repoRoot } from './collaboration-contract.mjs'

const args = process.argv.slice(2)
if (args.length > 0) throw new Error(`unsupported collaboration report example arguments: ${args.join(' ')}`)

const result = spawnSync(
  process.execPath,
  [path.resolve(repoRoot, 'scripts', 'check-collaboration-runtime.mjs'), '--json'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, AGENTICGRAPH_PR_NUMBER: '' },
  },
)

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(result.stderr.trim() || `collaboration report example exited with status ${result.status}`)
}

process.stdout.write(result.stdout)
