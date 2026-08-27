import { publishExactBrowserSmokeSource } from './lib/exact-browser-smoke-source.mjs'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

publishExactBrowserSmokeSource('AG_MOTION_CONTROL_LIVE_CAMERA')

runLocalViteBrowserSmoke({
  logLabel: 'motion-control-live-camera-browser-smoke',
  devServerPort: String(process.env.AG_MOTION_CONTROL_LIVE_CAMERA_PORT || '4191'),
  baseUrlEnvName: 'AG_MOTION_CONTROL_LIVE_CAMERA_BASE_URL',
  verifierCommand: process.execPath,
  verifierArgs: ['./scripts/verify_motion_control_live_camera_browser_smoke.mjs'],
  verifierFailureLabel: 'Motion Control live-camera browser smoke',
  devServerStartMode: 'vite-runner',
  existingServerPolicy: 'forbid',
}).catch(error => {
  console.error(error)
  process.exit(1)
})
