import {
  finiteSpatialInputNumber,
  projectAppleSpatialInput,
  resetAppleSpatialInputState,
  type AppleSpatialInputState,
} from './filter.js'
import {
  APPLE_SPATIAL_INPUT_SCHEMA,
  DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
  appleSpatialInputProfilesEqual,
  createAppleSpatialInputProfile,
  type AppleSpatialInputProfile,
  type AppleSpatialInputProfileInput,
} from './profile.js'

export const APPLE_SENSOR_CONTROLLER_SCHEMA = 'agenticgraph.apple-sensor-controller/v1' as const

export type AppleSensorPhase =
  | 'off'
  | 'requesting-permission'
  | 'running'
  | 'denied'
  | 'unavailable'
  | 'error'
export type AppleSensorPermission = 'unknown' | 'prompting' | 'granted' | 'denied' | 'unavailable'

export interface AppleSensorVector {
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

export interface AppleMotionSample {
  readonly acceleration: AppleSensorVector | null
  readonly accelerationIncludingGravity: AppleSensorVector | null
  readonly rotationRate: Readonly<{
    alpha: number | null
    beta: number | null
    gamma: number | null
  }> | null
  readonly intervalMilliseconds: number | null
}

export interface AppleOrientationSample {
  readonly alpha: number | null
  readonly beta: number | null
  readonly gamma: number | null
  readonly absolute: boolean
  readonly timestampMilliseconds: number
}

export interface AppleSensorSnapshot {
  readonly schema: typeof APPLE_SENSOR_CONTROLLER_SCHEMA
  readonly spatialInputSchema: typeof APPLE_SPATIAL_INPUT_SCHEMA
  readonly spatialInputProfile: AppleSpatialInputProfile
  readonly phase: AppleSensorPhase
  readonly permission: AppleSensorPermission
  readonly motionEnabled: boolean
  readonly orientationEnabled: boolean
  readonly motion: AppleMotionSample | null
  readonly orientation: AppleOrientationSample | null
  readonly calibrated: boolean
  readonly pitch: number
  readonly roll: number
  readonly screenAngleDegrees: number
  readonly sampleCount: number
  readonly message: string
  readonly revision: number
}

export interface AppleSensorEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void
}

export interface AppleSensorDocumentTarget extends AppleSensorEventTarget {
  readonly visibilityState: string
}

export interface AppleScreenOrientationTarget extends AppleSensorEventTarget {
  readonly angle: number
}

export interface AppleSensorPermissionEventConstructor {
  requestPermission?: () => Promise<string>
}

export interface AppleSensorEnvironment {
  readonly window?: AppleSensorEventTarget | null
  readonly document?: AppleSensorDocumentTarget | null
  readonly screenOrientation?: AppleScreenOrientationTarget | null
  readonly motionEventConstructor?: AppleSensorPermissionEventConstructor | null
  readonly orientationEventConstructor?: AppleSensorPermissionEventConstructor | null
  readonly setTimeout?: (handler: () => void, milliseconds: number) => unknown
  readonly clearTimeout?: (handle: unknown) => void
}

export interface BrowserAppleSensorControllerOptions {
  readonly profile?: AppleSpatialInputProfileInput
  readonly enableMotion?: boolean
  readonly enableOrientation?: boolean
  readonly environment?: AppleSensorEnvironment
  readonly onSubscriberError?: (error: unknown) => void
}

type PermissionResult = 'granted' | 'denied'
type SensorVectorLike = Readonly<{
  x?: number | null
  y?: number | null
  z?: number | null
}>
type MotionEventLike = Event & Readonly<{
  acceleration?: SensorVectorLike | null
  accelerationIncludingGravity?: SensorVectorLike | null
  rotationRate?: Readonly<{
    alpha?: number | null
    beta?: number | null
    gamma?: number | null
  }> | null
  interval?: number | null
}>
type OrientationEventLike = Event & Readonly<{
  alpha?: number | null
  beta?: number | null
  gamma?: number | null
  absolute?: boolean
}>

const DEFAULT_MESSAGE = 'Device sensors stay off until enabled by an explicit user gesture.'

