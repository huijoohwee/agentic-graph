import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GraphData } from '@/lib/graph/types'
import {
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { registerPinnedAgenticOsDictionaryTokensForTest } from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import {
  buildCameraKeyboardInvocation,
  controlLocalCamera,
  inspectLocalCamera,
} from '@/features/strybldr/cameraMcpRuntime'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
} from '@/features/strybldr/cameraFramingRuntime'
import {
  THREE_CAMERA_KEYBOARD_FINE_ORBIT_STEP,
  THREE_CAMERA_KEYBOARD_ORBIT_STEP,
  resolveThreeCameraKeyboardFraming,
  resolveThreeKeyboardCommandAmount,
  resolveThreeKeyboardMotionDirection,
} from '@/features/three/threeKeyboardChoreography'
import {
  buildThreeKeyboardShortcutCatalog,
  formatThreeKeyboardShortcutCopyLine,
} from '@/features/three/threeKeyboardShortcutCatalog'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  readXrMotionReferencePlan,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
  selectXrMotionReferenceCameraMark,
} from '@/features/three/xrMotionReferenceRuntime'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { useGraphStore } from '@/hooks/useGraphStore'

const KEYBOARD_DICTIONARY_TOKENS = {
  command: ['/camera.select', '/camera.frame', '/camera.animate', '/camera.play', '/camera.scrub', '/animation.control'],
  semantic: ['#camera-shot', '#camera-motion', '#action-path', '#character-motion'],
  binding: ['@camera', '@selected-actor', '@canvas'],
} as const

function registerCanonicalCameraGrammar(): void {
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerPinnedAgenticOsDictionaryTokensForTest(KEYBOARD_DICTIONARY_TOKENS)
}

