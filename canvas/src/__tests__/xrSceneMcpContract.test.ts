import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  registerPinnedAgenticOsDictionaryTokensForTest,
  RETIRED_BROWSER_DICTIONARY_FALLBACK_TOKENS,
} from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import {
  findAgenticOsInvocationByToken,
  getAgenticOsBindingInvocations,
  getAgenticOsCommandInvocations,
  getAgenticOsSemanticInvocations,
  type AgenticOsDictionaryInvocation,
  type AgenticOsDictionaryInvocationKind,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID,
  AGENTIC_OS_AGENT_READY_TOOL_IDS,
  buildAgenticGraphAgentReadyToolContracts,
} from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import {
  AGENTIC_OS_VDEOXPLN_IDS,
  buildAgenticGraphVdeoxplnRegistry,
} from '@/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs'
import { parseChatInvocationDirectives } from '@/features/chat/chatInvocationRegistry'
import { resolveChatRuntimeInvocationQuery } from '@/features/chat/chatRuntimeInvocationQuery'
import { buildCameraKeyboardInvocation } from '@/features/strybldr/cameraMcpRuntime'
import { buildMotionControlInvocation } from '@/features/three/motionControlMcpRuntime'
import { buildXrAnimationInvocation } from '@/features/three/xrAnimationMcpRuntime'
import { parseXrInteractiveInvocation } from '@/features/three/xrSceneInteractiveInvocation'
import { normalizeXrSceneControl } from '@/features/three/xrSceneMcpRuntime'
import {
  XR_SCENE_INVOCATION_BINDINGS,
  XR_SCENE_INVOCATION_COMMANDS,
  XR_SCENE_INVOCATION_SEMANTICS,
  buildXrPhysicsInvocation,
  buildXrPlaceInvocation,
  buildXrPresentInvocation,
  buildXrStageInvocation,
  buildXrTransformInvocation,
} from '@/features/three/xrSceneMcpContract.mjs'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'
import { AGENTIC_CANVAS_OS_DOCS_KIND_FILES } from '../../../mcp/agentic-canvas-os-docs-contract.mjs'

type JsonSchema = Readonly<{
  const?: unknown
  additionalProperties?: boolean
  minimum?: number
  maximum?: number
  oneOf?: readonly JsonSchema[]
  properties?: Readonly<Record<string, JsonSchema>>
  required?: readonly string[]
}>

type InvocationToken = AgenticOsDictionaryInvocation['token']

const TOKENS_BY_KIND: Readonly<Record<AgenticOsDictionaryInvocationKind, readonly InvocationToken[]>> = Object.freeze({
  command: Object.freeze(Object.values(XR_SCENE_INVOCATION_COMMANDS) as InvocationToken[]),
  semantic: Object.freeze(Object.values(XR_SCENE_INVOCATION_SEMANTICS) as InvocationToken[]),
  binding: Object.freeze(Object.values(XR_SCENE_INVOCATION_BINDINGS) as InvocationToken[]),
})

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function registryForKind(kind: AgenticOsDictionaryInvocationKind) {
  return kind === 'command'
    ? getAgenticOsCommandInvocations()
    : kind === 'semantic'
      ? getAgenticOsSemanticInvocations()
      : getAgenticOsBindingInvocations()
}

