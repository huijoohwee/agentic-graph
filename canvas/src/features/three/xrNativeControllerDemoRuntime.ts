import {
  readXrPhysicsWorld,
  type XrPhysicsBodyConfig,
  type XrPhysicsStaticCollider,
  type XrPhysicsVector,
  type XrPhysicsWorldConfig,
} from './xrPhysicsModel'
import {
  applyXrPhysicsSimulationImpulse,
  captureXrPhysicsSimulation,
  createXrPhysicsSimulation,
  readXrPhysicsSimulationBody,
  resetXrPhysicsSimulation,
  setXrPhysicsSimulationBodyPose,
  stepXrPhysicsSimulation,
  type XrPhysicsBodyState,
  type XrPhysicsSimulation,
} from './xrSpatialPhysicsAdapter'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  resolveXrMotionReferenceStage,
  type XrMotionReferenceStageId,
} from './xrSceneLibrary'
import {
  resolveXrNativeControllerTerrainColliders,
  XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS,
  XR_NATIVE_PLAYGROUND_CENTER_Z,
  XR_NATIVE_PLAYGROUND_HALF_EXTENT_X,
  XR_NATIVE_PLAYGROUND_HALF_EXTENT_Z,
} from './xrNativeControllerDemoTerrain'
import {
  createXrNativeControllerInput,
  type XrNativeControllerInput,
} from './xrNativeControllerInput'
export const XR_NATIVE_CONTROLLER_DEMO_SCHEMA = 'agentic-graph-xr-native-controller-demo/v1'
export const XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID = 'native-controller'
export const XR_NATIVE_CONTROLLER_DEMO_MODES = ['ball', 'rocket'] as const
export const XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE = 1.5
export {
  XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS,
  XR_NATIVE_PLAYGROUND_CENTER_Z,
  XR_NATIVE_PLAYGROUND_HALF_EXTENT_X,
  XR_NATIVE_PLAYGROUND_HALF_EXTENT_Z,
} from './xrNativeControllerDemoTerrain'
export const XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION = Object.freeze([-8.4, 0.62, -6.9] as const)
export const XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION = Object.freeze([-3.4, 0, -6.3] as const)

export type XrNativeControllerDemoMode = (typeof XR_NATIVE_CONTROLLER_DEMO_MODES)[number]
export type XrNativeControllerDemoPhase = 'off' | 'ready' | 'running' | 'paused'
export type XrNativeControllerDemoObjective = 'find-key' | 'unlock-treasure' | 'complete'

export type XrNativeControllerDemoSnapshot = Readonly<{
  schema: typeof XR_NATIVE_CONTROLLER_DEMO_SCHEMA
  phase: XrNativeControllerDemoPhase
  mode: XrNativeControllerDemoMode
  followCamera: boolean
  fixedRateHz: number
  objective: XrNativeControllerDemoObjective
  keyCollected: boolean
  chestUnlocked: boolean
  terrainId: XrMotionReferenceStageId
  revision: number
}>

export type XrNativeControllerDemoFrame = Readonly<{
  schema: typeof XR_NATIVE_CONTROLLER_DEMO_SCHEMA
  phase: XrNativeControllerDemoPhase
  mode: XrNativeControllerDemoMode
  elapsedSeconds: number
  stepCount: number
  player: XrPhysicsBodyState
  bodies: readonly XrPhysicsBodyState[]
  bodyRotations: Readonly<Record<string, XrPhysicsVector>>
  input: XrNativeControllerInput
  ballRotation: XrPhysicsVector
  rocketRotation: XrPhysicsVector
  rocketThrusting: boolean
  cameraTarget: XrPhysicsVector
  objective: XrNativeControllerDemoObjective
  keyCollected: boolean
  chestUnlocked: boolean
  terrainId: XrMotionReferenceStageId
}>

export type XrNativeControllerDemoRuntime = {
  accumulatorSeconds: number
  ballRotation: [number, number, number]
  bodyRotations: Record<string, [number, number, number]>
  input: XrNativeControllerInput
  mode: XrNativeControllerDemoMode
  objective: XrNativeControllerDemoObjective
  phase: XrNativeControllerDemoPhase
  previousPlayerPosition: [number, number, number]
  previousPrimary: boolean
  rocketRotation: [number, number, number]
  simulation: XrPhysicsSimulation
  snapshotRevision: number
  terrainId: XrMotionReferenceStageId
  colliders: readonly XrPhysicsStaticCollider[]
  readonly playerConfig: XrPhysicsBodyConfig
  readonly world: XrPhysicsWorldConfig
}

