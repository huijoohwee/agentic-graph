import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agenticgraphAgentReadyToolContract.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  buildMotionControlBoundingBoxInvocation,
  controlLocalMotionControl,
  inspectLocalMotionControl,
} from '@/features/three/motionControlMcpRuntime'
import {
  resolveMotionControlTrackingBoundingBox,
  type MotionControlLandmark,
} from '@/features/three/motionControlPose'
import {
  readMotionControlSnapshot,
  setMotionControlBoundingBoxEnabled,
  stopMotionControl,
} from '@/features/three/motionControlRuntime'

type JsonSchema = Readonly<{
  additionalProperties?: boolean
  const?: unknown
  items?: JsonSchema
  oneOf?: readonly JsonSchema[]
  properties?: Readonly<Record<string, JsonSchema>>
  required?: readonly string[]
  type?: string
}>

type ToolContract = Readonly<{
  name?: string
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
}>

const landmark = (x: number, y: number, reliable = true): MotionControlLandmark => Object.freeze({
  x,
  y,
  z: 0,
  visibility: reliable ? 0.96 : 0.1,
  presence: reliable ? 0.95 : 0.1,
})

const approximately = (actual: number, expected: number): boolean => Math.abs(actual - expected) < 1e-9

export async function testMotionControlBoundingBoxReusesTrackedRoiAndDefaultsOff() {
  const initial = readMotionControlSnapshot()
  if (initial.boundingBoxEnabled || initial.boundingBox !== null) {
    throw new Error('expected each Motion Control page session to start with its transient bounding box disabled and empty')
  }

  const tracked = resolveMotionControlTrackingBoundingBox([
    landmark(0.2, 0.3), landmark(0.8, 0.3), landmark(0.2, 0.7), landmark(0.8, 0.7),
    landmark(0.35, 0.4), landmark(0.65, 0.4), landmark(0.35, 0.6), landmark(0.65, 0.6),
  ])
  if (!tracked
    || !approximately(tracked.x, 0.065)
    || !approximately(tracked.y, 0.065)
    || !approximately(tracked.width, 0.87)
    || tracked.height !== tracked.width) {
    throw new Error(`expected the existing padded, clamped tracking ROI to be the preview box, got ${JSON.stringify(tracked)}`)
  }
  const unavailable = resolveMotionControlTrackingBoundingBox([
    landmark(0.2, 0.3), landmark(0.8, 0.3), landmark(0.2, 0.7), landmark(0.8, 0.7),
    landmark(0.35, 0.4), landmark(0.65, 0.4), landmark(0.35, 0.6), landmark(0.65, 0.6, false),
  ])
  if (unavailable !== null) throw new Error('expected fewer than eight reliable landmarks to withhold the tracked bounding box')

  const enabled = setMotionControlBoundingBoxEnabled(true)
  if (!enabled.boundingBoxEnabled || enabled.revision !== initial.revision + 1) {
    throw new Error('expected one canonical snapshot revision when the preview preference changes')
  }
  const duplicate = setMotionControlBoundingBoxEnabled(true)
  if (duplicate.revision !== enabled.revision) throw new Error('expected an idempotent bounding-box preference write')
  await stopMotionControl()
  if (!readMotionControlSnapshot().boundingBoxEnabled) {
    throw new Error('expected Stop to clear transient geometry while preserving the page-session preview preference')
  }
  setMotionControlBoundingBoxEnabled(false)
  const inspection = inspectLocalMotionControl()
  if (inspection.preview.boundingBoxEnabled || inspection.preview.boundingBoxAvailable) {
    throw new Error('expected MCP inspection to expose only default-off enabled/available preview booleans')
  }
}

