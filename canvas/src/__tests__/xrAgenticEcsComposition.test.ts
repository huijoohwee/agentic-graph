import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildKnowgrphAgentReadyToolContracts,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import {
  CAMERA_INVOCATION_BINDINGS,
  CAMERA_INVOCATION_COMMANDS,
  CAMERA_INVOCATION_SEMANTICS,
} from '@/features/strybldr/cameraMcpContract.mjs'
import {
  MOTION_CONTROL_INVOCATION_BINDINGS,
  MOTION_CONTROL_INVOCATION_COMMANDS,
  MOTION_CONTROL_INVOCATION_SEMANTICS,
} from '@/features/three/motionControlMcpContract.mjs'
import {
  XR_ANIMATION_INVOCATION_BINDINGS,
  XR_ANIMATION_INVOCATION_COMMANDS,
  XR_ANIMATION_INVOCATION_SEMANTICS,
} from '@/features/three/xrAnimationMcpContract.mjs'
import {
  XR_SCENE_INVOCATION_BINDINGS,
  XR_SCENE_INVOCATION_COMMANDS,
  XR_SCENE_INVOCATION_SEMANTICS,
} from '@/features/three/xrSceneMcpContract.mjs'
import { KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID } from '@/lib/storage/knowgrphStorageSyncContract'
import { AGENTIC_CANVAS_OS_DOCS_KIND_FILES } from '../../../mcp/agentic-canvas-os-docs-contract.mjs'
import { resolveAgenticCanvasOsDocsRoot } from '../../../mcp/agentic-canvas-os-docs-runtime.js'
import {
  ECS_INVOCATION_GRAMMAR,
  ECS_TOOL_NAMES,
  buildEcsLocalToolDefinitions,
} from '../../../mcp/ecs-tool-contract.js'

type LocalToolDefinition = Readonly<{
  name: string
  description?: string
}>

type WebMcpContract = Readonly<{
  name: string
  webName: string
}>

const EXPECTED_ECS_INVOCATIONS = Object.freeze({
  [KNOWGRPH_LOCAL_MCP_TOOL_NAMES.ecsSessionStart]: '/ecs.session-start #agentic-ecs @source.frontmatter',
  [KNOWGRPH_LOCAL_MCP_TOOL_NAMES.ecsWorldTick]: '/ecs.world-tick #agentic-ecs @ecs-session',
  [KNOWGRPH_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist]: '/ecs.decision-persist #agentic-ecs @ecs-session',
})

const EXPECTED_XR_BROWSER_WEB_MCP_TOOLS = Object.freeze([
  'knowgrph.inspect_local_xr_scene_assets',
  'knowgrph.control_local_xr_scene',
  'knowgrph.inspect_local_animation',
  'knowgrph.control_local_animation',
  'knowgrph.inspect_local_motion_control',
  'knowgrph.control_local_motion_control',
  'knowgrph.inspect_local_game_mode',
  'knowgrph.control_local_game_mode',
  'knowgrph.inspect_local_flight_sim',
  'knowgrph.control_local_flight_sim',
])

function assertSameValues(actual: readonly string[], expected: readonly string[], label: string): void {
  const sortedActual = [...actual].sort()
  const sortedExpected = [...expected].sort()
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`expected ${label} to equal ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(sortedActual)}`)
  }
}

const dictionaryTokens = (dictionary: unknown): readonly string[] => (
  Object.values((dictionary || {}) as Record<string, unknown>).map(String)
)

function assertSourceDictionaryOwnsToken(docsRoot: string, token: string): void {
  const kind = token.startsWith('/')
    ? 'command'
    : token.startsWith('#')
      ? 'semantic'
      : token.startsWith('@')
        ? 'binding'
        : null
  if (!kind) throw new Error(`unsupported canonical invocation token: ${token}`)
  const fileName = AGENTIC_CANVAS_OS_DOCS_KIND_FILES[kind]
  const source = readFileSync(resolve(docsRoot, fileName), 'utf8')
  if (!source.includes(`  - "${token}"`) || !source.includes(`| \`${token}\` |`)) {
    throw new Error(`expected source-backed ${fileName} frontmatter and body to own ${token}`)
  }
}