function initialSnapshot(profile: AppleSpatialInputProfile): AppleSensorSnapshot {
  return Object.freeze({
    schema: APPLE_SENSOR_CONTROLLER_SCHEMA,
    spatialInputSchema: APPLE_SPATIAL_INPUT_SCHEMA,
    spatialInputProfile: profile,
    phase: 'off',
    permission: 'unknown',
    motionEnabled: false,
    orientationEnabled: false,
    motion: null,
    orientation: null,
    calibrated: false,
    pitch: 0,
    roll: 0,
    screenAngleDegrees: 0,
    sampleCount: 0,
    message: DEFAULT_MESSAGE,
    revision: 0,
  })
}

function sensorVector(value: SensorVectorLike | null | undefined): AppleSensorVector | null {
  if (!value) return null
  return Object.freeze({
    x: finiteSpatialInputNumber(value.x),
    y: finiteSpatialInputNumber(value.y),
    z: finiteSpatialInputNumber(value.z),
  })
}

export class BrowserAppleSensorController {
  private readonly subscribers = new Set<() => void>()
  private readonly environment: AppleSensorEnvironment
  private readonly wantsMotion: boolean
  private readonly wantsOrientation: boolean
  private readonly reportSubscriberError: (error: unknown) => void
  private snapshot: AppleSensorSnapshot
  private spatialInputProfile: AppleSpatialInputProfile
  private spatialInputState: AppleSpatialInputState = resetAppleSpatialInputState()
  private controlIntent = 0
  private motionSupported = false
  private orientationSupported = false
  private sensorWindowTarget: AppleSensorEventTarget | null = null
  private lifecycleWindowTarget: AppleSensorEventTarget | null = null
  private lifecycleDocumentTarget: AppleSensorDocumentTarget | null = null
  private screenOrientationTarget: AppleScreenOrientationTarget | null = null
  private calibrationTimer: unknown | null = null
  private disposed = false

  private readonly handleDeviceMotion = (event: Event): void => {
    if (this.snapshot.phase !== 'running') return
    const sample = event as MotionEventLike
    this.publish({
      motion: Object.freeze({
        acceleration: sensorVector(sample.acceleration),
        accelerationIncludingGravity: sensorVector(sample.accelerationIncludingGravity),
        rotationRate: sample.rotationRate
          ? Object.freeze({
            alpha: finiteSpatialInputNumber(sample.rotationRate.alpha),
            beta: finiteSpatialInputNumber(sample.rotationRate.beta),
            gamma: finiteSpatialInputNumber(sample.rotationRate.gamma),
          })
          : null,
        intervalMilliseconds: finiteSpatialInputNumber(sample.interval),
      }),
      sampleCount: this.snapshot.sampleCount + 1,
    })
  }

  private readonly handleDeviceOrientation = (event: Event): void => {
    if (this.snapshot.phase !== 'running') return
    const sample = event as OrientationEventLike
    const timestampMilliseconds = finiteSpatialInputNumber(sample.timeStamp)
    // A fabricated clock value must never establish or advance calibration.
    if (timestampMilliseconds === null) return
    const betaDegrees = finiteSpatialInputNumber(sample.beta)
    const gammaDegrees = finiteSpatialInputNumber(sample.gamma)
    const screenAngleDegrees = this.readScreenAngleDegrees()
    const projection = betaDegrees === null || gammaDegrees === null
      ? null
      : projectAppleSpatialInput(this.spatialInputState, {
        betaDegrees,
        gammaDegrees,
        screenAngleDegrees,
        timestampMilliseconds,
      }, this.spatialInputProfile)
    if (projection) this.spatialInputState = projection.state
    if (projection?.calibratedNow) this.clearCalibrationTimer()
    this.publish({
      orientation: Object.freeze({
        alpha: finiteSpatialInputNumber(sample.alpha),
        beta: betaDegrees,
        gamma: gammaDegrees,
        absolute: Boolean(sample.absolute),
        timestampMilliseconds,
      }),
      calibrated: Boolean(this.spatialInputState.baseline),
      pitch: this.spatialInputState.pitch,
      roll: this.spatialInputState.roll,
      screenAngleDegrees,
      sampleCount: this.snapshot.sampleCount + 1,
      message: projection?.calibratedNow
        ? 'Device orientation is calibrated and controlling locally.'
        : this.snapshot.message,
    })
  }

  private readonly handleScreenOrientationChange = (): void => {
    this.recenter('Screen orientation changed; the next sample sets a fresh neutral pose.')
  }

