import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const rest = args.slice(1)
const repoLabel = 'agentic-graph'
const helperPaths = [
  resolve(process.cwd(), '../agentic-os/bin/agentic-os-release-common-wrapper.mjs'),
  resolve(process.cwd(), '../../../agentic-os/bin/agentic-os-release-common-wrapper.mjs'),
  resolve(process.cwd(), 'node_modules/agentic-os/bin/agentic-os-release-common-wrapper.mjs'),
]
const HELP = `${repoLabel} release:common

Default path:
  npm run release:common -- start <scope> --write=<paths> [--plan=<committed-plan>]
  npm run release:common -- publish --message="<message>" [--title="<title>"] [--body-file=<file>]
  npm run release:common -- finish --ref=<lane>

Exception path:
  npm run release:common -- successor <scope> --expected-head=<published-head> [--write=<paths>]
`

const delegateHelper = (helperPath) => {
  const result = spawnSync(process.execPath, [helperPath, `--repo-label=${repoLabel}`, '--', ...args], {
    stdio: 'inherit',
    env: process.env,
  })
  if (typeof result.status === 'number') process.exit(result.status)
  throw result.error
}

for (const helperPath of helperPaths) {
  if (existsSync(helperPath)) delegateHelper(helperPath)
}

const run = (script, extraArgs = []) => {
  const result = spawnSync('npm', ['run', script, '--', ...extraArgs], {
    stdio: 'inherit',
    env: process.env,
  })
  if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status)
  if (result.error) throw result.error
}

if (command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write(HELP)
  process.exit(0)
}

const actions = {
  start() {
    run('doctor')
    run('status')
    run('lane', rest)
  },
  publish() {
    run('land', rest)
  },
  finish() {
    run('finish', rest)
    run('reap', rest)
  },
  successor() {
    run('successor', rest)
  },
}

if (actions[command]) {
  actions[command]()
  process.exit(0)
}

process.stderr.write(`unknown release:common command: ${command}\n\n${HELP}`)
process.exit(1)
