export const XR_V2_PINNED_INVOCATION_SOURCE_REVISION =
  '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7' as const

export const XR_V2_INVOCATION_COMMANDS = Object.freeze({
  capture: '/xr.capture',
  author: '/xr.author',
} as const)

export const XR_V2_INVOCATION_SEMANTICS = Object.freeze({
  capabilityTier: '#xr-capability-tier',
  ecsWorld: '#ecs-world',
  nodeGraph: '#node-graph',
} as const)

export const XR_V2_INVOCATION_BINDINGS = Object.freeze({
  captureContract: '@xr-capture-contract',
  behaviorGraphContract: '@kgc-behavior-graph-contract',
  authoringRuntime: '@xr-authoring-runtime',
} as const)

export type XrV2InvocationKind = 'command' | 'semantic' | 'binding'

export type XrV2InvocationRegistration = Readonly<{
  token: string
  kind: XrV2InvocationKind
  trustBoundary: 'local' | 'read'
  tokenCost: 0
  owner:
    | 'capture-surface'
    | 'capability-detector'
    | 'ecs-core'
    | 'material-behavior-graph'
    | 'asset-contract-writer'
    | 'behavior-graph-compiler'
  typedArguments: readonly string[]
}>

/**
 * Runtime projection of the invocation register in the pinned v2.0.0 source.
 * This does not introduce an MCP/tool transport or a second global grammar
 * owner. Consumers may project these entries into the existing catalog.
 */
export const XR_V2_PINNED_INVOCATION_REGISTRY = Object.freeze([
  {
    token: XR_V2_INVOCATION_COMMANDS.capture,
    kind: 'command',
    trustBoundary: 'local',
    tokenCost: 0,
    owner: 'capture-surface',
    typedArguments: Object.freeze(['tier']),
  },
  {
    token: XR_V2_INVOCATION_COMMANDS.author,
    kind: 'command',
    trustBoundary: 'local',
    tokenCost: 0,
    owner: 'ecs-core',
    typedArguments: Object.freeze(['sceneRef']),
  },
  {
    token: XR_V2_INVOCATION_SEMANTICS.capabilityTier,
    kind: 'semantic',
    trustBoundary: 'read',
    tokenCost: 0,
    owner: 'capability-detector',
    typedArguments: Object.freeze([]),
  },
  {
    token: XR_V2_INVOCATION_SEMANTICS.ecsWorld,
    kind: 'semantic',
    trustBoundary: 'read',
    tokenCost: 0,
    owner: 'ecs-core',
    typedArguments: Object.freeze([]),
  },
  {
    token: XR_V2_INVOCATION_SEMANTICS.nodeGraph,
    kind: 'semantic',
    trustBoundary: 'read',
    tokenCost: 0,
    owner: 'material-behavior-graph',
    typedArguments: Object.freeze([]),
  },
  {
    token: XR_V2_INVOCATION_BINDINGS.captureContract,
    kind: 'binding',
    trustBoundary: 'read',
    tokenCost: 0,
    owner: 'asset-contract-writer',
    typedArguments: Object.freeze([]),
  },
  {
    token: XR_V2_INVOCATION_BINDINGS.behaviorGraphContract,
    kind: 'binding',
    trustBoundary: 'read',
    tokenCost: 0,
    owner: 'behavior-graph-compiler',
    typedArguments: Object.freeze([]),
  },
  {
    token: XR_V2_INVOCATION_BINDINGS.authoringRuntime,
    kind: 'binding',
    trustBoundary: 'read',
    tokenCost: 0,
    owner: 'ecs-core',
    typedArguments: Object.freeze([]),
  },
] satisfies readonly XrV2InvocationRegistration[])

const REGISTRATION_BY_TOKEN = new Map<string, XrV2InvocationRegistration>(
  XR_V2_PINNED_INVOCATION_REGISTRY.map(entry => [entry.token, entry]),
)

export function readXrV2InvocationRegistration(
  token: string,
): XrV2InvocationRegistration | null {
  return REGISTRATION_BY_TOKEN.get(String(token || '').trim()) || null
}
