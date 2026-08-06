import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(canvasRoot)
process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = resolve(canvasRoot, '../docs')
process.env.KG_XR_V2_WORKSPACE_SMOKE_BASE_URL = `http://127.0.0.1:${String(process.env.KG_XR_V2_WORKSPACE_SMOKE_PORT || '4194')}`

runLocalViteBrowserSmoke({
  logLabel: 'xr-v2-workspace-seed-browser-smoke',
  devServerPort: String(process.env.KG_XR_V2_WORKSPACE_SMOKE_PORT || '4194'),
  devServerPath: '/knowgrph/',
  baseUrlEnvName: 'KG_XR_V2_WORKSPACE_SMOKE_BASE_URL_UNUSED',
  verifierCommand: process.execPath,
  verifierArgs: ['./scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs'],
  verifierFailureLabel: 'XR v2 workspace-seed browser smoke',
  devServerStartMode: 'vite-runner',
  existingServerPolicy: 'forbid',
}).catch(error => {
  console.error(error)
  process.exit(1)
})
