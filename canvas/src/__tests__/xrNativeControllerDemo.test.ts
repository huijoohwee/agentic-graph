import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createXrNativeControllerInput,
  mergeXrNativeControllerInputs,
  readXrNativeControllerGamepadInput,
  readXrNativeControllerKeyboardInput,
  shouldConsumeXrNativeControllerKeyUp,
} from '@/features/three/xrNativeControllerInput'
import {
  XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION,
  XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION,
  XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS,
  XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID,
  XR_NATIVE_PLAYGROUND_CENTER_Z,
  XR_NATIVE_PLAYGROUND_HALF_EXTENT_X,
  XR_NATIVE_PLAYGROUND_HALF_EXTENT_Z,
  createXrNativeControllerDemoRuntime,
  readXrNativeControllerDemoRuntimeFrame,
  resetXrNativeControllerDemoRuntime,
  setXrNativeControllerDemoRuntimeInput,
  stepXrNativeControllerDemoRuntime,
  stepXrNativeControllerDemoRuntimeTicks,
} from '@/features/three/xrNativeControllerDemoRuntime'
import { setXrPhysicsSimulationBodyPose } from '@/features/three/xrSpatialPhysicsAdapter'
import { resolveXrMotionReferenceStage } from '@/features/three/xrSceneLibrary'
import { resolveXrTerrainPerimeter } from '@/features/three/xrTerrainPerimeter'
import { resolveXrNativeControllerFollowFraming } from '@/features/three/xrNativeControllerCameraFraming'
import {
  XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  XR_NATIVE_CONTROLLER_CAMERA_OPTIONS,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'
import {
  buildXrPhysicsInvocation,
} from '@/features/three/xrSceneMcpContract.mjs'
import {
  normalizeXrPhysicsControl,
  parseXrInteractiveInvocation,
} from '@/features/three/xrSceneInteractiveInvocation'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function near(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${message}: expected ${expected}, got ${actual}`)
}

function source(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

function runningRuntime(mode: 'ball' | 'rocket' = 'ball') {
  const runtime = createXrNativeControllerDemoRuntime()
  runtime.mode = mode
  runtime.phase = 'running'
  stepXrNativeControllerDemoRuntimeTicks(runtime, 2)
  return runtime
}

export function testXrNativeControllerInputNormalizesKeyboardAndGamepad() {
  const keyboard = readXrNativeControllerKeyboardInput(new Set(['KeyW', 'KeyD', 'ShiftLeft']))
  near(Math.hypot(keyboard.moveX, keyboard.moveZ), 1, 1e-9, 'diagonal keyboard input must normalize')
  assert(keyboard.moveX > 0 && keyboard.moveZ < 0 && keyboard.modifier, 'keyboard must map movement and modifier')
  const primaryGamepad = readXrNativeControllerGamepadInput({
    connected: true,
    axes: [0.5, 0.1],
    buttons: [{ pressed: true, value: 1 }],
  })
  assert(primaryGamepad.moveX > 0 && primaryGamepad.moveZ === 0, 'gamepad dead zone must suppress stick drift')
  assert(primaryGamepad.primary && primaryGamepad.source === 'gamepad', 'standard south button must map to primary')
  const shoulderGamepad = readXrNativeControllerGamepadInput({
    connected: true,
    axes: [0, -0.8],
    buttons: Array.from({ length: 6 }, (_, index) => ({ pressed: index === 5, value: index === 5 ? 1 : 0 })),
  })
  assert(shoulderGamepad.modifier && shoulderGamepad.moveZ < 0, 'standard shoulder and vertical stick must map')
  const merged = mergeXrNativeControllerInputs(keyboard, primaryGamepad)
  assert(merged.source === 'mixed' && merged.primary && merged.modifier, 'keyboard and gamepad must merge into one canonical state')
  assert(readXrNativeControllerGamepadInput(null).source === 'none', 'missing gamepads must fail closed')
  assert(!shouldConsumeXrNativeControllerKeyUp({ active: false, code: 'Space', editableTarget: false, wasCaptured: true }), 'inactive demo must not cancel Space keyup')
  assert(!shouldConsumeXrNativeControllerKeyUp({ active: true, code: 'Space', editableTarget: false, wasCaptured: false }), 'uncaptured keyup must remain available to focused controls')
  assert(shouldConsumeXrNativeControllerKeyUp({ active: true, code: 'Space', editableTarget: false, wasCaptured: true }), 'active captured input must suppress the matching browser action')
}

export function testXrNativeBallControllerIsDeterministicAndInteractive() {
  const chunked = runningRuntime('ball')
  const exact = runningRuntime('ball')
  const singaporePerimeter = resolveXrTerrainPerimeter(resolveXrMotionReferenceStage('singapore'))
  assert(chunked.terrainId === 'singapore'
    && chunked.colliders.some(collider => collider.id === 'terrain:singapore:west')
    && !chunked.colliders.some(collider => collider.id.startsWith('stage:skyline-'))
    && readXrNativeControllerDemoRuntimeFrame(chunked).terrainId === 'singapore', 'native controller runtime must default to Singapore terrain with matching procedural colliders')
  assert(singaporePerimeter.widthMeters === 32
    && singaporePerimeter.depthMeters === 24
    && singaporePerimeter.halfWidthMeters === 16
    && singaporePerimeter.halfDepthMeters === 12
    && singaporePerimeter.edges.length === 4, 'Singapore terrain perimeter must resolve from the canonical stage dimensions')
  for (const edge of singaporePerimeter.edges) {
    const collider = chunked.colliders.find(candidate => candidate.id === `terrain:singapore:${edge.side}`)
    assert(collider, `Singapore terrain must expose the ${edge.side} boundary collider`)
    near(collider.center[0], edge.centerMeters[0], 1e-9, `${edge.side} boundary x must share the canonical perimeter`)
    near(collider.center[2], edge.centerMeters[1], 1e-9, `${edge.side} boundary z must share the canonical perimeter`)
    near(collider.sizeMeters[0], edge.sizeMeters[0], 1e-9, `${edge.side} boundary width must share the canonical perimeter`)
    near(collider.sizeMeters[2], edge.sizeMeters[1], 1e-9, `${edge.side} boundary depth must share the canonical perimeter`)
  }
  const input = createXrNativeControllerInput({ moveZ: -1, modifier: true, source: 'keyboard' })
  setXrNativeControllerDemoRuntimeInput(chunked, input)
  setXrNativeControllerDemoRuntimeInput(exact, input)
  for (let index = 0; index < 120; index += 1) stepXrNativeControllerDemoRuntime(chunked, 1 / 60)
  stepXrNativeControllerDemoRuntimeTicks(exact, 240)
  const chunkedFrame = readXrNativeControllerDemoRuntimeFrame(chunked)
  const exactFrame = readXrNativeControllerDemoRuntimeFrame(exact)
  assert(JSON.stringify(chunkedFrame) === JSON.stringify(exactFrame), 'fixed input must replay identically across render chunks')
  assert(chunkedFrame.player.position[2] < 3, `ball movement must drive the shared rigid body forward, got ${JSON.stringify(chunkedFrame.player)}`)
  assert(Math.abs(chunkedFrame.ballRotation[0]) > 0.1 && Math.abs(chunkedFrame.ballRotation[1]) > 0.01, 'ball displacement and modifier must produce visible roll and torque')
  const interaction = runningRuntime('ball')
  const barrelStart = readXrNativeControllerDemoRuntimeFrame(interaction).bodies.find(body => body.subjectId === 'native-crate-a')
  assert(barrelStart, 'playground must include the foreground barrel stack')
  setXrNativeControllerDemoRuntimeInput(interaction, createXrNativeControllerInput({ moveX: 1, source: 'keyboard' }))
  stepXrNativeControllerDemoRuntimeTicks(interaction, 280)
  const barrel = readXrNativeControllerDemoRuntimeFrame(interaction).bodies.find(body => body.subjectId === 'native-crate-a')
  assert(barrel && barrel.position[0] > barrelStart.position[0] + 0.04, 'ball controller must push a dynamic playground prop')

  resetXrNativeControllerDemoRuntime(chunked)
  chunked.phase = 'running'
  stepXrNativeControllerDemoRuntimeTicks(chunked, 2)
  setXrNativeControllerDemoRuntimeInput(chunked, createXrNativeControllerInput({ primary: true, source: 'keyboard' }))
  stepXrNativeControllerDemoRuntimeTicks(chunked, 1)
  const jumped = readXrNativeControllerDemoRuntimeFrame(chunked)
  assert(jumped.player.velocity[1] > 6 && !jumped.player.grounded, 'ball primary action must jump only from supported contact')
  setXrNativeControllerDemoRuntimeInput(chunked, createXrNativeControllerInput({ moveX: 1, source: 'keyboard' }))
  stepXrNativeControllerDemoRuntimeTicks(chunked, 24)
  assert(readXrNativeControllerDemoRuntimeFrame(chunked).player.position[0] > 0.02, 'ball must retain bounded air steering')
}

export function testXrNativeRocketControllerThrustsTiltsAndStabilizes() {
  const runtime = runningRuntime('rocket')
  setXrNativeControllerDemoRuntimeInput(runtime, createXrNativeControllerInput({
    moveX: 1,
    moveZ: -1,
    primary: true,
    source: 'gamepad',
  }))
  stepXrNativeControllerDemoRuntimeTicks(runtime, 120)
  const thrust = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(thrust.player.position[1] > 1 && thrust.player.position[0] > 0, 'rocket must combine vertical thrust with directional boosters')
  assert(thrust.rocketThrusting && thrust.rocketRotation[0] < -0.1 && thrust.rocketRotation[2] < -0.1, 'rocket must expose thrust and bounded directional tilt')
  assert(Math.abs(thrust.rocketRotation[0]) <= Math.PI * 0.25 && Math.abs(thrust.rocketRotation[2]) <= Math.PI * 0.25, 'rocket tilt must stay bounded')
  const poseBeforeSwitch = JSON.stringify({ position: thrust.player.position, velocity: thrust.player.velocity })
  runtime.mode = 'ball'
  const switched = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(JSON.stringify({ position: switched.player.position, velocity: switched.player.velocity }) === poseBeforeSwitch, 'controller switching must preserve pose and velocity')
  runtime.mode = 'rocket'
  setXrNativeControllerDemoRuntimeInput(runtime, createXrNativeControllerInput({ modifier: true, source: 'keyboard' }))
  stepXrNativeControllerDemoRuntimeTicks(runtime, 120)
  const stabilized = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(Math.abs(stabilized.rocketRotation[0]) < Math.abs(thrust.rocketRotation[0]) * 0.4, 'modifier must stabilize pitch toward upright')
  assert(Math.abs(stabilized.rocketRotation[2]) < Math.abs(thrust.rocketRotation[2]) * 0.4, 'modifier must stabilize roll toward upright')
  const ceilingRuntime = runningRuntime('rocket')
  setXrNativeControllerDemoRuntimeInput(ceilingRuntime, createXrNativeControllerInput({ primary: true, source: 'keyboard' }))
  stepXrNativeControllerDemoRuntimeTicks(ceilingRuntime, 1_200)
  const ceilingFlight = readXrNativeControllerDemoRuntimeFrame(ceilingRuntime)
  assert(ceilingFlight.player.position[1] <= XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS, 'sustained thrust must retain the island-scale aerial composition')
  assert(ceilingFlight.player.velocity[1] <= 0.001, 'the aerial ceiling must cancel upward escape velocity')

  const boundedRuntime = runningRuntime('rocket')
  setXrNativeControllerDemoRuntimeInput(boundedRuntime, createXrNativeControllerInput({
    moveX: 1,
    moveZ: -1,
    primary: true,
    source: 'keyboard',
  }))
  stepXrNativeControllerDemoRuntimeTicks(boundedRuntime, 1_200)
  const boundedFlight = readXrNativeControllerDemoRuntimeFrame(boundedRuntime)
  assert(boundedFlight.player.position[1] <= XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS, 'sustained thrust must retain the island-scale aerial composition')
  assert(Math.abs(boundedFlight.player.position[0]) <= XR_NATIVE_PLAYGROUND_HALF_EXTENT_X, 'sustained lateral flight must remain inside the island composition')
  assert(Math.abs(boundedFlight.player.position[2] - XR_NATIVE_PLAYGROUND_CENTER_Z) <= XR_NATIVE_PLAYGROUND_HALF_EXTENT_Z, 'sustained forward flight must remain inside the island composition')
  runtime.phase = 'paused'
  setXrNativeControllerDemoRuntimeInput(runtime, createXrNativeControllerInput({ primary: true, source: 'keyboard' }))
  assert(!readXrNativeControllerDemoRuntimeFrame(runtime).rocketThrusting, 'paused rocket input must not animate active thrust')
  resetXrNativeControllerDemoRuntime(runtime)
  const reset = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(reset.stepCount === 0 && reset.player.subjectId === XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID, 'reset must restore the authored native controller simulation')
  assert(JSON.stringify(reset.player.position) === JSON.stringify([0, 0, 6.2]), 'reset must restore the exact authored spawn pose')
}

export function testXrNativePlaygroundObjectiveIsGatedAndResettable() {
  const blocked = runningRuntime('ball')
  setXrPhysicsSimulationBodyPose(blocked.simulation, XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID, XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION)
  stepXrNativeControllerDemoRuntimeTicks(blocked, 1)
  assert(readXrNativeControllerDemoRuntimeFrame(blocked).objective === 'find-key', 'treasure contact before collecting the key must stay gated')

  const runtime = runningRuntime('ball')
  assert(readXrNativeControllerDemoRuntimeFrame(runtime).objective === 'find-key', 'playground must begin by finding the key')
  setXrPhysicsSimulationBodyPose(runtime.simulation, XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID, XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION)
  stepXrNativeControllerDemoRuntimeTicks(runtime, 1)
  const found = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(found.objective === 'unlock-treasure' && found.keyCollected && !found.chestUnlocked, 'key contact must advance only to treasure unlock')
  setXrPhysicsSimulationBodyPose(runtime.simulation, XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID, [
    XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION[0],
    8,
    XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION[2],
  ], [0, 0, 0], { teleport: true })
  stepXrNativeControllerDemoRuntimeTicks(runtime, 1)
  assert(readXrNativeControllerDemoRuntimeFrame(runtime).objective === 'unlock-treasure', 'high-altitude chest flyover must remain vertically gated')
  setXrPhysicsSimulationBodyPose(runtime.simulation, XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID, XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION)
  stepXrNativeControllerDemoRuntimeTicks(runtime, 1)
  const complete = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(complete.objective === 'complete' && complete.chestUnlocked, 'treasure must open only after key collection')
  resetXrNativeControllerDemoRuntime(runtime)
  const reset = readXrNativeControllerDemoRuntimeFrame(runtime)
  assert(reset.objective === 'find-key' && !reset.keyCollected && !reset.chestUnlocked, 'reset must restore the complete objective state')
  assert(reset.bodies.filter(body => body.subjectId.startsWith('native-pin-')).length === 6, 'reset must restore the interactive bowling set')
  assert(reset.bodies.filter(body => body.subjectId.startsWith('native-crate-')).length === 3, 'reset must restore the foreground obstacle cluster')
}

export function testXrNativeCannonReloadTeleportsWithoutSweepingAcrossPlayground() {
  const runtime = runningRuntime('ball')
  stepXrNativeControllerDemoRuntimeTicks(runtime, 1_200)
  stepXrNativeControllerDemoRuntimeTicks(runtime, 718)
  assert(runtime.simulation.stepCount === 1_920, 'repeat-fire regression must reach the second left-cannon launch tick')
  setXrPhysicsSimulationBodyPose(
    runtime.simulation,
    XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID,
    [1.25, 0, 5],
    [0, 0, 0],
    { teleport: true },
  )
  stepXrNativeControllerDemoRuntimeTicks(runtime, 1)
  const cannonball = readXrNativeControllerDemoRuntimeFrame(runtime).bodies
    .find(body => body.subjectId === 'native-cannonball-left')
  assert(cannonball && cannonball.position[2] < -5, 'repeat cannon reload must begin at the muzzle rather than sweep from its prior landing point')
  assert(!cannonball.contacts.includes(XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID), 'repeat cannon reload must not collide along the teleport path')
}

export function testXrNativeControllerDemoUsesCanonicalSurfaceAndMcpRoute() {
  const invocation = buildXrPhysicsInvocation('controller', 'develop-run', { mode: 'rocket' })
  const parsed = parseXrInteractiveInvocation(invocation)
  assert(parsed?.action === 'physics' && parsed.physics.scope === 'controller', 'controller invocation must reuse the canonical XR physics command')
  assert(parsed.physics.operation === 'develop-run' && parsed.physics.controllerMode === 'rocket', 'controller invocation must preserve operation and mode')
  assert(normalizeXrPhysicsControl({ scope: 'controller', operation: 'select', controllerMode: 'ball' })?.controllerMode === 'ball', 'structured MCP controller selection must normalize')
  assert(normalizeXrPhysicsControl({ scope: 'controller', operation: 'select' }) === null, 'controller selection must reject a missing mode')

  const workbench = source('features', 'command-menu', 'XrSimulationWorkbench.tsx')
  const controls = source('features', 'command-menu', 'XrNativeControllerDemoControls.tsx')
  const stage = source('features', 'three', 'XrNativeControllerDemoStage.tsx')
  const graphStage = source('features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const camera = source('features', 'three', 'useXrNativeControllerDemoCamera.ts')
  const cameraFraming = source('features', 'three', 'xrNativeControllerCameraFraming.ts')
  const cameraRuntime = source('features', 'three', 'xrNativeControllerCameraRuntime.ts')
  const threeControls = source('features', 'three', 'Controls.tsx')
  const environment = source('features', 'three', 'XrNativeControllerDemoEnvironment.tsx')
  const aerialSetpieces = source('features', 'three', 'XrNativeControllerDemoAerialSetpieces.tsx')
  const authoredSubjects = source('features', 'three', 'XrNativeControllerAuthoredSubjects.tsx')
  const singaporeTerrain = source('features', 'three', 'XrSingaporeTerrainGeometry.tsx')
  const terrainColliders = source('features', 'three', 'xrNativeControllerDemoTerrain.ts')
  const terrainPerimeter = source('features', 'three', 'xrTerrainPerimeter.ts')
  const vehicleGeometry = source('features', 'three', 'XrProceduralVehicleGeometry.tsx')
  assert(workbench.includes('<XrNativeControllerDemoControls'), 'existing Simulation workbench must own the demo controls')
  for (const marker of ['data-kg-xr-native-controller-demo="1"', 'data-kg-xr-native-controller-action={marker}', 'marker="develop-run"', 'data-kg-xr-native-controller-invocation']) {
    assert(controls.includes(marker), `native controller UI must expose ${marker}`)
  }
  assert(graphStage.includes('<XrNativeControllerDemoStage'), 'canonical graph XR stage must mount the native procedural demo')
  assert(graphStage.includes('setSharedXrNativeControllerDemoTerrain(stage.id)')
    && stage.includes('terrainId: runtime.terrainId')
    && environment.includes('kg_xr_native_terrain_'), 'native controller stage must project the selected canonical terrain instead of a metadata-only change')
  assert(graphStage.includes('environmentVisible={!geospatialComposite}')
    && graphStage.includes('geospatialComposite ? null : <XrNativeControllerDemoSceneAtmosphere')
    && stage.includes("environment: environmentVisible ? 'xr' : 'geo-background'"),
  'Geo+XR must suppress the duplicate R3F environment and leave the native Geo world visible')
  assert(stage.includes('navigator.getGamepads()') && stage.includes('readXrNativeControllerKeyboardInput'), 'stage runtime must unify standard gamepad and keyboard input')
  assert(stage.includes('closest(INTERACTIVE_TARGET_SELECTOR)') && stage.includes('frame.bodyRotations'), 'stage must preserve native button activation and consume deterministic prop presentation state')
  assert(stage.includes('<XrNativeControllerAuthoredSubjects')
    && authoredSubjects.includes('runtime.plan.subjects.map')
    && authoredSubjects.includes('<XrSceneLibrarySubject'), 'native controller ownership must keep authored Helicopter/Airplane/Car subjects visible through the shared subject renderer')
  assert(camera.includes('controls.target.lerp')
    && camera.includes('follow.fovDegrees')
    && camera.includes('resolveXrNativeControllerFollowFraming')
    && camera.includes('resolveFlightSimFollowTarget')
    && cameraFraming.includes('PLAYGROUND_FOV_DEGREES')
    && threeControls.includes('useXrNativeControllerDemoCamera'), 'shared camera owner must provide smooth Physics and Flight following with aspect-aware full-frame optics')
  assert(camera.includes("type FollowOwner = 'flight' | 'physics'")
    && !camera.includes('flight-plan')
    && !camera.includes('planRestorePoseRef')
    && !camera.includes('camera.up.copy')
    && !camera.includes('camera.up.set'), 'shared R3F camera owner must remain Flight-relative while MapLibre owns geospatial framing')
  assert(camera.includes('controls.enableRotate = false') && !camera.includes('frame.player.velocity'), 'world-relative controller input must retain a fixed-yaw hero camera')
  assert(cameraFraming.includes('AERIAL_FOV_DEGREES') && camera.includes('aerialFactor') && camera.includes('XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE'), 'Rocket altitude must widen one fixed-scale camera owner into the aerial island view')
  assert(camera.includes("readXrNativeControllerCamera().mode === 'fixed-follow'")
    && !camera.includes('authoredSubjectSelected')
    && !cameraRuntime.includes('xrMotionReferenceRuntime'), 'camera selection must remain explicit and independent from selected 3D Objects/Assets')
  const landscapeFraming = resolveXrNativeControllerFollowFraming({ stageId: 'singapore', aspect: 16 / 9, aerialFactor: 0 })
  const narrowFraming = resolveXrNativeControllerFollowFraming({ stageId: 'singapore', aspect: 0.77, aerialFactor: 0 })
  assert(narrowFraming.offsetMeters[2] > landscapeFraming.offsetMeters[2]
    && narrowFraming.fovDegrees > landscapeFraming.fovDegrees, 'fixed follow must retain more terrain context in a narrow editor split')
  selectXrNativeControllerCameraMode('free-orbit')
  assert(readXrNativeControllerCamera().mode === 'free-orbit', 'Camera selector must release the shared camera to Free Orbit')
  selectXrNativeControllerCameraMode('invalid-camera' as never)
  assert(readXrNativeControllerCamera().mode === 'free-orbit', 'invalid Camera selection must fail closed')
  selectXrNativeControllerCameraMode('fixed-follow')
  assert(XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE === 'fixed-follow'
    && JSON.stringify(XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.map(option => [option.id, option.label]))
      === JSON.stringify([['fixed-follow', 'Fixed Follow'], ['free-orbit', 'Free Orbit']]), 'Physics and Flight must share one exact Camera catalog')
  for (const landmark of ['kg_xr_playground_skull_grotto', 'kg_xr_playground_treasure', 'kg_xr_playground_key', 'kg_xr_playground_moving_hazards', 'BowlingPin']) {
    assert(environment.includes(landmark), `procedural playground must include ${landmark}`)
  }
  assert(environment.includes('<XrNativeControllerDemoAerialSetpieces'), 'playground environment must mount its clean-room aerial composition')
  for (const landmark of ['kg_xr_singapore_marina_bay_sands', 'kg_xr_singapore_flyer', 'kg_xr_singapore_gardens_by_the_bay', 'kg_xr_singapore_perimeter_water', 'kg_xr_singapore_seawall', 'kg_xr_singapore_boundary_']) {
    assert(singaporeTerrain.includes(landmark), `procedural Singapore terrain must include ${landmark}`)
  }
  assert(singaporeTerrain.includes('resolveXrTerrainPerimeter')
    && terrainColliders.includes('resolveXrTerrainPerimeter')
    && terrainPerimeter.includes('XR_TERRAIN_BOUNDARY_THICKNESS_METERS'), 'Singapore presentation and physics must share one canonical terrain perimeter')
  assert(singaporeTerrain.includes('selectable: false')
    && !singaporeTerrain.includes('XrSceneLibraryAssetGeometry')
    && !singaporeTerrain.includes('showcaseSubjects'), 'fixed Singapore terrain must leave mobile assets to canonical Media CRUD')
  for (const marker of ['kg_xr_procedural_car', 'kg_xr_procedural_airplane', 'kg_xr_procedural_helicopter', 'rotation={[0, 0, Math.PI / 2]}', 'kg_xr_helicopter_mast']) {
    assert(vehicleGeometry.includes(marker), `shared vehicle geometry must expose corrected ${marker}`)
  }
  for (const landmark of ['kg_xr_playground_north_horizon', 'kg_xr_playground_east_shore_ship', 'kg_xr_playground_deterministic_tentacles']) {
    assert(aerialSetpieces.includes(landmark), `procedural aerial playground must include ${landmark}`)
  }

  const corePaths = [
    ['features', 'three', 'xrNativeControllerInput.ts'],
    ['features', 'three', 'xrNativeControllerDemoRuntime.ts'],
    ['features', 'three', 'xrNativeControllerDemoTerrain.ts'],
    ['features', 'three', 'xrTerrainPerimeter.ts'],
    ['features', 'three', 'XrNativeControllerDemoStage.tsx'],
    ['features', 'three', 'XrNativeControllerDemoEnvironment.tsx'],
    ['features', 'three', 'XrNativeControllerDemoAerialSetpieces.tsx'],
    ['features', 'three', 'XrNativeControllerDemoVehicles.tsx'],
    ['features', 'three', 'XrNativeControllerAuthoredSubjects.tsx'],
    ['features', 'three', 'XrSingaporeTerrainGeometry.tsx'],
    ['features', 'three', 'XrProceduralVehicleGeometry.tsx'],
    ['features', 'three', 'XrNativeControllerDemoHud.tsx'],
    ['features', 'three', 'useXrNativeControllerDemoCamera.ts'],
    ['features', 'three', 'xrNativeControllerCameraCatalog.ts'],
    ['features', 'three', 'xrNativeControllerCameraFraming.ts'],
    ['features', 'three', 'xrNativeControllerCameraRuntime.ts'],
    ['features', 'command-menu', 'XrNativeControllerDemoControls.tsx'],
  ] as const
  const forbiddenOwner = ['8', 'th', 'wall'].join('')
  const forbiddenProject = ['studio', 'physics', 'playground', 'example'].join('-')
  for (const pathParts of corePaths) {
    const text = source(...pathParts)
    assert(text.split('\n').length < 600, `${pathParts.at(-1)} must stay below the source budget`)
    assert(!text.toLowerCase().includes(forbiddenOwner) && !text.toLowerCase().includes(forbiddenProject), `${pathParts.at(-1)} must stay clean-room`)
    assert(!/https?:\/\//i.test(text) && !/\.(?:glb|gltf)(?:\b|['"])/i.test(text), `${pathParts.at(-1)} must not locate remote or downloaded model assets`)
  }
  const runtimeSource = source('features', 'three', 'xrNativeControllerDemoRuntime.ts')
  assert(runtimeSource.includes("from './xrSpatialPhysicsAdapter'"), 'controller demo must reuse the native spatial physics owner')
  assert(!/from ['"](?![.@/])/.test(runtimeSource), 'headless controller runtime must not add an external dependency')
}