type Listener = () => void
const listeners = new Set<Listener>()
const FIXED_RATE_HZ = 120
const BALL_RADIUS = 0.5
const BALL_GROUND_ACCELERATION = 19
const BALL_AIR_CONTROL = 0.34
const BALL_JUMP_VELOCITY = 7.2
const BALL_MAX_SPEED = 8.5
const ROCKET_LATERAL_ACCELERATION = 10.5
const ROCKET_VERTICAL_ACCELERATION = 18
const ROCKET_MAX_TILT_RADIANS = Math.PI * 0.24
const ROCKET_TILT_RESPONSE = 8
const ROCKET_STABILIZE_RESPONSE = 14
const CANNON_STEP_INTERVAL = FIXED_RATE_HZ * 8
const PRESENTATION_BODY_IDS = Object.freeze([
  'native-crate-a', 'native-crate-b', 'native-crate-c',
  ...Array.from({ length: 6 }, (_, index) => `native-pin-${index + 1}`),
])

function createBodyRotations(): Record<string, [number, number, number]> {
  return Object.fromEntries(PRESENTATION_BODY_IDS.map(id => [id, [0, 0, 0]]))
}

const pinBodies = Object.fromEntries([
  [-0.9, -0.75], [0, -0.75], [0.9, -0.75],
  [-0.45, 0.15], [0.45, 0.15], [0, 1.05],
].map(([x, z], index) => [`native-pin-${index + 1}`, {
  mode: 'dynamic' as const,
  sizeMeters: [0.46, 1.18, 0.46] as XrPhysicsVector,
  spawnPosition: [8.1 + x, 0, -1.8 + z] as XrPhysicsVector,
  mass: 0.48,
  friction: 0.54,
  restitution: 0.28,
  linearDamping: 0.46,
}]))

function demoWorld(): XrPhysicsWorldConfig {
  return readXrPhysicsWorld({
    gravity: [0, -9.81, 0],
    fixedStepSeconds: 1 / FIXED_RATE_HZ,
    maxSubSteps: 12,
    floor: { enabled: true, height: 0, friction: 0.78, restitution: 0.08 },
    bodies: {
      [XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID]: {
        mode: 'dynamic',
        sizeMeters: [1.2, 1.2, 1.2],
        spawnPosition: [0, 0, 6.2],
        mass: 1.4,
        friction: 0.72,
        restitution: 0.2,
        linearDamping: 0.4,
      },
      'native-crate-a': {
        mode: 'dynamic',
        sizeMeters: [1.55, 1.45, 1.55],
        spawnPosition: [4.4, 0, 6.8],
        mass: 0.62,
        friction: 0.46,
        restitution: 0.24,
        linearDamping: 0.24,
      },
      'native-crate-b': {
        mode: 'dynamic',
        sizeMeters: [1.55, 1.45, 1.55],
        spawnPosition: [6.2, 0, 7],
        mass: 0.68,
        friction: 0.58,
        restitution: 0.36,
        linearDamping: 0.3,
      },
      'native-crate-c': {
        mode: 'dynamic',
        sizeMeters: [1.95, 1.85, 1.95],
        spawnPosition: [4.2, 0, 9.3],
        mass: 0.84,
        friction: 0.58,
        restitution: 0.3,
        linearDamping: 0.34,
      },
      'native-cannonball-left': {
        mode: 'dynamic',
        sizeMeters: [0.52, 0.52, 0.52],
        spawnPosition: [1.6, 0.45, -5.4],
        mass: 0.72,
        friction: 0.42,
        restitution: 0.52,
        linearDamping: 0.08,
      },
      'native-cannonball-right': {
        mode: 'dynamic',
        sizeMeters: [0.52, 0.52, 0.52],
        spawnPosition: [4.15, 0.45, -5.4],
        mass: 0.72,
        friction: 0.42,
        restitution: 0.52,
        linearDamping: 0.08,
      },
      ...pinBodies,
    },
  })
}

function terrainColliders(stageId: XrMotionReferenceStageId): readonly XrPhysicsStaticCollider[] {
  return resolveXrNativeControllerTerrainColliders(stageId)
}