function readProductionEcsOwnerSources(repositoryRoot: string): readonly Readonly<{ path: string; source: string }>[] {
  const ecsRoot = resolve(repositoryRoot, 'ecs')
  const corePaths = readdirSync(ecsRoot)
    .filter(fileName => fileName.endsWith('.js'))
    .map(fileName => resolve(ecsRoot, fileName))
  const mcpRoot = resolve(repositoryRoot, 'mcp')
  const mcpPaths = readdirSync(mcpRoot)
    .filter(fileName => fileName.startsWith('ecs-') && fileName.endsWith('.js'))
    .map(fileName => resolve(mcpRoot, fileName))
  const projectionPath = resolve(repositoryRoot, 'canvas', 'src', 'features', 'agentic-ecs', 'agenticEcsCanvasProjection.ts')
  return [...corePaths, ...mcpPaths, projectionPath].map(path => ({ path, source: readFileSync(path, 'utf8') }))
}

function assertEcsOwnersDoNotImportXrOrPhysics(repositoryRoot: string): void {
  const importSpecifierPattern = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g
  const xrOrPhysicsPathPattern = /features\/three|(?:^|[\/_.-])(?:xr|physics)(?:$|[\/_.-])/i
  for (const owner of readProductionEcsOwnerSources(repositoryRoot)) {
    for (const match of owner.source.matchAll(importSpecifierPattern)) {
      const specifier = match[1] || ''
      if (xrOrPhysicsPathPattern.test(specifier)) {
        throw new Error(`expected ECS composition boundary to exclude XR/physics import ${specifier} in ${owner.path}`)
      }
    }
  }
}