export async function testMotionControlBoundingBoxIsStrictlyInvocableWithoutCamera() {
  const previous = useGraphStore.getState()
  const previousSurface = {
    canvasRenderMode: previous.canvasRenderMode,
    canvas3dMode: previous.canvas3dMode,
    floatingPanelOpen: previous.floatingPanelOpen,
    floatingPanelView: previous.floatingPanelView,
    bottomSurfaceTab: previous.bottomSurfaceTab,
    bottomSurfaceCollapsed: previous.bottomSurfaceCollapsed,
    documentStructureBaselineLock: previous.documentStructureBaselineLock,
  }
  const { restore } = initJsdomHarness()
  let cameraRequestCount = 0

  try {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => { cameraRequestCount += 1 } },
    })
    setMotionControlBoundingBoxEnabled(false)
    if (buildMotionControlBoundingBoxInvocation(true) !== '/motion.control @canvas #pose operation=open boundingBox=true'
      || buildMotionControlBoundingBoxInvocation(false) !== '/motion.control @canvas #pose operation=open boundingBox=false') {
      throw new Error('expected the existing Motion Control command, canvas binding, and pose semantic to own both toggle invocations')
    }

    useGraphStore.setState({
      documentStructureBaselineLock: true,
      canvasRenderMode: '2d',
      canvas3dMode: '3d',
      floatingPanelOpen: false,
    } as never)
    const blocked = await controlLocalMotionControl({ operation: 'open', boundingBox: true })
    if (blocked.ok || readMotionControlSnapshot().boundingBoxEnabled) {
      throw new Error('expected rejected XR activation to leave the preview preference unchanged')
    }

    useGraphStore.setState({ documentStructureBaselineLock: false } as never)
    const enabled = await controlLocalMotionControl({ operation: 'open', boundingBox: true })
    const disabled = await controlLocalMotionControl({ invocation: buildMotionControlBoundingBoxInvocation(false) })
    if (!enabled.ok || !enabled.motionControl.preview.boundingBoxEnabled
      || !disabled.ok || disabled.motionControl.preview.boundingBoxEnabled
      || cameraRequestCount !== 0) {
      throw new Error(`expected structured and native toggles without camera access, got ${JSON.stringify({ enabled, disabled, cameraRequestCount })}`)
    }

    for (const invalid of [
      { operation: 'start', backend: 'auto', boundingBox: true },
      { operation: 'stop', boundingBox: false },
      { operation: 'open', boundingBox: 'true' },
      { invocation: '/motion.control @canvas #pose operation=open boundingBox=True' },
      { invocation: '/motion.control @canvas #pose operation=open boundingbox=true' },
      { invocation: '/motion.control @canvas #pose operation=open boundingBox=true', operation: 'open' },
    ]) {
      const result = await controlLocalMotionControl(invalid as never)
      if (result.ok) throw new Error(`expected strict Motion Control bounding-box input rejection: ${JSON.stringify(invalid)}`)
    }

    const contracts = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true }) as readonly ToolContract[]
    const inspectContract = contracts.find(contract => contract.name === 'inspect_local_motion_control')
    const controlContract = contracts.find(contract => contract.name === 'control_local_motion_control')
    const openSchema = controlContract?.inputSchema?.oneOf?.find(schema => schema.properties?.operation?.const === 'open')
    const previewSchema = inspectContract?.outputSchema?.properties?.preview
    const xr3dSchema = inspectContract?.outputSchema?.properties?.targets?.properties?.surfaces?.properties?.xr3d
    const identificationSchema = xr3dSchema?.properties?.objectIdentification
    const identificationRecordSchema = identificationSchema?.properties?.records?.items
    const identificationCountSchema = identificationSchema?.properties?.counts
    if (openSchema?.additionalProperties !== false
      || openSchema.properties?.boundingBox?.type !== 'boolean'
      || !inspectContract?.outputSchema?.required?.includes('preview')
      || previewSchema?.additionalProperties !== false
      || !previewSchema.required?.includes('boundingBoxEnabled')
      || !previewSchema.required.includes('boundingBoxAvailable')
      || !xr3dSchema?.required?.includes('objectIdentification')
      || identificationSchema?.additionalProperties !== false
      || identificationRecordSchema?.additionalProperties !== false
      || !identificationRecordSchema?.required?.includes('catalogDimensionsMeters')
      || !identificationRecordSchema.required.includes('physicsBodyMode')
      || identificationRecordSchema.properties?.boundingBox !== undefined
      || identificationRecordSchema.properties?.trackId !== undefined
      || identificationCountSchema?.additionalProperties !== false
      || !identificationCountSchema.required?.includes('physicsAttached')) {
      throw new Error('expected strict bounding-box control plus scene-derived identification schemas without camera geometry or track identities')
    }
  } finally {
    setMotionControlBoundingBoxEnabled(false)
    await stopMotionControl()
    useGraphStore.setState(previousSurface as never)
    restore()
  }
}
