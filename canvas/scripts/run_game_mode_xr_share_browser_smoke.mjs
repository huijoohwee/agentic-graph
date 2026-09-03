import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'
import { decodePublishedDocShareToken } from '../src/features/canvas/canvasDocShareToken.mjs'

const validationShareUrl = String(process.env.AG_GAME_MODE_VALIDATION_SHARE_URL || '').trim()
if (!validationShareUrl) {
  throw new Error('AG_GAME_MODE_VALIDATION_SHARE_URL is required for the opt-in Game Mode XR share smoke')
}

let validationOrigin = ''
let validationSeedBasename = ''
try {
  const parsed = new URL(validationShareUrl)
  const token = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) || '')
  const source = decodePublishedDocShareToken(token)
  validationSeedBasename = String(source?.canonicalPath || '').split('/').filter(Boolean).at(-1) || ''
  if (!['http:', 'https:'].includes(parsed.protocol)
    || !parsed.hostname
    || !validationSeedBasename
    || parsed.username
    || parsed.password) {
    throw new Error('invalid validation share URL')
  }
  validationOrigin = parsed.origin
} catch {
  throw new Error('AG_GAME_MODE_VALIDATION_SHARE_URL must be an absolute HTTP(S) share URL with an opaque path token')
}

process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT ||= `${process.cwd()}/../docs`
process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL = '1'
process.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH = validationSeedBasename
delete process.env.VITE_AGENTIC_OS_RUN_READY_DEMO
process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = validationOrigin

async function run() {
  await runLocalViteBrowserSmoke({
    logLabel: 'game-mode-xr-share-browser-smoke',
    devServerPort: String(process.env.AG_GAME_MODE_XR_SHARE_SMOKE_PORT || '4186'),
    devServerPath: '/agentic-graph/',
    baseUrlEnvName: 'AG_GAME_MODE_XR_SHARE_SMOKE_BASE_URL',
    verifierCommand: 'python3',
    verifierArgs: ['scripts/verify_game_mode_xr_share_browser_smoke.py'],
    verifierFailureLabel: 'Game Mode XR share browser smoke',
    prepareBeforeStart: false,
    devServerStartMode: 'vite-runner',
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
