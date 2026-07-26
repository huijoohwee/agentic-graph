import { execFileSync } from 'node:child_process'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

process.env.KG_MOTION_CONTROL_LITERT_EXPECTED_HEAD = execFileSync(
  'git',
  ['rev-parse', 'HEAD'],
  { encoding: 'utf8' },
).trim()
process.env.KG_MOTION_CONTROL_LITERT_EXPECTED_BRANCH = execFileSync(
  'git',
  ['branch', '--show-current'],
  { encoding: 'utf8' },
).trim()
process.env.KG_MOTION_CONTROL_LITERT_EXPECTED_MAIN = execFileSync(
  'git',
  ['rev-parse', 'refs/remotes/origin/main'],
  { encoding: 'utf8' },
).trim()

runLocalViteBrowserSmoke({
  logLabel: 'motion-control-litert-browser-smoke',
  devServerPort: String(process.env.KG_MOTION_CONTROL_LITERT_SMOKE_PORT || '4189'),
  baseUrlEnvName: 'KG_MOTION_CONTROL_LITERT_SMOKE_BASE_URL',
  verifierCommand: process.execPath,
  verifierArgs: ['./scripts/verify_motion_control_litert_browser_smoke.mjs'],
  verifierFailureLabel: 'Motion Control LiteRT browser smoke',
  devServerStartMode: 'vite-runner',
  existingServerPolicy: 'forbid',
}).catch(error => {
  console.error(error)
  process.exit(1)
})