function assertCanonicalCatalogAndRuntimeDedupe(): void {
  resetAgenticOsRemoteGrammarCatalogForTests()
  try {
    for (const [kind, tokens] of Object.entries(RETIRED_BROWSER_DICTIONARY_FALLBACK_TOKENS) as Array<[
      AgenticOsDictionaryInvocationKind,
      readonly string[],
    ]>) {
      for (const token of tokens) {
        assert(!registryForKind(kind).some(invocation => invocation.token === token), `expected retired local ${kind} fallback ${token} to remain absent`)
        assert(findAgenticOsInvocationByToken(token) == null, `expected ${token} to resolve only after source-backed catalog hydration`)
      }
    }
    const nativeStage = normalizeXrSceneControl({ invocation: buildXrStageInvocation('neutral-volume') })
    const nativePhysics = parseXrInteractiveInvocation(buildXrPhysicsInvocation('world', 'reset'))
    const nativePresent = parseXrInteractiveInvocation(buildXrPresentInvocation())
    const nativeCamera = buildCameraKeyboardInvocation({ action: 'frame', keys: ['w'] })
    const nativeAnimation = buildXrAnimationInvocation('dance')
    const nativeMotionControl = buildMotionControlInvocation('open')
    assert(nativeStage?.action === 'stage' && nativeStage.stageId === 'neutral-volume', 'expected native XR stage parsing before remote dictionary hydration')
    assert(nativePhysics?.action === 'physics' && nativePhysics.physics.operation === 'reset', 'expected native XR physics parsing before remote dictionary hydration')
    assert(nativePresent?.action === 'present', 'expected native XR presentation parsing before remote dictionary hydration')
    assert(nativeCamera.startsWith('/camera.frame '), 'expected native Camera builder before remote dictionary hydration')
    assert(nativeAnimation.startsWith('/animation.control '), 'expected native Animation builder before remote dictionary hydration')
    assert(nativeMotionControl.startsWith('/motion.control '), 'expected native Motion Control builder before remote dictionary hydration')

    const revision = registerPinnedAgenticOsDictionaryTokensForTest(RETIRED_BROWSER_DICTIONARY_FALLBACK_TOKENS)
    registerPinnedAgenticOsDictionaryTokensForTest(RETIRED_BROWSER_DICTIONARY_FALLBACK_TOKENS)
    for (const [kind, tokens] of Object.entries(RETIRED_BROWSER_DICTIONARY_FALLBACK_TOKENS) as Array<[
      AgenticOsDictionaryInvocationKind,
      readonly string[],
    ]>) {
      for (const token of tokens) {
        const matches = registryForKind(kind).filter(invocation => invocation.token === token)
        assert(matches.length === 1, `expected one deduplicated pinned ${kind} entry for ${token}, got ${matches.length}`)
        const resolved = findAgenticOsInvocationByToken(token)
        assert(resolved?.kind === kind && resolved.token === token, `expected pinned canonical lookup for ${token}`)
        assert(
          resolved.sourcePath.includes(`/blob/${revision}/docs/${AGENTIC_CANVAS_OS_DOCS_KIND_FILES[kind]}`),
          `expected exact-revision source metadata for ${token}, got ${resolved.sourcePath}`,
        )
        const route = resolveChatRuntimeInvocationQuery(`${token} active XR scene`)
        assert(route.leadingRoute?.kind === 'agentic-os' && route.leadingRoute.token === token, `expected chat routing for ${token}`)
      }
    }

    const semanticTokens = new Set<InvocationToken>(
      parseChatInvocationDirectives(TOKENS_BY_KIND.semantic.join(' ')).map(entry => String(entry.token) as InvocationToken),
    )
    for (const token of TOKENS_BY_KIND.semantic) {
      assert(semanticTokens.has(token), `expected semantic directive parsing for ${token}`)
    }

  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

function assertInvocationBuildersRoundTrip(): void {
  assert(buildXrStageInvocation('neutral-volume') === '/xr.stage @neutral-volume', 'expected canonical stage builder')
  assert(buildXrPlaceInvocation('person-adult', 'hold') === '/xr.place @person-adult transition=hold', 'expected canonical place builder')
  const transformInvocation = buildXrTransformInvocation('actor with spaces/β', {
    position: [1, 0, -2],
    rotationYDegrees: 45,
    scale: 1.25,
    color: '#38bdf8',
  })
  const transform = normalizeXrSceneControl({ invocation: transformInvocation })
  assert(transformInvocation === '/xr.transform @actor%20with%20spaces%2F%CE%B2 #transform position=1,0,-2 rotation=45 scale=1.25 color=#38bdf8', 'expected canonical transform builder')
  assert(transform?.action === 'transform'
    && transform.subjectId === 'actor with spaces/β'
    && transform.position?.join('|') === '1|0|-2'
    && transform.rotationYDegrees === 45
    && transform.scale === 1.25
    && transform.color === '#38bdf8', 'expected transform invocation to round-trip native / @ # fields')
  const assetSwapInvocation = buildXrTransformInvocation('actor-a', { assetId: 'prop-ball' })
  const assetSwap = normalizeXrSceneControl({ invocation: assetSwapInvocation })
  assert(assetSwapInvocation === '/xr.transform @actor-a #transform asset=prop-ball'
    && assetSwap?.action === 'transform'
    && assetSwap.assetId === 'prop-ball', 'expected native asset replacement to reuse the canonical transform invocation owner')

  const subjectId = 'actor with spaces/β'
  const physicsInvocation = buildXrPhysicsInvocation('body', 'attach', {
    subject: subjectId,
    mode: 'dynamic',
    mass: 2,
  })
  const physics = parseXrInteractiveInvocation(physicsInvocation)
  assert(physics?.action === 'physics' && physics.physics.subjectId === subjectId, 'expected physics builder to round-trip an encoded subject id with spaces')
  const physicsTokens = splitInvocationTokenSegments(physicsInvocation)
    .filter(segment => segment.kind === 'token')
    .map(segment => segment.value)
  for (const token of ['/xr.physics', '@canvas', '#body']) {
    assert(physicsTokens.includes(token), `expected physics builder to expose canonical ${token}`)
  }

  const presentInvocation = buildXrPresentInvocation()
  assert(parseXrInteractiveInvocation(presentInvocation)?.action === 'present', 'expected present builder to round-trip through the shared parser')
  assert(presentInvocation === '/xr.present @scene #reticle', 'expected canonical present builder')
}

function assertWebMcpSchemasAndReadOnlyProjection(): void {
  const contracts = buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID,
    includeBrowserOnlyTools: true,
  })
  const inspect = contracts.find(contract => contract.name === AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalXrSceneAssets)
  const control = contracts.find(contract => contract.name === AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalXrScene)
  assert(inspect?.outputSchema?.required?.includes('physics') && inspect.outputSchema.required.includes('immersivePlacement'), 'expected XR inspection schema to require physics and immersive placement')
  const inspectSchema = JSON.stringify(inspect.outputSchema)
  for (const field of ['catalogDefaults', 'terrainId', 'assetId', 'kind', 'default', 'featured']) {
    assert(inspectSchema.includes(`"${field}"`), `expected XR inspection output schema to type ${field}`)
  }
  assert(control, 'expected the browser-local XR scene control contract')

  const physicsSchema = control.inputSchema?.properties?.physics as JsonSchema | undefined
  assert(physicsSchema?.oneOf?.length === 16, `expected sixteen operation-specific XR physics schemas, got ${physicsSchema?.oneOf?.length || 0}`)
  const operationSchema = (scope: string, operation: string): JsonSchema | undefined => physicsSchema.oneOf?.find(schema => (
    schema.properties?.scope?.const === scope && schema.properties?.operation?.const === operation
  ))
  const worldConfigure = operationSchema('world', 'configure')
  assert(worldConfigure?.properties?.fixedStepSeconds?.minimum === 1 / 240, 'expected exact 240 Hz minimum step endpoint')
  assert(worldConfigure?.properties?.fixedStepSeconds?.maximum === 1 / 30, 'expected exact 30 Hz maximum step endpoint')
  assert(!operationSchema('world', 'play')?.properties?.gravity, 'expected Play schema to reject configure-only fields')
  assert(!operationSchema('body', 'detach')?.properties?.massKg, 'expected Detach schema to reject body configuration fields')
  assert(operationSchema('controller', 'develop-run')?.properties?.controllerMode, 'expected native controller launch to accept an optional mode')
  assert(operationSchema('controller', 'select')?.required?.includes('controllerMode'), 'expected native controller selection to require a mode')

  const sceneControlSchema = control.inputSchema as JsonSchema | undefined
  assert(sceneControlSchema?.oneOf?.length === 9, `expected invocation plus eight structured XR action schemas, got ${sceneControlSchema?.oneOf?.length || 0}`)
  const physicsActionSchema = sceneControlSchema.oneOf?.find(schema => schema.properties?.action?.const === 'physics')
  const transformActionSchema = sceneControlSchema.oneOf?.find(schema => schema.properties?.action?.const === 'transform')
  const invocationSchema = sceneControlSchema.oneOf?.find(schema => schema.required?.includes('invocation'))
  assert(physicsActionSchema?.required?.includes('physics'), 'expected structured physics actions to require the operation-specific physics payload')
  assert(transformActionSchema?.required?.includes('subjectId')
    && transformActionSchema.properties?.assetId
    && transformActionSchema.properties?.scale?.minimum === 0.25
    && transformActionSchema.properties?.scale?.maximum === 4, 'expected subject transform schema to require identity and bounded scale')
  assert(invocationSchema?.additionalProperties === false
    && Object.keys(invocationSchema.properties || {}).join('|') === 'invocation', 'expected invocation calls to reject contradictory structured action fields')

  const validateControl = new Ajv2020({ allErrors: true, strict: true }).compile(control.inputSchema)
  assert(validateControl({
    action: 'physics',
    physics: { scope: 'world', operation: 'configure', gravity: [0, -9.81, 0] },
  }), `expected strict Ajv clients to compile and validate XR world configuration: ${JSON.stringify(validateControl.errors)}`)
  assert(validateControl({
    action: 'transform',
    subjectId: 'actor-a',
    position: [1, 0, -2],
    rotationYDegrees: 45,
    scale: 1.25,
    color: '#38bdf8',
  }), `expected strict Ajv clients to validate native subject transforms: ${JSON.stringify(validateControl.errors)}`)
  assert(validateControl({ action: 'transform', subjectId: 'actor-a', assetId: 'vehicle-helicopter' }), `expected strict Ajv clients to validate native asset replacement: ${JSON.stringify(validateControl.errors)}`)
  assert(!validateControl({ action: 'transform', subjectId: 'actor-a' }), 'expected subject transform schema to require at least one edited field')
  assert(!validateControl({
    action: 'physics',
    physics: { scope: 'world', operation: 'play', gravity: [0, -9.81, 0] },
  }), 'expected strict Ajv validation to reject configure-only fields on Play')
  assert(!validateControl({ invocation: '/xr.present @scene #reticle', action: 'present' }), 'expected strict Ajv validation to reject mixed invocation and structured action shapes')
  assert(!validateControl({ invocation: '   ' }), 'expected strict Ajv validation to reject whitespace-only invocation text')
  assert(!validateControl({
    action: 'physics',
    physics: { scope: 'body', operation: 'detach', subjectId: ` ${'x'.repeat(160)} ` },
  }), 'expected strict Ajv validation to apply subject limits before runtime trimming')

  const animationControl = contracts.find(contract => contract.name === AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalAnimation)
  assert(animationControl, 'expected the browser-local Animation control contract')
  const animationSchema = animationControl.inputSchema as JsonSchema | undefined
  assert(animationSchema?.oneOf?.length === 10, `expected invocation plus nine operation-specific Animation schemas, got ${animationSchema?.oneOf?.length || 0}`)
  const validateAnimation = new Ajv2020({ allErrors: true, strict: true }).compile(animationControl.inputSchema)
  assert(validateAnimation({ invocation: '/animation.control @canvas operation=play' }), `expected strict Ajv clients to accept invocation-only Animation control: ${JSON.stringify(validateAnimation.errors)}`)
  assert(validateAnimation({ operation: 'apply', trackKind: 'character-motion', presetId: 'dance', targetId: 'actor-a' }), `expected structured Animation apply schema: ${JSON.stringify(validateAnimation.errors)}`)
  assert(validateAnimation({ operation: 'configure-mark', markKind: 'cast', markId: 'cast:actor-a:0', targetId: 'actor-a', gait: 'run', position: [1, 0, -2] }), `expected structured cast choreography schema: ${JSON.stringify(validateAnimation.errors)}`)
  assert(validateAnimation({ operation: 'configure-mark', markKind: 'camera', markId: 'camera:0', easing: 'ease-in-out' }), `expected structured Camera choreography schema: ${JSON.stringify(validateAnimation.errors)}`)
  assert(!validateAnimation({ invocation: '/animation.control @canvas operation=play', operation: 'play' }), 'expected Animation schema to reject mixed invocation and structured operation shapes')
  assert(!validateAnimation({ operation: 'apply', targetId: 'actor-a' }), 'expected Animation apply schema to require a preset')
  assert(!validateAnimation({ operation: 'scrub' }), 'expected Animation scrub schema to require timeSeconds')
  assert(!validateAnimation({ operation: 'play', targetId: 'actor-a' }), 'expected Animation play schema to reject ignored target fields')
  assert(!validateAnimation({ operation: 'configure-mark', markKind: 'camera', markId: 'camera:0', targetId: 'actor-a', easing: 'linear' }), 'expected Camera mark schema to reject ignored cast targeting')
  assert(!validateAnimation({ operation: 'move-object', trackKind: 'character-motion', keys: ['w'] }), 'expected object movement schema to require action-path semantics when trackKind is explicit')

  const agentReady = buildAgenticGraphVdeoxplnRegistry().find(entry => entry.id === AGENTIC_OS_VDEOXPLN_IDS.agentReady)
  const publishedToolNames = new Set(buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID,
  }).map(contract => contract.name))
  const contractsByName = new Map<string, boolean>(contracts.map(contract => [
    String(contract.name),
    contract.annotations?.readOnlyHint === true,
  ] as [string, boolean]))
  assert(agentReady, 'expected the agent-ready vdeoxpln projection')
  assert(agentReady.tools.browserLocal.length, 'expected read-only browser-local tools in the agent-ready projection')
  const expectedBrowserLocal = contracts
    .filter(contract => contract.annotations?.readOnlyHint === true && !publishedToolNames.has(contract.name))
    .map(contract => contract.name)
    .sort()
  assert(
    JSON.stringify([...agentReady.tools.browserLocal].sort()) === JSON.stringify(expectedBrowserLocal),
    'expected the vdeoxpln projection to exactly match read-only browser-only contracts',
  )
  assert(agentReady.tools.browserLocal.includes(AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalXrSceneAssets), 'expected read-only XR inspection in the vdeoxpln projection')
  assert(!agentReady.tools.browserLocal.includes(AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalXrScene), 'expected mutating XR control outside the read-only vdeoxpln projection')
  for (const toolName of agentReady.tools.browserLocal) {
    assert(contractsByName.get(toolName) === true, `expected ${toolName} to remain read-only in the agent-ready vdeoxpln`)
  }
}