function mutablePosition(body: XrPhysicsBodyState): [number, number, number] {
  return [body.position[0], body.position[1], body.position[2]]
}

function playerBody(runtime: XrNativeControllerDemoRuntime): XrPhysicsBodyState {
  return readXrPhysicsSimulationBody(runtime.simulation, XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID)!
}

function impulseForAcceleration(
  runtime: XrNativeControllerDemoRuntime,
  acceleration: XrPhysicsVector,
  stepSeconds: number,
): void {
  const mass = runtime.playerConfig.mass
  applyXrPhysicsSimulationImpulse(runtime.simulation, runtime.playerConfig, [
    acceleration[0] * mass * stepSeconds,
    acceleration[1] * mass * stepSeconds,
    acceleration[2] * mass * stepSeconds,
  ])
}

function driveBall(runtime: XrNativeControllerDemoRuntime, stepSeconds: number): void {
  const body = playerBody(runtime)
  const grounded = body.grounded || body.position[1] <= 0.001
  const control = grounded ? 1 : BALL_AIR_CONTROL
  const modifierScale = runtime.input.modifier ? 1.28 : 1
  const horizontalSpeed = Math.hypot(body.velocity[0], body.velocity[2])
  const desired = Math.hypot(runtime.input.moveX, runtime.input.moveZ) > 0
  const accelerationScale = desired && horizontalSpeed < BALL_MAX_SPEED
    ? BALL_GROUND_ACCELERATION * control * modifierScale
    : 0
  impulseForAcceleration(runtime, [
    runtime.input.moveX * accelerationScale,
    0,
    runtime.input.moveZ * accelerationScale,
  ], stepSeconds)
  if (runtime.input.primary && !runtime.previousPrimary && grounded) {
    applyXrPhysicsSimulationImpulse(runtime.simulation, runtime.playerConfig, [
      0,
      BALL_JUMP_VELOCITY * runtime.playerConfig.mass,
      0,
    ])
  }
}

function approach(current: number, target: number, response: number, stepSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-response * stepSeconds))
}

function driveRocket(runtime: XrNativeControllerDemoRuntime, stepSeconds: number): void {
  const stabilize = runtime.input.modifier
  const targetPitch = stabilize ? 0 : runtime.input.moveZ * ROCKET_MAX_TILT_RADIANS
  const targetRoll = stabilize ? 0 : -runtime.input.moveX * ROCKET_MAX_TILT_RADIANS
  const response = stabilize ? ROCKET_STABILIZE_RESPONSE : ROCKET_TILT_RESPONSE
  runtime.rocketRotation[0] = approach(runtime.rocketRotation[0], targetPitch, response, stepSeconds)
  runtime.rocketRotation[2] = approach(runtime.rocketRotation[2], targetRoll, response, stepSeconds)
  const upward = runtime.input.primary ? ROCKET_VERTICAL_ACCELERATION : 0
  impulseForAcceleration(runtime, [
    runtime.input.moveX * ROCKET_LATERAL_ACCELERATION + Math.sin(-runtime.rocketRotation[2]) * upward * 0.38,
    upward,
    runtime.input.moveZ * ROCKET_LATERAL_ACCELERATION + Math.sin(runtime.rocketRotation[0]) * upward * 0.38,
  ], stepSeconds)
  if (stabilize) {
    const body = playerBody(runtime)
    impulseForAcceleration(runtime, [
      -body.velocity[0] * 1.6,
      runtime.input.primary ? 0 : -body.velocity[1] * 0.35,
      -body.velocity[2] * 1.6,
    ], stepSeconds)
  }
}

function updateBallRotation(runtime: XrNativeControllerDemoRuntime): void {
  const current = playerBody(runtime).position
  const dx = current[0] - runtime.previousPlayerPosition[0]
  const dz = current[2] - runtime.previousPlayerPosition[2]
  runtime.ballRotation[0] += dz / BALL_RADIUS
  runtime.ballRotation[2] -= dx / BALL_RADIUS
  if (runtime.mode === 'ball' && runtime.input.modifier) {
    runtime.ballRotation[1] += Math.hypot(runtime.input.moveX, runtime.input.moveZ) * 0.035
  }
  runtime.previousPlayerPosition = [current[0], current[1], current[2]]
}

