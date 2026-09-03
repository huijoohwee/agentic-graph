import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(canvasRoot)

runLocalViteBrowserSmoke({
  logLabel: 'xr-v2-browser-smoke',
  devServerPort: String(process.env.AG_XR_V2_SMOKE_PORT || '4193'),
  devServerPath: '/agentic-graph/',
  baseUrlEnvName: 'AG_XR_V2_SMOKE_BASE_URL',
  verifierCommand: process.execPath,
  verifierArgs: ['./scripts/verify_xr_v2_browser_smoke.mjs'],
  verifierFailureLabel: 'XR v2 browser smoke',
  devServerStartMode: 'vite-runner',
  existingServerPolicy: 'forbid',
}).catch(error => {
  console.error(error)
  process.exit(1)
})