export function testXrAgenticEcsCompositionBoundaryRemainsExplicit(): void {
  const repositoryRoot = resolve(process.cwd(), '..')
  const ecsDocument = readFileSync(
    resolve(repositoryRoot, 'docs', 'documents', 'knowgrph-agentic-entity-component-system-prd-tad.md'),
    'utf8',
  )
  if (!/The ECS is not a game engine[^.]*renderer[^.]*\./.test(ecsDocument)
    || !ecsDocument.includes('is not wired into the private three-tool MCP session')) {
    throw new Error('expected the ECS contract to keep engine/renderer ownership and private-session Canvas projection explicitly out of scope')
  }

  const expectedEcsEntries = Object.entries(EXPECTED_ECS_INVOCATIONS)
  assertSameValues(ECS_TOOL_NAMES, expectedEcsEntries.map(([toolName]) => toolName), 'ECS stdio tool names')
  for (const [toolName, invocation] of expectedEcsEntries) {
    if (ECS_INVOCATION_GRAMMAR[toolName] !== invocation) {
      throw new Error(`expected ${toolName} to retain exact stdio invocation ${invocation}`)
    }
  }
  const ecsDefinitions = buildEcsLocalToolDefinitions() as readonly LocalToolDefinition[]
  assertSameValues(ecsDefinitions.map(definition => definition.name), ECS_TOOL_NAMES, 'ECS stdio definitions')
  ecsDefinitions.forEach(definition => {
    const invocation = ECS_INVOCATION_GRAMMAR[definition.name]
    if (!invocation || !definition.description?.includes(invocation)) {
      throw new Error(`expected ${definition.name} definition to expose its canonical stdio invocation`)
    }
  })
  const localToolContract = readFileSync(resolve(repositoryRoot, 'mcp', 'local-tool-contract.js'), 'utf8')
  if (!localToolContract.includes('...buildEcsLocalToolDefinitions(')) {
    throw new Error('expected the local stdio MCP registry to compose the three ECS tool definitions')
  }

  const projectionPath = resolve(repositoryRoot, 'canvas', 'src', 'features', 'agentic-ecs', 'agenticEcsCanvasProjection.ts')
  const projectionSource = readFileSync(projectionPath, 'utf8')
  if (!projectionSource.includes('projectWorldToCanvas')
    || !projectionSource.includes('applyChatKgcDocumentTextToCanvas')) {
    throw new Error('expected the ECS Canvas projection to reuse the read-only rendering layer and canonical KGC text apply seam')
  }
  for (const privateSessionImport of ['ecs-runtime', 'ecs-session-store']) {
    if (projectionSource.includes(privateSessionImport)) {
      throw new Error(`expected Canvas projection to remain disconnected from the private MCP session lane: ${privateSessionImport}`)
    }
  }
  const privateSessionSource = [
    'ecs-runtime.js',
    'ecs-session-store.js',
  ].map(fileName => readFileSync(resolve(repositoryRoot, 'mcp', fileName), 'utf8')).join('\n')
  for (const canvasProjectionOwner of ['agenticEcsCanvasProjection', 'applyChatKgcDocumentTextToCanvas']) {
    if (privateSessionSource.includes(canvasProjectionOwner)) {
      throw new Error(`expected private ECS MCP sessions not to own Canvas projection through ${canvasProjectionOwner}`)
    }
  }
  assertEcsOwnersDoNotImportXrOrPhysics(repositoryRoot)

  const browserContracts = buildKnowgrphAgentReadyToolContracts({
    defaultWorkspaceId: KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
    includeBrowserOnlyTools: true,
  }) as readonly WebMcpContract[]
  const ecsBrowserTools = browserContracts.filter(contract => (
    contract.webName.startsWith('knowgrph.ecs') || contract.name.startsWith('ecs.')
  ))
  if (ecsBrowserTools.length) {
    throw new Error(`expected Agentic ECS to remain stdio-only, got browser WebMCP tools ${JSON.stringify(ecsBrowserTools)}`)
  }
  const xrBrowserToolNames = browserContracts
    .map(contract => contract.webName)
    .filter(webName => EXPECTED_XR_BROWSER_WEB_MCP_TOOLS.includes(webName))
  assertSameValues(xrBrowserToolNames, EXPECTED_XR_BROWSER_WEB_MCP_TOOLS, 'XR, Animation, Motion Control, Game Mode, and Flight Sim browser WebMCP tools')
  const webMcpRuntimeSource = readFileSync(
    resolve(repositoryRoot, 'canvas', 'src', 'features', 'agent-ready', 'webMcpRuntime.ts'),
    'utf8',
  )
  for (const builder of [
    'XR_SCENE_WEB_MCP_TOOL_BUILDERS',
    'XR_ANIMATION_WEB_MCP_TOOL_BUILDERS',
    'MOTION_CONTROL_WEB_MCP_TOOL_BUILDERS',
    'GAME_MODE_WEB_MCP_TOOL_BUILDERS',
    'FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS',
  ]) {
    if (!webMcpRuntimeSource.includes(`...${builder}`)) {
      throw new Error(`expected browser WebMCP runtime to register ${builder}`)
    }
  }

  const newlyCanonicalXrTokens = new Set<string>([
    String(CAMERA_INVOCATION_COMMANDS.select),
    ...dictionaryTokens(XR_SCENE_INVOCATION_COMMANDS),
    ...dictionaryTokens(XR_SCENE_INVOCATION_SEMANTICS),
    String(XR_SCENE_INVOCATION_BINDINGS.scene),
  ])
  if (newlyCanonicalXrTokens.size !== 15) {
    throw new Error(`expected the protected Agentic Canvas OS revision to add exactly fifteen Camera/XR tokens, got ${newlyCanonicalXrTokens.size}`)
  }
  const sourceBackedTokens = new Set<string>([
    ...expectedEcsEntries.flatMap(([, invocation]) => invocation.split(/\s+/).filter(token => /^[\/#@]/.test(token))),
    ...dictionaryTokens(CAMERA_INVOCATION_COMMANDS),
    ...dictionaryTokens(CAMERA_INVOCATION_SEMANTICS),
    ...dictionaryTokens(CAMERA_INVOCATION_BINDINGS),
    ...dictionaryTokens(XR_SCENE_INVOCATION_COMMANDS),
    ...dictionaryTokens(XR_SCENE_INVOCATION_SEMANTICS),
    ...dictionaryTokens(XR_SCENE_INVOCATION_BINDINGS),
    ...dictionaryTokens(XR_ANIMATION_INVOCATION_COMMANDS),
    ...dictionaryTokens(XR_ANIMATION_INVOCATION_SEMANTICS),
    ...dictionaryTokens(XR_ANIMATION_INVOCATION_BINDINGS),
    ...dictionaryTokens(MOTION_CONTROL_INVOCATION_COMMANDS),
    ...dictionaryTokens(MOTION_CONTROL_INVOCATION_SEMANTICS),
    ...dictionaryTokens(MOTION_CONTROL_INVOCATION_BINDINGS),
  ])
  const docsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: process.cwd(), env: process.env })
  sourceBackedTokens.forEach(token => assertSourceDictionaryOwnsToken(docsRoot, token))
}
