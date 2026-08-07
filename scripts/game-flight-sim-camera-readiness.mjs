function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requiredCameraOwner(seed, label) {
  const owner = seed.native_flight_demo || seed.native_controller_demo
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) {
    throw new Error(`${label} must declare its shared XR Camera owner`)
  }
  return owner
}

function requiredCameraContract(owner, label) {
  const camera = owner?.camera
  if (!camera || typeof camera !== 'object' || Array.isArray(camera)) {
    throw new Error(`${label} must declare its shared XR Camera contract`)
  }
  return camera
}

export async function assertFlightSimCameraReadiness({
  flightSeed,
  physicsSeed,
  readText,
}) {
  const flightOwner = requiredCameraOwner(flightSeed, 'Flight Sim')
  const physicsOwner = requiredCameraOwner(physicsSeed, 'Physics')
  const flightCamera = requiredCameraContract(flightOwner, 'Flight Sim')
  const physicsCamera = requiredCameraContract(physicsOwner, 'Physics')
  if (
    flightOwner.camera_mode !== physicsOwner.camera_mode
    || flightOwner.camera_mode !== flightCamera.default
  ) {
    throw new Error('Flight Sim camera_mode must match the shared Physics default')
  }
  for (const key of [
    'default',
    'selector',
    'available',
    'invocation',
    'timeline_override',
  ]) {
    if (!equal(flightCamera[key], physicsCamera[key])) {
      throw new Error(`Flight Sim Camera ${key} must match the Physics source`)
    }
  }
  const expectedOwners = {
    catalog_owner: 'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
    selection_owner: 'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
    driver_owner: 'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
    runtime_canvas_driver_owner: 'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
  }
  for (const [key, expected] of Object.entries(expectedOwners)) {
    if (flightCamera[key] !== expected) {
      throw new Error(`Flight Sim Camera ${key} must be ${expected}`)
    }
  }

  const controllerCamera = await readText(
    'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
  )
  const flightTarget = await readText(
    'packages/apple-spatial-input/src/camera.ts',
  )
  const catalog = await readText(
    'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
  )
  const runtime = await readText(
    'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
  )
  const controls = await readText('canvas/src/features/three/Controls.tsx')
  const mapCamera = await readText(
    'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
  )
  const missionStage = await readText(
    'canvas/src/features/game-flight-sim/FlightSimMissionStage.tsx',
  )
  const requiredMarkers = [
    [controllerCamera, 'resolveFlightSimFollowTarget'],
    [controllerCamera, "from '../../../../packages/apple-spatial-input/src/camera'"],
    [controllerCamera, "readXrNativeControllerCamera().mode === 'fixed-follow'"],
    [controllerCamera, 'controls.enablePan = false'],
    [controllerCamera, 'renderer.xr.isPresenting'],
    [flightTarget, 'export function resolveFlightSimFollowTarget'],
    [catalog, "['fixed-follow', 'free-orbit']"],
    [catalog, 'XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE'],
    [runtime, 'mode: XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE'],
    [controls, "from './useXrNativeControllerDemoCamera'"],
    [controls, 'useXrNativeControllerDemoCamera({'],
    [mapCamera, 'export function applyFlightGeoOverlayCameraToMap('],
    [mapCamera, "overlay.camera.effectiveOwner === 'timeline-playback'"],
    [mapCamera, "overlay.camera.source !== 'fixed-follow'"],
    [mapCamera, "FLIGHT_GEO_CAMERA_PRESETS[overlay.camera.view]"],
    [mapCamera, 'center: [...overlay.camera.centerCoordinate]'],
    [mapCamera, 'map.jumpTo(expected)'],
  ]
  const missing = requiredMarkers
    .filter(([source, marker]) => !source.includes(marker))
    .map(([, marker]) => marker)
  if (missing.length > 0) {
    throw new Error(`canonical XR controller camera is missing: ${missing.join(', ')}`)
  }
  const useThreeCallCount = missionStage.match(/\buseThree\s*\(/g)?.length || 0
  const useFrameCallCount = missionStage.match(/\buseFrame\s*\(/g)?.length || 0
  if (
    /\b(?:camera|controls)\.(?:position|target|enablePan|enableRotate|enableZoom)/
      .test(flightTarget)
    || /useFlightSimCamera/.test(controls)
    || useThreeCallCount !== 1
    || !missionStage.includes('const { gl } = useThree()')
    || useFrameCallCount !== 1
    || !/\buseFrame\s*\(\s*\(\s*\)\s*=>/.test(missionStage)
    || /\bnew\s+(?:THREE\.)?(?:PerspectiveCamera|OrbitControls)\b/
      .test(missionStage)
    || /\b(?:const|let)\s*\{[^}]*\bcamera\b[^}]*\}\s*=\s*useThree\s*\(/
      .test(missionStage)
    || /\buseThree\s*\([^)]*\bcamera\b/.test(missionStage)
    || /\b(?:camera|controls)\s*(?:\.|\[)/.test(missionStage)
    || /\b(?:camera|controls)\.(?:position|target|lookAt|fov|updateProjectionMatrix|enablePan|enableRotate|enableZoom)\b/
      .test(missionStage)
  ) {
    throw new Error('Flight may supply a follow target but must not own a camera driver')
  }
}
