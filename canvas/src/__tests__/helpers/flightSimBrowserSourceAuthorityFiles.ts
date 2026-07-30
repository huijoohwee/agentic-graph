import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE_PATHS = Object.freeze({
  browserBootstrap:
    'canvas/scripts/lib/game_flight_sim_smoke_bootstrap.py',
  browserProofBridge:
    'canvas/src/features/testing/flightSimBrowserProofBridge.ts',
  cameraTrackingVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_camera_tracking.py',
  cameraVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_camera.py',
  deadlineVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_deadlines.py',
  evidenceValidator:
    'canvas/scripts/lib/game-flight-sim-browser-evidence-validation.mjs',
  geoXrLayoutVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_geo_xr_layout.py',
  geoXrPresentationVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_geo_xr_presentation.py',
  geoXrRequirementsVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_geo_xr_requirements.py',
  geoXrVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_geo_xr.py',
  launcherRegression:
    'canvas/scripts/__tests__/game-flight-sim-browser-smoke-launcher.test.mjs',
  mainEntry:
    'canvas/src/main.tsx',
  missionVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_mission.py',
  networkBoundary:
    'canvas/scripts/lib/game_flight_sim_smoke_network.py',
  previewPageVerifier:
    'canvas/scripts/__tests__/verify_game_flight_sim_preview_page.py',
  runner:
    'canvas/scripts/run_game_flight_sim_browser_smoke.mjs',
  runtimePhases:
    'canvas/scripts/lib/game_flight_sim_smoke_runtime_phases.py',
  sceneVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_scene.py',
  serverOwner:
    'canvas/scripts/lib/run-local-vite-browser-smoke.mjs',
  sourceSelection:
    'canvas/scripts/lib/game_flight_sim_smoke_source_selection.py',
  sourceVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_source.py',
  touchSurfaceVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_mobile_surface.py',
  touchVerifier:
    'canvas/scripts/lib/game_flight_sim_smoke_mobile.py',
  verifier:
    'canvas/scripts/verify_game_flight_sim_browser_smoke.py',
})

type BrowserAuthoritySources = {
  [Name in keyof typeof SOURCE_PATHS]: string
}

export function readFlightSimBrowserAuthoritySources(
  repoRoot: string,
): BrowserAuthoritySources {
  return Object.fromEntries(
    Object.entries(SOURCE_PATHS).map(([name, relativePath]) => [
      name,
      readFileSync(resolve(repoRoot, relativePath), 'utf8'),
    ]),
  ) as BrowserAuthoritySources
}