function assertExpandedCleanRoomBoundary(): void {
  const repoRoot = resolve(process.cwd(), '..')
  const paths = [
    'src/features/three/xrPhysicsModel.ts',
    'src/features/three/xrPhysicsRuntime.ts',
    'src/features/three/xrSpatialPhysicsAdapter.ts',
    'src/features/physics/spatialPhysicsEngine.ts',
    'src/features/physics/spatialPhysicsStep.ts',
    'src/features/three/xrNativeControllerInput.ts',
    'src/features/three/xrNativeControllerDemoRuntime.ts',
    'src/features/three/XrNativeControllerDemoStage.tsx',
    'src/features/three/useXrNativeControllerDemoCamera.ts',
    'src/features/three/XrPhysicsStageRuntime.tsx',
    'src/features/three/XrKeyboardChoreographyRuntime.tsx',
    'src/features/three/XrMotionReferenceRuntimeBridge.tsx',
    'src/features/three/xrArPlacementRuntime.ts',
    'src/features/three/XrArPlacementStage.tsx',
    'src/features/three/XrEmptyWorldStage.tsx',
    'src/features/three/XrCanonicalPhysicsStage.tsx',
    'src/features/three/XrMotionReferenceGraphStage.tsx',
    'src/features/three/useXrStageMotionControlCleanup.ts',
    'src/features/three/XrMotionReferenceStage.tsx',
    'src/features/three/XrStagePresetGeometry.tsx',
    'src/features/three/SpatialCaptureManifestStage.tsx',
    'src/features/three/xrSceneInteractiveInvocation.ts',
    'src/features/three/xrSceneMcpContract.mjs',
    'src/features/three/xrSceneMcpRuntime.ts',
    'src/features/command-menu/XrSimulationWorkbench.tsx',
    'src/features/command-menu/XrNativeControllerDemoControls.tsx',
    'src/features/command-menu/XrMediaLibraryPanel.tsx',
    'src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs',
    'src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs',
    'src/features/agentic-os/agenticOsDocInvocations.ts',
    'src/lib/three/ThreeGraph.impl.tsx',
    'src/lib/three/Scene.impl.tsx',
    'src/lib/three/ThreeGraphXr.tsx',
    'src/lib/three/ThreeGraphXrSessionPolicy.ts',
    'package.json',
    'package-lock.json',
  ].map(path => resolve(process.cwd(), path))
  paths.push(resolve(repoRoot, 'package.json'), resolve(repoRoot, 'package-lock.json'))
  paths.push(resolve(repoRoot, 'docs/workspace-seeds/agentic-graph-physics-playground-demo.md'))
  const source = paths.map(path => readFileSync(path, 'utf8')).join('\n').toLowerCase()
  const forbidden = [
    ['8th', 'wall'].join(''),
    ['studio', 'physics', 'playground', 'example'].join('-'),
    ['@', '8th', 'wall', '/', 'ecs'].join(''),
  ]
  for (const marker of forbidden) {
    assert(!source.includes(marker), `expected XR physics and MCP sources to remain clean-room native: ${marker}`)
  }
}

