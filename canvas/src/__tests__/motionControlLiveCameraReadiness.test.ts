import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), 'utf8')
}

export function testMotionControlLiveCameraProofUsesProductionCaptureLifecycle() {
  const runtime = readSource('src', 'features', 'three', 'motionControlRuntime.ts')
  const resources = readSource('src', 'features', 'three', 'motionControlCaptureResources.ts')
  const rootManifest = readSource('..', 'package.json')
  const runner = readSource('scripts', 'run_motion_control_live_camera_browser_smoke.mjs')
  const verifier = readSource('scripts', 'verify_motion_control_live_camera_browser_smoke.mjs')
  const documentation = readSource('..', 'docs', 'documents', 'agenticgraph-motion-control-live-camera-readiness.md')

  for (const marker of [
    "import('/src/features/three/motionControlRuntime.ts')",
    "import('/src/features/three/motionControlCapturePlatformBridge.ts')",
    "import('/src/features/three/motionControlMcpRuntime.ts')",
    "import('/src/features/three/motionControlSurfaceRuntime.ts')",
    "motionControl.buildMotionControlInvocation('start', 'wasm')",
    "motionControl.buildMotionControlInvocation('stop')",
    'motionControl.controlLocalMotionControl({ invocation: startInvocation })',
    'motionControl.controlLocalMotionControl({ invocation: stopInvocation })',
  ]) {
    if (!verifier.includes(marker)) throw new Error(`expected browser proof to reuse production owner ${marker}`)
  }
  for (const marker of [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    'mediaDevices.getUserMedia.bind(mediaDevices)',
    "track.readyState === 'live'",
    "track.readyState === 'ended'",
    'physicalCameraExercised: false',
    'personDetected: result.beforeStop.pose !== null',
  ]) {
    if (!verifier.includes(marker)) throw new Error(`expected honest deterministic camera proof marker ${marker}`)
  }
  if (!runner.includes("publishExactBrowserSmokeSource('AG_MOTION_CONTROL_LIVE_CAMERA')")
    || !runner.includes("existingServerPolicy: 'forbid'")) {
    throw new Error('expected live-camera proof to own a fresh exact-revision local server')
  }
  for (const command of [
    'canvas.xrMode.motionControl',
    'test:smoke:motion-control-litert:browser',
    'test:smoke:motion-control-live-camera:browser',
  ]) {
    if (!rootManifest.includes(command)) throw new Error(`expected runtime-ready command to include ${command}`)
  }
  if (!runtime.includes('navigator.mediaDevices.getUserMedia({')
    || !runtime.includes('scheduleInference(generation)')
    || !resources.includes('stream?.getTracks().forEach(track => track.stop())')) {
    throw new Error('expected production camera, inference, and release owners to remain intact')
  }
  if (verifier.includes('new MediaStream(') || verifier.includes('.captureStream(')) {
    throw new Error('expected browser proof to exercise getUserMedia instead of fabricating a stream')
  }
  if (verifier.includes('label: track.label')
    || verifier.includes('deviceId: settings.deviceId')
    || verifier.includes('groupId: settings.groupId')) {
    throw new Error('expected live-camera evidence to omit browser device identifiers')
  }
  const forbiddenOwner = ['andris', 'gauracs'].join('')
  const forbiddenRepository = ['LiteRT.js', 'Mocap'].join('-')
  for (const ownedSource of [runner, verifier]) {
    if (ownedSource.includes(forbiddenOwner) || ownedSource.includes(forbiddenRepository)) {
      throw new Error('expected live-camera readiness to remain clean-room and dependency-free')
    }
  }
  for (const statement of [
    'Chromium virtual camera',
    'does not prove physical-camera behavior',
    'does not claim that a person was detected',
    'every captured media track reaches `ended`',
  ]) {
    if (!documentation.includes(statement)) throw new Error(`expected browser-proof boundary: ${statement}`)
  }
}