  private readonly stopForPageLifecycle = (event: Event): void => {
    if (event.type === 'visibilitychange'
      && this.readDocumentTarget()?.visibilityState !== 'hidden') return
    this.disable('Device sensors stopped because the page is no longer active.')
  }

  constructor(options: BrowserAppleSensorControllerOptions = {}) {
    this.environment = options.environment ?? {}
    this.wantsMotion = options.enableMotion ?? true
    this.wantsOrientation = options.enableOrientation ?? true
    if (!this.wantsMotion && !this.wantsOrientation) {
      throw new RangeError('At least one Apple sensor stream must be enabled.')
    }
    this.reportSubscriberError = options.onSubscriberError
      ?? (error => console.error('[agenticgraph] Apple sensor subscriber failed', error))
    this.spatialInputProfile = options.profile
      ? createAppleSpatialInputProfile(options.profile)
      : DEFAULT_APPLE_SPATIAL_INPUT_PROFILE
    this.snapshot = initialSnapshot(this.spatialInputProfile)
  }

  readSnapshot(): AppleSensorSnapshot {
    return this.snapshot
  }

  subscribe(subscriber: () => void): () => void {
    this.assertActive()
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  configureProfile(profile: AppleSpatialInputProfileInput): AppleSensorSnapshot {
    this.assertActive()
    const nextProfile = createAppleSpatialInputProfile(profile)
    if (appleSpatialInputProfilesEqual(nextProfile, this.spatialInputProfile)) return this.snapshot
    this.spatialInputProfile = nextProfile
    this.publish({
      spatialInputProfile: nextProfile,
      ...this.resetMeasurements(),
      message: this.snapshot.phase === 'running'
        ? 'Motion profile changed; the next orientation sample sets a fresh neutral pose.'
        : this.snapshot.message,
    })
    this.scheduleCalibrationTimeout()
    return this.snapshot
  }

  recenter(
    message = 'Hold the device comfortably; the next orientation sample sets neutral.',
  ): AppleSensorSnapshot {
    this.assertActive()
    if (this.snapshot.phase !== 'running') return this.snapshot
    this.publish({ ...this.resetMeasurements(), message })
    this.scheduleCalibrationTimeout()
    return this.snapshot
  }

  enable(): Promise<AppleSensorSnapshot> {
    this.assertActive()
    const intent = ++this.controlIntent
    this.removeAllListeners()
    this.clearCalibrationTimer()
    this.spatialInputState = resetAppleSpatialInputState()
    const windowTarget = this.readWindowTarget()
    const documentTarget = this.readDocumentTarget()
    if (!windowTarget || !documentTarget) {
      this.publishUnavailable('Device sensors are unavailable outside a browser.')
      return Promise.resolve(this.snapshot)
    }
    if (documentTarget.visibilityState === 'hidden') {
      this.publishOff('Device sensors cannot start while the page is hidden.')
      return Promise.resolve(this.snapshot)
    }

    const motionConstructor = this.readPermissionConstructor('motion')
    const orientationConstructor = this.readPermissionConstructor('orientation')
    this.motionSupported = this.wantsMotion && Boolean(motionConstructor)
    this.orientationSupported = this.wantsOrientation && Boolean(orientationConstructor)
    if (!this.motionSupported && !this.orientationSupported) {
      this.publishUnavailable('This browser does not expose the requested device sensors.')
      return Promise.resolve(this.snapshot)
    }

    this.publish({
      phase: 'requesting-permission',
      permission: 'prompting',
      motionEnabled: false,
      orientationEnabled: false,
      motion: null,
      orientation: null,
      ...this.resetMeasurements(),
      sampleCount: 0,
      message: 'Waiting for device sensor permission.',
    })
    this.installLifecycleListeners(windowTarget, documentTarget)

    // Both Safari permission calls happen before this method returns, keeping
    // them inside the explicit user-gesture call stack.
    const permissionRequests: Promise<PermissionResult>[] = []
    if (this.motionSupported && motionConstructor) {
      permissionRequests.push(this.requestPermission(motionConstructor))
    }
    if (this.orientationSupported && orientationConstructor) {
      permissionRequests.push(this.requestPermission(orientationConstructor))
    }
    return this.finishEnable(intent, permissionRequests, windowTarget, documentTarget)
  }

  disable(message = 'Device sensors are disabled.'): AppleSensorSnapshot {
    ++this.controlIntent
    this.removeAllListeners()
    this.clearCalibrationTimer()
    this.motionSupported = false
    this.orientationSupported = false
    this.publishOff(message)
    return this.snapshot
  }

  dispose(): void {
    if (this.disposed) return
    this.disable('Device sensors are disposed.')
    this.subscribers.clear()
    this.disposed = true
  }

  private async finishEnable(
    intent: number,
    permissionRequests: readonly Promise<PermissionResult>[],
    windowTarget: AppleSensorEventTarget,
    documentTarget: AppleSensorDocumentTarget,
  ): Promise<AppleSensorSnapshot> {
    const permissionResults = await Promise.all(permissionRequests)
    if (intent !== this.controlIntent || this.disposed) return this.snapshot
    if (permissionResults.some(result => result !== 'granted')) {
      this.removeAllListeners()
      this.clearCalibrationTimer()
      this.publish({
        phase: 'denied',
        permission: 'denied',
        motionEnabled: false,
        orientationEnabled: false,
        motion: null,
        orientation: null,
        ...this.resetMeasurements(),
        sampleCount: 0,
        message: 'Device sensor permission was denied. No sensor listeners were started.',
      })
      return this.snapshot
    }
    if (documentTarget.visibilityState === 'hidden') {
      return this.disable('Device sensors did not start because the page became hidden.')
    }
    this.installSensorListeners(windowTarget)
    this.installScreenOrientationListener()
    this.publish({
      phase: 'running',
      permission: 'granted',
      motionEnabled: this.motionSupported,
      orientationEnabled: this.orientationSupported,
      motion: null,
      orientation: null,
      ...this.resetMeasurements(),
      sampleCount: 0,
      message: this.orientationSupported
        ? 'Device sensors are enabled locally; the first orientation sample sets neutral.'
        : 'Device motion is enabled locally; normalized orientation is unavailable.',
    })
    this.scheduleCalibrationTimeout()
    return this.snapshot
  }

  private requestPermission(
    constructor: AppleSensorPermissionEventConstructor,
  ): Promise<PermissionResult> {
    if (typeof constructor.requestPermission !== 'function') return Promise.resolve('granted')
    try {
      return Promise.resolve(constructor.requestPermission.call(constructor)).then(
        result => result === 'granted' ? 'granted' : 'denied',
        () => 'denied',
      )
    } catch {
      return Promise.resolve('denied')
    }
  }

  private publish(update: Partial<Omit<AppleSensorSnapshot, 'schema' | 'spatialInputSchema' | 'revision'>>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...update, revision: this.snapshot.revision + 1 })
    for (const subscriber of this.subscribers) {
      try {
        subscriber()
      } catch (error) {
        this.reportSubscriberError(error)
      }
    }
  }

  private resetMeasurements(): Pick<AppleSensorSnapshot,
    'calibrated' | 'pitch' | 'roll' | 'screenAngleDegrees'> {
    this.spatialInputState = resetAppleSpatialInputState()
    return {
      calibrated: false,
      pitch: 0,
      roll: 0,
      screenAngleDegrees: this.readScreenAngleDegrees(),
    }
  }

  private publishOff(message: string): void {
    this.publish({
      phase: 'off',
      permission: this.snapshot.permission === 'prompting' ? 'unknown' : this.snapshot.permission,
      motionEnabled: false,
      orientationEnabled: false,
      motion: null,
      orientation: null,
      ...this.resetMeasurements(),
      sampleCount: 0,
      message,
    })
  }

  private publishUnavailable(message: string): void {
    this.removeAllListeners()
    this.publish({
      phase: 'unavailable',
      permission: 'unavailable',
      motionEnabled: false,
      orientationEnabled: false,
      motion: null,
      orientation: null,
      ...this.resetMeasurements(),
      sampleCount: 0,
      message,
    })
  }

  private installSensorListeners(windowTarget: AppleSensorEventTarget): void {
    this.removeSensorListeners()
    if (this.motionSupported) windowTarget.addEventListener('devicemotion', this.handleDeviceMotion)
    if (this.orientationSupported) {
      windowTarget.addEventListener('deviceorientation', this.handleDeviceOrientation)
    }
    this.sensorWindowTarget = windowTarget
  }

  private removeSensorListeners(): void {
    if (!this.sensorWindowTarget) return
    this.sensorWindowTarget.removeEventListener('devicemotion', this.handleDeviceMotion)
    this.sensorWindowTarget.removeEventListener('deviceorientation', this.handleDeviceOrientation)
    this.sensorWindowTarget = null
  }

  private installLifecycleListeners(
    windowTarget: AppleSensorEventTarget,
    documentTarget: AppleSensorDocumentTarget,
  ): void {
    this.removeLifecycleListeners()
    windowTarget.addEventListener('pagehide', this.stopForPageLifecycle)
    documentTarget.addEventListener('visibilitychange', this.stopForPageLifecycle)
    this.lifecycleWindowTarget = windowTarget
    this.lifecycleDocumentTarget = documentTarget
  }

  private removeLifecycleListeners(): void {
    this.lifecycleWindowTarget?.removeEventListener('pagehide', this.stopForPageLifecycle)
    this.lifecycleDocumentTarget?.removeEventListener('visibilitychange', this.stopForPageLifecycle)
    this.lifecycleWindowTarget = null
    this.lifecycleDocumentTarget = null
  }

  private installScreenOrientationListener(): void {
    this.removeScreenOrientationListener()
    if (!this.orientationSupported) return
    const target = this.readScreenOrientationTarget()
    target?.addEventListener('change', this.handleScreenOrientationChange)
    this.screenOrientationTarget = target
  }

  private removeScreenOrientationListener(): void {
    this.screenOrientationTarget?.removeEventListener('change', this.handleScreenOrientationChange)
    this.screenOrientationTarget = null
  }

  private removeAllListeners(): void {
    this.removeSensorListeners()
    this.removeScreenOrientationListener()
    this.removeLifecycleListeners()
  }

  private scheduleCalibrationTimeout(): void {
    this.clearCalibrationTimer()
    if (!this.orientationSupported || this.snapshot.phase !== 'running') return
    const intent = this.controlIntent
    const handler = (): void => {
      this.calibrationTimer = null
      if (intent !== this.controlIntent || this.snapshot.phase !== 'running' || this.snapshot.calibrated) return
      this.publish({ message: 'No orientation sample arrived; normalized axes remain neutral.' })
    }
    this.calibrationTimer = this.environment.setTimeout
      ? this.environment.setTimeout(handler, this.spatialInputProfile.calibrationTimeoutMilliseconds)
      : globalThis.setTimeout(handler, this.spatialInputProfile.calibrationTimeoutMilliseconds)
  }

  private clearCalibrationTimer(): void {
    if (this.calibrationTimer === null) return
    if (this.environment.clearTimeout) this.environment.clearTimeout(this.calibrationTimer)
    else globalThis.clearTimeout(this.calibrationTimer as ReturnType<typeof setTimeout>)
    this.calibrationTimer = null
  }

  private readWindowTarget(): AppleSensorEventTarget | null {
    if ('window' in this.environment) return this.environment.window ?? null
    return typeof window === 'undefined' ? null : window
  }

  private readDocumentTarget(): AppleSensorDocumentTarget | null {
    if ('document' in this.environment) return this.environment.document ?? null
    return typeof document === 'undefined' ? null : document
  }

  private readScreenOrientationTarget(): AppleScreenOrientationTarget | null {
    if ('screenOrientation' in this.environment) return this.environment.screenOrientation ?? null
    return typeof screen === 'undefined' ? null : screen.orientation
  }

  private readScreenAngleDegrees(): number {
    return finiteSpatialInputNumber(this.readScreenOrientationTarget()?.angle) ?? 0
  }

  private readPermissionConstructor(
    sensor: 'motion' | 'orientation',
  ): AppleSensorPermissionEventConstructor | null {
    const key = sensor === 'motion' ? 'motionEventConstructor' : 'orientationEventConstructor'
    if (key in this.environment) return this.environment[key] ?? null
    const globalKey = sensor === 'motion' ? 'DeviceMotionEvent' : 'DeviceOrientationEvent'
    return (globalThis as unknown as Record<string, AppleSensorPermissionEventConstructor | undefined>)[globalKey] ?? null
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('BrowserAppleSensorController has been disposed.')
  }
}
