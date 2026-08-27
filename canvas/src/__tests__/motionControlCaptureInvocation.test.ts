import {
  buildMotionControlExportInvocation,
  buildMotionControlInvocation,
  buildMotionControlShareInvocation,
  controlLocalMotionControl,
  inspectLocalMotionControl,
} from '@/features/three/motionControlMcpRuntime'
import { motionCaptureSessionRuntime } from '@/features/three/motionCaptureSessionRuntime'
import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agenticgraphAgentReadyToolContract.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'

const landmark = Object.freeze({ x: 0.1, y: 0.2, z: 0.3, visibility: 0.95, presence: 0.96 })

type AgentToolContract = Readonly<{
  name?: unknown
  inputSchema?: unknown
  outputSchema?: Readonly<{
    properties?: Readonly<{
      capturePlatform?: Readonly<{ additionalProperties?: unknown }>
      peerSharing?: Readonly<{ additionalProperties?: unknown }>
    }>
  }>
}>

export async function testMotionCaptureInvocationAndWebMcpConvergeWithoutPayloadDisclosure(): Promise<void> {
  const priorSurface = useGraphStore.getState()
  const priorSurfaceState = {
    canvasRenderMode: priorSurface.canvasRenderMode,
    canvas3dMode: priorSurface.canvas3dMode,
    floatingPanelOpen: priorSurface.floatingPanelOpen,
    floatingPanelView: priorSurface.floatingPanelView,
  }
  useGraphStore.setState({ canvasRenderMode: '2d', canvas3dMode: '3d', floatingPanelOpen: false })
  motionCaptureSessionRuntime.clearRecording()
  const source = motionCaptureSessionRuntime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'model-relative',
    clockDomain: 'session-monotonic',
    nominalFps: 30,
  })
  try {
    if (buildMotionControlInvocation('record') !== '/motion.control @canvas #pose operation=record'
      || buildMotionControlInvocation('finish') !== '/motion.control @canvas #pose operation=finish'
      || buildMotionControlInvocation('clear') !== '/motion.control @canvas #pose operation=clear'
      || buildMotionControlExportInvocation('json') !== '/motion.control @canvas #pose operation=export format=json'
      || buildMotionControlExportInvocation('csv') !== '/motion.control @canvas #pose operation=export format=csv'
      || buildMotionControlShareInvocation(true) !== '/motion.control @canvas #pose operation=share enabled=true') {
      throw new Error('expected canonical Motion Capture invocation builders')
    }

    const outsideXr = await controlLocalMotionControl({ invocation: buildMotionControlInvocation('record') })
    if (outsideXr.ok || !outsideXr.message.includes('approved XR Motion Control surface')) {
      throw new Error('expected recording to fail closed outside the approved XR capture surface')
    }
    useGraphStore.setState({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      floatingPanelOpen: true,
      floatingPanelView: 'motionControl',
    })
    const started = await controlLocalMotionControl({ invocation: buildMotionControlInvocation('record') })
    if (!started.ok) throw new Error(`expected recording start through canonical invocation: ${started.message}`)
    motionCaptureSessionRuntime.ingestObservation(source.sourceId, {
      captureTimestampMs: 100,
      sequence: 1,
      coordinateSpace: 'model-relative',
      confidence: 0.9,
      landmarks: [landmark],
    })
    const finished = await controlLocalMotionControl({ operation: 'finish' })
    const exported = await controlLocalMotionControl({ invocation: buildMotionControlExportInvocation('json') })
    if (!finished.ok || !exported.ok || !('export' in exported)) throw new Error('expected finished recording to export through the same controller')
    if ('content' in exported.export
      || exported.export.format !== 'json'
      || exported.export.researchReadyGroupCount !== 0
      || exported.export.researchEvidenceManifestCount !== 0
      || !/^[a-f0-9]{64}$/u.test(exported.export.sha256)) {
      throw new Error('expected WebMCP export to return deterministic metadata without recording bytes')
    }

    const inspection = inspectLocalMotionControl()
    if (inspection.schema !== 'agenticgraph-motion-control-mcp/v2'
      || inspection.capturePlatform.evidence.researchReady
      || inspection.capturePlatform.evidence.tier !== 'single-view-control'
      || inspection.capturePlatform.sources.some(candidate => 'landmarks' in (candidate.latestObservation || {}))
      || Object.keys(inspection.peerSharing).some(key => /peerId|endpoint|invite/u.test(key))) {
      throw new Error('expected honest evidence grading and redacted MCP inspection')
    }
    const contracts = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true }) as readonly AgentToolContract[]
    const inspectContract = contracts.find(contract => contract.name === 'inspect_local_motion_control')
    const controlContract = contracts.find(contract => contract.name === 'control_local_motion_control')
    const controlSchema = JSON.stringify(controlContract?.inputSchema || {})
    const inspectSchema = JSON.stringify(inspectContract?.outputSchema || {})
    const captureSchema = inspectContract?.outputSchema?.properties?.capturePlatform
    const peerSchema = inspectContract?.outputSchema?.properties?.peerSharing
    if (!['record', 'finish', 'clear', 'export', 'json', 'csv', 'share', 'enabled'].every(token => controlSchema.includes(`"${token}"`))
      || captureSchema?.additionalProperties !== false
      || peerSchema?.additionalProperties !== false
      || !['"throttled"', '"backpressure"'].every(status => inspectSchema.includes(status))
      || !['"researchUsableSamples"', '"researchDurationMs"', '"researchManifestDigestSha256"', '"providerApi"'].every(field => inspectSchema.includes(field))
      || inspectSchema.includes('"content"')) {
      throw new Error('expected strict v2 WebMCP capture input and redacted inspection schemas')
    }

    const invalidInputs = [
      null,
      { operation: 'export' },
      { operation: 'export', format: 'xml' },
      { operation: 'share' },
      { operation: 'share', enabled: 'true' },
      { operation: 'start', backend: null },
      { operation: 'start', backend: false },
      { operation: 'start', backend: 0 },
      { operation: 'start', backend: '' },
      { invocation: [buildMotionControlInvocation('open')] },
      { invocation: '/motion.control @canvas #pose operation=export' },
      { invocation: '/motion.control @canvas #pose operation=share enabled=True' },
      { invocation: '/motion.control @canvas #pose operation=record format=json' },
      { invocation: '/motion.control @canvas #pose operation=clear enabled=false' },
      { invocation: buildMotionControlExportInvocation('csv'), format: 'csv' },
    ]
    for (const input of invalidInputs) {
      const result = await controlLocalMotionControl(input as never)
      if (result.ok) throw new Error(`expected capture invocation to fail closed: ${JSON.stringify(input)}`)
    }
    const disabled = await controlLocalMotionControl({ invocation: buildMotionControlShareInvocation(false) })
    if (!disabled.ok || disabled.motionControl.peerSharing.enabled) throw new Error('expected explicit peer-sharing disable to converge')
  } finally {
    useGraphStore.setState(priorSurfaceState)
    motionCaptureSessionRuntime.clearRecording()
    if (motionCaptureSessionRuntime.getSnapshot().sources.some(candidate => candidate.sourceId === source.sourceId)) {
      motionCaptureSessionRuntime.removeSource(source.sourceId)
    }
  }
}
