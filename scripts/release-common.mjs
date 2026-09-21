import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const repoLabel = 'agentic-graph'
const helperPaths = [
  resolve(process.cwd(), '../agentic-os/bin/agentic-os-release-common-wrapper.mjs'),
  resolve(process.cwd(), 'node_modules/agentic-os/bin/agentic-os-release-common-wrapper.mjs'),
]
for (const helperPath of helperPaths) {
  if (!existsSync(helperPath)) continue
  const result = spawnSync(process.execPath, [helperPath, `--repo-label=${repoLabel}`, '--', ...args], {
    stdio: 'inherit',
    env: process.env,
  })
  if (typeof result.status === 'number') process.exit(result.status)
  throw result.error
}
process.stderr.write(`${repoLabel}: blocked-release-common-helper-missing: pin agentic-os\n`)
process.exit(1)
