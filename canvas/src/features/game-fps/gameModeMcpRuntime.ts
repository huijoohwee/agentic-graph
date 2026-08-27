import {
  queueGameFpsFire,
  readGameFpsSnapshot,
  reloadGameFpsWeapon,
} from './gameFpsRuntime'
import {
  GAME_FPS_SAVE_PATH,
  readGameFpsDecisionStore,
} from './gameFpsDecisionStore'
import {
  armGameModeSimulation,
  exitGameModeSurface,
  openGameModeSurface,
  persistGameModePendingDecisions,
  readGameModeSnapshot,
  restartGameMode,
  startGameMode,
  stopGameMode,
} from './gameModeRuntime'
import {
  GAME_MODE_INVOCATION_BINDINGS,
  GAME_MODE_INVOCATION_COMMANDS,
  GAME_MODE_INVOCATION_SEMANTICS,
  GAME_MODE_MCP_SCHEMA,
  GAME_MODE_WEB_MCP_TOOL_IDS,
} from './gameModeMcpContract.mjs'

export type GameModeOperation = 'open' | 'start' | 'stop' | 'restart' | 'fire' | 'reload' | 'save' | 'exit'
export type GameModeControlInput = Readonly<{
  invocation?: string
  operation?: GameModeOperation
}>

type NormalizedGameModeControl = Readonly<{
  invocation: string
  operation: GameModeOperation
}>

const GAME_MODE_OPERATIONS = new Set<GameModeOperation>([
  'open', 'start', 'stop', 'restart', 'fire', 'reload', 'save', 'exit',
])

export function buildGameModeInvocation(operation: GameModeOperation): string {
  return `${GAME_MODE_INVOCATION_COMMANDS.control} ${GAME_MODE_INVOCATION_BINDINGS.canvas} ${GAME_MODE_INVOCATION_SEMANTICS.gameplay} operation=${operation}`
}

function parseGameModeInvocation(value: unknown): NormalizedGameModeControl | null {
  const invocation = String(value || '').trim()
  if (!invocation) return null
  const tokens = invocation.split(/\s+/).filter(Boolean)
  const commandTokens = tokens.filter(token => token.startsWith('/'))
  const bindingTokens = tokens.filter(token => token.startsWith('@'))
  const semanticTokens = tokens.filter(token => token.startsWith('#'))
  if (commandTokens.length !== 1 || commandTokens[0] !== GAME_MODE_INVOCATION_COMMANDS.control) return null
  if (bindingTokens.length !== 1 || bindingTokens[0] !== GAME_MODE_INVOCATION_BINDINGS.canvas) return null
  if (semanticTokens.length !== 1 || semanticTokens[0] !== GAME_MODE_INVOCATION_SEMANTICS.gameplay) return null
  const pairs: Record<string, string> = {}
  for (const token of tokens.slice(1).filter(token => !token.startsWith('@') && !token.startsWith('#'))) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) return null
    const key = token.slice(0, separator)
    if (key !== 'operation' || Object.hasOwn(pairs, key)) return null
    pairs[key] = token.slice(separator + 1)
  }
  const operation = pairs.operation as GameModeOperation
  return GAME_MODE_OPERATIONS.has(operation) ? { invocation, operation } : null
}

function normalizeGameModeControl(input: GameModeControlInput): NormalizedGameModeControl | null {
  if (input.invocation !== undefined) {
    if (Object.keys(input).length !== 1) return null
    return parseGameModeInvocation(input.invocation)
  }
  if (Object.keys(input).some(key => key !== 'operation')) return null
  const operation = input.operation
  return operation && GAME_MODE_OPERATIONS.has(operation)
    ? { invocation: '', operation }
    : null
}

