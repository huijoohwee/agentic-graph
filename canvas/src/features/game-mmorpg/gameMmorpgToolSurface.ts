import {
  createGameOsLocalWorldToolController,
  type GameOsLocalWorldToolControllerOptions,
  type GameOsOperationResult,
  type GameOsOrder,
  type GameOsReviewedWorldControlRequest,
  type GameOsStatusResponse,
  type GameOsToolIdentity,
  type GameOsToolInput,
  type GameOsWorldLease,
  type GameOsWorldState,
} from '../../../../grph-shared/src/game-os/index.js'
import type { GameMmorpgCore } from './gameMmorpgCore'

export type GameMmorpgEmbeddedTool = {
  readonly identity: GameOsToolIdentity
  readonly name: string
  readonly title: string
  readonly description: string
  readonly destructive: boolean
  readonly annotations: Readonly<Record<string, boolean>>
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly outputSchema: Readonly<Record<string, unknown>>
  execute(input?: GameOsToolInput): Promise<GameOsStatusResponse | GameOsOperationResult>
}

export type GameMmorpgEmbeddedToolSurface = {
  readonly tools: readonly GameMmorpgEmbeddedTool[]
  invoke(
    identity: GameOsToolIdentity,
    input?: GameOsToolInput,
  ): Promise<GameOsStatusResponse | GameOsOperationResult>
  controlReviewedWorld(request: GameOsReviewedWorldControlRequest): Promise<GameOsOperationResult>
  commitOrders(
    worldId: string,
    orders: readonly GameOsOrder[],
    nowMs?: number,
  ): Promise<GameOsWorldState>
  renewActive(nowMs?: number, ttlMs?: number): Promise<GameOsWorldLease>
  dispose(): Promise<void>
}

export const createGameMmorpgEmbeddedToolSurface = (
  core: GameMmorpgCore,
  options: GameOsLocalWorldToolControllerOptions = {},
): GameMmorpgEmbeddedToolSurface => {
  const controller = createGameOsLocalWorldToolController(core, options)
  const tools = controller.declarations.map(declaration => Object.freeze({
    identity: declaration.identity,
    name: declaration.name,
    title: declaration.title,
    description: declaration.description,
    destructive: declaration.destructive,
    annotations: declaration.annotations,
    inputSchema: declaration.inputSchema,
    outputSchema: declaration.outputSchema,
    execute: (input?: GameOsToolInput) => controller.invoke(declaration.identity, input),
  })) as readonly GameMmorpgEmbeddedTool[]
  return Object.freeze({
    tools: Object.freeze(tools),
    invoke: controller.invoke,
    controlReviewedWorld: controller.controlReviewedWorld,
    commitOrders: controller.commitOrders,
    renewActive: controller.renewActive,
    dispose: controller.dispose,
  })
}
