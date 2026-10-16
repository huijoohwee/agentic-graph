import {
  GAME_FPS_NPC_ACTIONS,
  type GameFpsNpcAction,
} from './gameFpsModel'

export type GameFpsNpcUtilityObservation = Readonly<{
  health: number
  playerDistance: number
  lineOfSight: boolean
}>

export type GameFpsNpcUtilityScores = Readonly<Record<GameFpsNpcAction, number>>

export const GAME_FPS_NPC_ENGAGE_DISTANCE_METERS = 3

export function scoreGameFpsNpcActions(
  observation: GameFpsNpcUtilityObservation,
): GameFpsNpcUtilityScores {
  return Object.freeze({
    hold: observation.playerDistance >= 17 ? 3 : 0,
    alert: observation.playerDistance <= 17 ? 3 : 0,
    engage: observation.lineOfSight
      && observation.playerDistance <= GAME_FPS_NPC_ENGAGE_DISTANCE_METERS
      ? 4
      : 0,
    flee: observation.health <= 35 ? 5 : 0,
  })
}

export function selectGameFpsNpcAction(scores: GameFpsNpcUtilityScores): GameFpsNpcAction {
  let selected: GameFpsNpcAction = GAME_FPS_NPC_ACTIONS[0]
  for (const action of GAME_FPS_NPC_ACTIONS.slice(1)) {
    if (scores[action] > scores[selected]) selected = action
  }
  return selected
}