export function inspectLocalGameMode() {
  const gameMode = readGameModeSnapshot()
  const mission = readGameFpsSnapshot()
  const decisions = readGameFpsDecisionStore()
  return {
    schema: GAME_MODE_MCP_SCHEMA,
    webMcpTools: {
      inspect: `agenticgraph.${GAME_MODE_WEB_MCP_TOOL_IDS.inspect}`,
      control: `agenticgraph.${GAME_MODE_WEB_MCP_TOOL_IDS.control}`,
    },
    invocationGrammar: Object.fromEntries(
      [...GAME_MODE_OPERATIONS].map(operation => [operation, buildGameModeInvocation(operation)]),
    ),
    gameMode,
    mission,
    decisions: { ...decisions, path: GAME_FPS_SAVE_PATH },
    runtime: {
      webglSupported: gameMode.webglSupported,
      rendererOwner: 'existing-r3f-canvas',
      simulationOwner: 'native-agentic-ecs',
      persistenceOwner: 'browser-local-workspace-fs',
      npcActions: ['hold', 'alert', 'engage', 'flee'],
      hitscan: 'normalized-slab-aabb',
      controls: ['desktop', 'pointer', 'touch', 'motion-control'],
    },
  }
}

export async function controlLocalGameMode(input: GameModeControlInput) {
  const control = normalizeGameModeControl(input)
  if (!control) {
    return { ok: false, message: 'Use a supported structured operation or native /game.mode @canvas #gameplay invocation.' }
  }
  if (control.operation === 'open') {
    const opened = openGameModeSurface()
    return { ok: opened, message: readGameModeSnapshot().message, operation: control.operation, game: inspectLocalGameMode() }
  }
  if (control.operation === 'start') {
    const result = await startGameMode()
    return { ok: result.launchStatus === 'ready', message: result.message, operation: control.operation, game: inspectLocalGameMode() }
  }
  if (control.operation === 'stop') {
    const gameMode = readGameModeSnapshot()
    const mission = readGameFpsSnapshot()
    if (!gameMode.active || mission.phase === 'stopped') {
      return { ok: false, message: 'Stop requires an active Game Mode mission.', operation: control.operation, game: inspectLocalGameMode() }
    }
    const result = stopGameMode()
    return { ok: true, message: result.message, operation: control.operation, game: inspectLocalGameMode() }
  }
  if (control.operation === 'restart') {
    const result = await restartGameMode()
    return { ok: result.launchStatus === 'ready', message: result.message, operation: control.operation, game: inspectLocalGameMode() }
  }
  if (control.operation === 'exit') {
    if (!readGameModeSnapshot().active) {
      return { ok: false, message: 'Exit requires an active Game Mode surface.', operation: control.operation, game: inspectLocalGameMode() }
    }
    const result = exitGameModeSurface()
    return { ok: true, message: result.message, operation: control.operation, game: inspectLocalGameMode() }
  }
  const mission = readGameFpsSnapshot()
  if (control.operation === 'save') {
    if (mission.phase !== 'won' && mission.phase !== 'lost') {
      return { ok: false, message: 'Decision persistence is available only after a terminal mission result.', operation: control.operation, game: inspectLocalGameMode() }
    }
    const saved = await persistGameModePendingDecisions()
    return { ok: saved.status === 'saved', message: saved.status === 'saved' ? 'Validated Game Mode Decisions saved locally.' : saved.error || 'Decision save failed.', operation: control.operation, game: inspectLocalGameMode() }
  }
  if (mission.phase !== 'playing' || mission.runtimeError) {
    return { ok: false, message: 'Start a healthy Game Mode mission before using weapon controls.', operation: control.operation, game: inspectLocalGameMode() }
  }
  armGameModeSimulation()
  if (control.operation === 'fire') queueGameFpsFire()
  else reloadGameFpsWeapon()
  return { ok: true, message: control.operation === 'fire' ? 'Fire queued for the next fixed ECS tick.' : 'Reload queued for the next fixed ECS tick.', operation: control.operation, game: inspectLocalGameMode() }
}
