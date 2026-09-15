import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const script = fileURLToPath(import.meta.url)
const canvasRoot = resolve(dirname(script), '..')
process.chdir(canvasRoot)
Object.assign(process.env, {
  VITE_AGENTIC_OS_STORAGE_BASE_URL: '', VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: '',
  VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN: '', VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED: '0',
  VITE_AGENTIC_OS_GITHUB_WRITE_BASE_URL: '', VITE_WORKSPACE_SEED_SYNC_ENABLED: '0',
  VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: '0',
  TSX_TSCONFIG_PATH: resolve(canvasRoot, 'tsconfig.json'),
})
await runLocalViteBrowserSmoke({
  logLabel: 'storage-auth-browser-smoke', devServerPort: '4198',
  baseUrlEnvName: 'AG_STORAGE_AUTH_BASE_URL', verifierCommand: process.execPath,
  verifierArgs: ['--import', 'tsx', './scripts/verify_storage_auth_browser_smoke.mjs'],
  devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid',
})
