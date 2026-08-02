import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

runLocalViteBrowserSmoke({
  logLabel: 'xr-spatial-capture-fallback-browser-smoke',
  devServerPort: String(process.env.KG_XR_SPATIAL_CAPTURE_SMOKE_PORT || '4192'),
  devServerPath: '/knowgrph/',
  baseUrlEnvName: 'KG_XR_SPATIAL_CAPTURE_SMOKE_BASE_URL',
  verifierCommand: process.execPath,
  verifierArgs: ['./scripts/verify_xr_spatial_capture_fallback_browser_smoke.mjs'],
  verifierFailureLabel: 'XR spatial capture fallback browser smoke',
  devServerStartMode: 'vite-runner',
  existingServerPolicy: 'forbid',
}).catch(error => {
  console.error(error)
  process.exit(1)
})