function constrainRocketAltitude(runtime: XrNativeControllerDemoRuntime): void {
  if (runtime.mode !== 'rocket') return
  const body = playerBody(runtime)
  if (body.position[1] <= XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS) return
  setXrPhysicsSimulationBodyPose(
    runtime.simulation,
    XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID,
    [body.position[0], XR_NATIVE_CONTROLLER_DEMO_MAX_ALTITUDE_METERS, body.position[2]],
    [body.velocity[0], Math.min(0, body.velocity[1]), body.velocity[2]],
    { teleport: true },
  )
}

function updateBodyRotations(runtime: XrNativeControllerDemoRuntime, stepSeconds: number): void {
  for (const [subjectId, rotation] of Object.entries(runtime.bodyRotations)) {
    const body = readXrPhysicsSimulationBody(runtime.simulation, subjectId)
    if (!body) continue
    const horizontalSpeed = Math.hypot(body.velocity[0], body.velocity[2])
    if (subjectId.startsWith('native-pin-') && horizontalSpeed > 0.22) {
      const tilt = Math.min(1.28, Math.max(Math.abs(rotation[0]), Math.abs(rotation[2])) + horizontalSpeed * stepSeconds * 0.18)
      rotation[0] = body.velocity[2] < 0 ? -tilt : tilt
      rotation[2] = body.velocity[0] > 0 ? -tilt : tilt
    } else if (subjectId.startsWith('native-crate-')) {
      rotation[0] += body.velocity[2] * stepSeconds * 0.7
      rotation[2] -= body.velocity[0] * stepSeconds * 0.7
    }
  }
}

function fireCannon(runtime: XrNativeControllerDemoRuntime, side: 'left' | 'right'): void {
  const left = side === 'left'
  setXrPhysicsSimulationBodyPose(
    runtime.simulation,
    left ? 'native-cannonball-left' : 'native-cannonball-right',
    left ? [1.6, 1.05, -5.25] : [4.15, 1.05, -5.25],
    left ? [-0.35, 5.8, 9.2] : [0.35, 5.35, 8.6],
    { teleport: true },
  )
}

function updateCannons(runtime: XrNativeControllerDemoRuntime): void {
  const tick = runtime.simulation.stepCount
  if (tick >= CANNON_STEP_INTERVAL && tick % CANNON_STEP_INTERVAL === 0) fireCannon(runtime, 'left')
  if (tick >= CANNON_STEP_INTERVAL * 1.5
    && (tick + CANNON_STEP_INTERVAL / 2) % CANNON_STEP_INTERVAL === 0) fireCannon(runtime, 'right')
}

function horizontalDistance(position: XrPhysicsVector, target: readonly [number, number, number]): number {
  return Math.hypot(position[0] - target[0], position[2] - target[2])
}

function updateObjective(runtime: XrNativeControllerDemoRuntime): void {
  const position = playerBody(runtime).position
  if (runtime.objective === 'find-key'
    && horizontalDistance(position, XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION) < 1.25
    && Math.abs(position[1] - XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION[1]) < 2.4) {
    runtime.objective = 'unlock-treasure'
  }
  if (runtime.objective === 'unlock-treasure'
    && horizontalDistance(position, XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION) < 2.15
    && Math.abs(position[1] - XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION[1]) < 2.4) {
    runtime.objective = 'complete'
  }
}