function buildKeyboardCameraGraph(): GraphData {
  const nodes = [{ id: 'actor-a', label: 'Lead', type: 'Person', properties: {} }]
  const plan = readXrMotionReferencePlan({
    durationSeconds: 6,
    camera: [{
      timeSeconds: 1,
      anchorId: 'actor-a',
      settings: { angle: 'front', level: 'eye-level', shot: 'medium', note: '', orbitX: 0, orbitY: 0, focalLengthMm: 50 },
    }],
  }, nodes)
  return {
    type: 'Graph',
    nodes,
    edges: [],
    metadata: { [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializeXrMotionReferencePlan(plan) },
  }
}

export function testXrKeyboardChoreographySharesBrowserAndMcpMotion(): void {
  registerCanonicalCameraGrammar()
  const diagonal = resolveThreeKeyboardMotionDirection(['w', 'd'])
  const cameraSettings = resolveThreeCameraKeyboardFraming({
    amount: THREE_CAMERA_KEYBOARD_ORBIT_STEP,
    keys: ['w', 'd'],
    settings: {},
  })
  if (Math.abs(Number(diagonal?.[0]) - Math.SQRT1_2) > 0.000001
    || Math.abs(Number(diagonal?.[1]) + Math.SQRT1_2) > 0.000001
    || resolveThreeKeyboardMotionDirection(['a', 'd']) !== null
    || resolveThreeKeyboardCommandAmount({ fine: false, target: 'camera' }) !== THREE_CAMERA_KEYBOARD_ORBIT_STEP
    || resolveThreeKeyboardCommandAmount({ fine: true, target: 'camera' }) !== THREE_CAMERA_KEYBOARD_FINE_ORBIT_STEP
    || resolveThreeKeyboardCommandAmount({ amount: 2.01, fine: false, target: 'camera' }) !== null
    || !cameraSettings
    || Math.abs(cameraSettings.orbitX - THREE_CAMERA_KEYBOARD_ORBIT_STEP * Math.SQRT1_2) > 0.000001
    || Math.abs(cameraSettings.orbitY + THREE_CAMERA_KEYBOARD_ORBIT_STEP * Math.SQRT1_2) > 0.000001) {
    throw new Error('expected one normalized keyboard resolver to own Camera and object motion profiles')
  }

  const invocation = buildCameraKeyboardInvocation({ action: 'frame', keys: ['w', 'd'], amount: 0.08 })
  if (invocation !== '/camera.frame @camera #camera-shot keys=w+d amount=0.08') {
    throw new Error(`expected a canonical source-backed keyboard invocation, got ${invocation}`)
  }

  const shortcutCatalog = buildThreeKeyboardShortcutCatalog()
  const shortcutsById = new Map(shortcutCatalog.map(shortcut => [shortcut.id, shortcut]))
  const objectShortcut = shortcutsById.get('xr-object-choreography')
  const frameShortcut = shortcutsById.get('xr-camera-framing')
  const cameraMarkShortcut = shortcutsById.get('xr-camera-choreography')
  if (shortcutCatalog.length !== 3
    || new Set(shortcutCatalog.map(shortcut => shortcut.id)).size !== shortcutCatalog.length
    || objectShortcut?.invocation !== '/animation.control #action-path @selected-actor operation=move-object keys=w+d distance=0.25'
    || frameShortcut?.invocation !== '/camera.frame @camera #camera-shot keys=w+d amount=0.08'
    || cameraMarkShortcut?.invocation !== '/camera.animate @camera #camera-motion keys=ArrowRight fine=true'
    || objectShortcut?.mcpTool !== 'agentic-graph.control_local_animation'
    || frameShortcut?.mcpTool !== 'agentic-graph.control_local_camera'
    || shortcutCatalog.some(shortcut => !shortcut.invocation.includes('/') || !shortcut.invocation.includes('#') || !shortcut.invocation.includes('@'))
    || shortcutCatalog.some(shortcut => !formatThreeKeyboardShortcutCopyLine(shortcut).includes(`MCP ${shortcut.mcpTool}`))) {
    throw new Error(`expected Help shortcuts to derive canonical / @ # and MCP examples from shared choreography builders, got ${JSON.stringify(shortcutCatalog)}`)
  }

  const graphData = buildKeyboardCameraGraph()
  useGraphStore.setState({
    markdownDocumentName: 'Keyboard camera.md',
    markdownDocumentText: '# Keyboard camera',
    graphData,
    selectedNodeId: 'actor-a',
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    timelineTransportPlaying: false,
    floatingPanelOpen: false,
    floatingPanelView: 'animation',
  } as never)
  hydrateCanonicalXrMotionReferenceRuntime()
  const cameraMark = readXrMotionReferenceRuntime().plan.camera[0]
  if (!cameraMark) throw new Error('expected a persisted Camera mark fixture')
  selectXrMotionReferenceCameraMark(cameraMark.id)

  publishCameraFramingRuntime({
    anchorId: 'canvas-camera',
    settings: { angle: 'front', level: 'eye-level', shot: 'medium', note: '', orbitX: 0, orbitY: 0, focalLengthMm: 50 },
    source: 'panel',
  })
  const frameResult = controlLocalCamera({ invocation })
  const frame = readCameraFramingRuntime()
  if (!frameResult.ok || frame.settings.orbitX <= 0 || frame.settings.orbitY >= 0) {
    throw new Error(`expected /camera.frame keyboard movement to reuse shared framing, got ${JSON.stringify(frameResult)}`)
  }

  const animateInvocation = buildCameraKeyboardInvocation({
    action: 'animate',
    keys: ['ArrowRight'],
    fine: true,
    markId: cameraMark.id,
  })
  const animateResult = controlLocalCamera({ invocation: animateInvocation })
  const movedMark = readXrMotionReferenceRuntime().plan.camera.find(mark => mark.id === cameraMark.id)
  const persisted = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  const inspection = inspectLocalCamera()
  if (!animateResult.ok
    || movedMark?.settings.orbitX !== THREE_CAMERA_KEYBOARD_FINE_ORBIT_STEP
    || !persisted
    || !inspection.invocationGrammar?.frameKeyboard
    || !inspection.invocationGrammar?.animateKeyboard) {
    throw new Error(`expected /camera.animate keyboard movement to persist the selected Camera mark, got ${JSON.stringify(animateResult)}`)
  }

  useGraphStore.setState({ timelineTransportPlaying: true } as never)
  const playbackOwned = controlLocalCamera({ invocation: '/camera.frame @camera #camera-shot keys=d' })
  useGraphStore.setState({ timelineTransportPlaying: false } as never)
  const wrongSemantic = controlLocalCamera({ invocation: '/camera.animate @camera #camera-shot keys=d' })
  const invalidKeys = controlLocalCamera({ invocation: '/camera.frame @camera #camera-shot keys=q' })
  const excessiveAmount = controlLocalCamera({ invocation: '/camera.frame @camera #camera-shot keys=d amount=2.01' })
  if (playbackOwned.ok || wrongSemantic.ok || invalidKeys.ok || excessiveAmount.ok) {
    throw new Error('expected keyboard Camera control to reject playback conflicts and malformed source grammar')
  }

  const browserAdapter = readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'XrKeyboardChoreographyRuntime.tsx'), 'utf8')
  const cameraWebMcp = readFileSync(resolve(process.cwd(), 'src', 'features', 'agent-ready', 'cameraWebMcpTools.ts'), 'utf8')
  const shortcutCatalogSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'three', 'threeKeyboardShortcutCatalog.ts'), 'utf8')
  const helpShortcutSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'HelpShortcutsSection.tsx'), 'utf8')
  const helpLogicSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'panels', 'hooks', 'useHelpViewLogic.ts'), 'utf8')
  if (!browserAdapter.includes('resolveThreeCameraKeyboardFraming')
    || !browserAdapter.includes('resolveXrSubjectKeyboardMotion')
    || !browserAdapter.includes('[data-kg-floating-panel-view-trigger="camera"]')
    || !readFileSync(resolve(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), 'utf8').includes('data-kg-floating-panel-view-trigger={spec.view}')
    || !cameraWebMcp.includes('async input => controlLocalCamera(input || {})')
    || !shortcutCatalogSource.includes('buildCameraKeyboardInvocation')
    || !shortcutCatalogSource.includes('buildXrAnimationObjectMoveInvocation')
    || !shortcutCatalogSource.includes('CAMERA_WEB_MCP_TOOL_IDS')
    || !shortcutCatalogSource.includes('XR_ANIMATION_WEB_MCP_TOOL_IDS')
    || !helpShortcutSource.includes('data-kg-help-xr-shortcuts="1"')
    || !helpShortcutSource.includes('renderMarkdownSigilInlineText(shortcut.invocation)')
    || !helpLogicSource.includes('THREE_KEYBOARD_SHORTCUT_GRAMMAR_SIGILS')
    || !helpLogicSource.includes('formatThreeKeyboardShortcutCopyLine')) {
    throw new Error('expected browser keys and WebMCP to delegate to the shared choreography owners')
  }
}