export async function assertXrScenePhysicsWebMcpLifecycle(args: Readonly<{
  control: (input: Record<string, unknown>) => Promise<unknown>
  inspect: () => Promise<unknown>
  subjectId: string
}>): Promise<void> {
  assert(args.subjectId, 'expected a placed XR subject before exercising physics WebMCP')
  const transformed = await args.control({ invocation: `/xr.transform @${encodeURIComponent(args.subjectId)} #transform asset=prop-ball position=1,0,-2 rotation=30 scale=1.25 color=#38bdf8` })
  const staged = await args.control({ action: 'stage', stageId: 'tropical-playground' })
  const invalidSemantics = await args.control({ invocation: '/xr.physics @canvas #world #body operation=play' })
  const attached = await args.control({ invocation: `/xr.physics @canvas #body operation=attach subject=${encodeURIComponent(args.subjectId)} mode=dynamic mass=2 friction=0.4 restitution=0.2 damping=0.1` })
  const played = await args.control({ invocation: '/xr.physics @canvas #world operation=play' })
  const rejectedSceneEdit = await args.control({ action: 'remove', subjectId: 'missing-subject' })
  const afterRejectedEdit = await args.inspect()
  const impulse = await args.control({ action: 'physics', physics: { scope: 'impulse', operation: 'impulse', subjectId: args.subjectId, impulse: [0, 3, -1] } })
  const stopped = await args.control({ invocation: '/xr.physics @canvas #world operation=stop' })
  const controllerStarted = await args.control({ invocation: '/xr.physics @canvas #controller operation=develop-run mode=ball' })
  const controllerSelected = await args.control({ action: 'physics', physics: { scope: 'controller', operation: 'select', controllerMode: 'rocket' } })
  const controllerExited = await args.control({ invocation: '/xr.physics @canvas #controller operation=exit' })
  assert((invalidSemantics as { ok?: unknown }).ok === false, 'expected duplicate XR physics semantics to fail closed')
  const transformedSubject = (transformed as { scene?: { runtime?: { subjects?: Array<Record<string, unknown>> } } }).scene?.runtime?.subjects?.find(subject => subject.id === args.subjectId)
  assert((transformed as { ok?: unknown }).ok === true
    && Array.isArray(transformedSubject?.position)
    && transformedSubject?.rotationYDegrees === 30
    && transformedSubject?.assetId === 'prop-ball'
    && transformedSubject?.scale === 1.25
    && transformedSubject?.color === '#38bdf8', 'expected / @ # subject transforms to persist through the canonical scene owner')
  assert((staged as { scene?: { runtime?: { stageId?: unknown }; physics?: { controllerDemo?: { terrainId?: unknown } } } }).scene?.runtime?.stageId === 'tropical-playground'
    && (staged as { scene?: { physics?: { controllerDemo?: { terrainId?: unknown } } } }).scene?.physics?.controllerDemo?.terrainId === 'tropical-playground', 'expected stage control to synchronize the canonical plan and native controller terrain atomically')
  assert((rejectedSceneEdit as { ok?: unknown }).ok === false
    && (afterRejectedEdit as { physics?: { phase?: unknown } }).physics?.phase === 'playing', 'expected rejected XR scene edits to preserve active dynamics')
  assert((attached as { ok?: unknown; scene?: { physics?: { world?: { bodies?: Record<string, unknown> } } } }).ok === true
    && Boolean((attached as { scene?: { physics?: { world?: { bodies?: Record<string, unknown> } } } }).scene?.physics?.world?.bodies?.[args.subjectId])
    && (played as { scene?: { physics?: { phase?: unknown } } }).scene?.physics?.phase === 'playing'
    && (impulse as { ok?: unknown }).ok === true
    && (stopped as { scene?: { physics?: { phase?: unknown } } }).scene?.physics?.phase === 'stopped', 'expected XR WebMCP attach/play/impulse/stop parity')
  assert((controllerStarted as { scene?: { physics?: { controllerDemo?: { phase?: unknown } } } }).scene?.physics?.controllerDemo?.phase === 'running'
    && (controllerSelected as { scene?: { physics?: { controllerDemo?: { mode?: unknown } } } }).scene?.physics?.controllerDemo?.mode === 'rocket'
    && (controllerExited as { scene?: { physics?: { controllerDemo?: { phase?: unknown } } } }).scene?.physics?.controllerDemo?.phase === 'off', 'expected XR WebMCP native controller launch/select/exit parity')
}

export function testXrSceneMcpContractCatalogSchemasAndCleanRoom(): void {
  assertCanonicalCatalogAndRuntimeDedupe()
  assertInvocationBuildersRoundTrip()
  assertWebMcpSchemasAndReadOnlyProjection()
  assertExpandedCleanRoomBoundary()
}