function stepFixed(runtime: XrNativeControllerDemoRuntime): void {
  const stepSeconds = runtime.world.fixedStepSeconds
  if (runtime.mode === 'ball') driveBall(runtime, stepSeconds)
  else driveRocket(runtime, stepSeconds)
  runtime.previousPrimary = runtime.input.primary
  updateCannons(runtime)
  stepXrPhysicsSimulation({
    simulation: runtime.simulation,
    world: runtime.world,
    staticColliders: runtime.colliders,
    stepSeconds,
  })
  constrainRocketAltitude(runtime)
  updateBallRotation(runtime)
  updateBodyRotations(runtime, stepSeconds)
  updateObjective(runtime)
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function createXrNativeControllerDemoRuntime(): XrNativeControllerDemoRuntime {
  const world = demoWorld()
  const colliders = terrainColliders(XR_MOTION_REFERENCE_DEFAULT_STAGE_ID)
  const simulation = createXrPhysicsSimulation(world, colliders)
  const playerConfig = world.bodies.find(body => body.subjectId === XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID)!
  const position = readXrPhysicsSimulationBody(simulation, XR_NATIVE_CONTROLLER_DEMO_PLAYER_ID)!.position
  return {
    accumulatorSeconds: 0,
    ballRotation: [0, 0, 0],
    bodyRotations: createBodyRotations(),
    colliders,
    input: createXrNativeControllerInput(),
    mode: 'ball',
    objective: 'find-key',
    phase: 'off',
    playerConfig,
    previousPlayerPosition: [position[0], position[1], position[2]],
    previousPrimary: false,
    rocketRotation: [0, 0, 0],
    simulation,
    snapshotRevision: 0,
    terrainId: XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
    world,
  }
}

export function resetXrNativeControllerDemoRuntime(runtime: XrNativeControllerDemoRuntime): void {
  resetXrPhysicsSimulation(runtime.simulation, runtime.world, runtime.colliders)
  runtime.accumulatorSeconds = 0
  runtime.ballRotation = [0, 0, 0]
  for (const rotation of Object.values(runtime.bodyRotations)) rotation.splice(0, 3, 0, 0, 0)
  runtime.input = createXrNativeControllerInput()
  runtime.objective = 'find-key'
  runtime.previousPlayerPosition = mutablePosition(playerBody(runtime))
  runtime.previousPrimary = false
  runtime.rocketRotation = [0, 0, 0]
}

export function setXrNativeControllerDemoRuntimeInput(
  runtime: XrNativeControllerDemoRuntime,
  input: XrNativeControllerInput,
): void {
  runtime.input = createXrNativeControllerInput(input)
}

export function stepXrNativeControllerDemoRuntime(
  runtime: XrNativeControllerDemoRuntime,
  deltaSecondsValue: number,
): number {
  if (runtime.phase !== 'running') return 0
  const deltaSeconds = Number.isFinite(deltaSecondsValue) ? Math.max(0, Math.min(0.25, deltaSecondsValue)) : 0
  runtime.accumulatorSeconds += deltaSeconds
  const stepSeconds = runtime.world.fixedStepSeconds
  const tolerance = stepSeconds * 1e-9
  let steps = 0
  while (runtime.accumulatorSeconds + tolerance >= stepSeconds && steps < runtime.world.maxSubSteps) {
    stepFixed(runtime)
    runtime.accumulatorSeconds = Math.max(0, runtime.accumulatorSeconds - stepSeconds)
    steps += 1
  }
  return steps
}

export function stepXrNativeControllerDemoRuntimeTicks(
  runtime: XrNativeControllerDemoRuntime,
  ticksValue: number,
): number {
  const ticks = Number(ticksValue)
  if (runtime.phase === 'off' || !Number.isInteger(ticks) || ticks < 1 || ticks > 1200) return 0
  for (let index = 0; index < ticks; index += 1) stepFixed(runtime)
  return ticks
}

export function readXrNativeControllerDemoRuntimeFrame(
  runtime: XrNativeControllerDemoRuntime,
): XrNativeControllerDemoFrame {
  const player = playerBody(runtime)
  return Object.freeze({
    schema: XR_NATIVE_CONTROLLER_DEMO_SCHEMA,
    phase: runtime.phase,
    mode: runtime.mode,
    elapsedSeconds: runtime.simulation.elapsedSeconds,
    stepCount: runtime.simulation.stepCount,
    player,
    bodies: captureXrPhysicsSimulation(runtime.simulation),
    bodyRotations: Object.freeze(Object.fromEntries(Object.entries(runtime.bodyRotations).map(([id, rotation]) => [
      id,
      Object.freeze([...rotation]) as XrPhysicsVector,
    ]))),
    input: runtime.input,
    ballRotation: Object.freeze([...runtime.ballRotation]) as XrPhysicsVector,
    rocketRotation: Object.freeze([...runtime.rocketRotation]) as XrPhysicsVector,
    rocketThrusting: runtime.phase === 'running' && runtime.mode === 'rocket' && runtime.input.primary,
    cameraTarget: Object.freeze([
      player.position[0],
      player.position[1] + (runtime.mode === 'rocket' ? 1.05 : 0.6),
      player.position[2],
    ]) as XrPhysicsVector,
    objective: runtime.objective,
    keyCollected: runtime.objective !== 'find-key',
    chestUnlocked: runtime.objective === 'complete',
    terrainId: runtime.terrainId,
  })
}

const sharedRuntime = createXrNativeControllerDemoRuntime()

function createSharedSnapshot(): XrNativeControllerDemoSnapshot {
  return Object.freeze({
    schema: XR_NATIVE_CONTROLLER_DEMO_SCHEMA,
    phase: sharedRuntime.phase,
    mode: sharedRuntime.mode,
    followCamera: sharedRuntime.phase !== 'off',
    fixedRateHz: FIXED_RATE_HZ,
    objective: sharedRuntime.objective,
    keyCollected: sharedRuntime.objective !== 'find-key',
    chestUnlocked: sharedRuntime.objective === 'complete',
    terrainId: sharedRuntime.terrainId,
    revision: sharedRuntime.snapshotRevision,
  })
}

let sharedSnapshot = createSharedSnapshot()

function publishShared(): XrNativeControllerDemoSnapshot {
  sharedRuntime.snapshotRevision += 1
  sharedSnapshot = createSharedSnapshot()
  notify()
  return sharedSnapshot
}

export function readXrNativeControllerDemo(): XrNativeControllerDemoSnapshot {
  return sharedSnapshot
}

export function subscribeXrNativeControllerDemo(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setSharedXrNativeControllerDemoTerrain(
  stageId: XrMotionReferenceStageId,
): XrNativeControllerDemoSnapshot {
  const stage = resolveXrMotionReferenceStage(stageId)
  if (sharedRuntime.terrainId === stage.id) return sharedSnapshot
  sharedRuntime.terrainId = stage.id
  sharedRuntime.colliders = terrainColliders(stage.id)
  resetXrNativeControllerDemoRuntime(sharedRuntime)
  return publishShared()
}

export function developAndRunXrNativeControllerDemo(): XrNativeControllerDemoSnapshot {
  resetXrNativeControllerDemoRuntime(sharedRuntime)
  sharedRuntime.phase = 'running'
  return publishShared()
}

export function pauseXrNativeControllerDemo(): XrNativeControllerDemoSnapshot {
  if (sharedRuntime.phase === 'running') sharedRuntime.phase = 'paused'
  return publishShared()
}

export function resumeXrNativeControllerDemo(): XrNativeControllerDemoSnapshot {
  if (sharedRuntime.phase === 'paused' || sharedRuntime.phase === 'ready') sharedRuntime.phase = 'running'
  return publishShared()
}

export function resetSharedXrNativeControllerDemo(): XrNativeControllerDemoSnapshot {
  const phase = sharedRuntime.phase === 'off' ? 'ready' : sharedRuntime.phase
  resetXrNativeControllerDemoRuntime(sharedRuntime)
  sharedRuntime.mode = 'ball'
  sharedRuntime.phase = phase === 'paused' ? 'paused' : phase === 'running' ? 'running' : 'ready'
  return publishShared()
}

export function exitXrNativeControllerDemo(): XrNativeControllerDemoSnapshot {
  resetXrNativeControllerDemoRuntime(sharedRuntime)
  sharedRuntime.phase = 'off'
  return publishShared()
}

export function selectXrNativeControllerDemoMode(mode: XrNativeControllerDemoMode): XrNativeControllerDemoSnapshot {
  if (!XR_NATIVE_CONTROLLER_DEMO_MODES.includes(mode)) return readXrNativeControllerDemo()
  sharedRuntime.mode = mode
  return publishShared()
}

export function setSharedXrNativeControllerDemoInput(input: XrNativeControllerInput): void {
  setXrNativeControllerDemoRuntimeInput(sharedRuntime, input)
}

export function stepSharedXrNativeControllerDemo(deltaSeconds: number): number {
  const objective = sharedRuntime.objective
  const steps = stepXrNativeControllerDemoRuntime(sharedRuntime, deltaSeconds)
  if (objective !== sharedRuntime.objective) publishShared()
  return steps
}

export function readSharedXrNativeControllerDemoFrame(): XrNativeControllerDemoFrame {
  return readXrNativeControllerDemoRuntimeFrame(sharedRuntime)
}

export const readSharedXrNativeControllerDemoColliders = (): readonly XrPhysicsStaticCollider[] => sharedRuntime.colliders
