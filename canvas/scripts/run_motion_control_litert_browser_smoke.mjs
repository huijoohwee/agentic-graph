import { publishExactBrowserSmokeSource } from './lib/exact-browser-smoke-source.mjs'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

publishExactBrowserSmokeSource('AG_MOTION_CONTROL_LITERT')

runLocalViteBrowserSmoke({
  logLabel: 'motion-control-litert-browser-smoke',
  devServerPort: String(process.env.AG_MOTION_CONTROL_LITERT_SMOKE_PORT || '4189'),
  baseUrlEnvName: 'AG_MOTION_CONTROL_LITERT_SMOKE_BASE_URL',
  verifierCommand: process.execPath,
  verifierArgs: ['./scripts/verify_motion_control_litert_browser_smoke.mjs'],
  verifierFailureLabel: 'Motion Control LiteRT browser smoke',
  devServerStartMode: 'vite-runner',
  existingServerPolicy: 'forbid',
}).catch(error => {
  console.error(error)
  process.exit(1)
})
