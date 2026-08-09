import type { GameOsJsonValue } from './types.js'

export class GameOsDigestMismatch extends Error {
  constructor(
    reason: string,
    readonly expectedDigest: string,
    readonly actualDigest: string,
  ) {
    super(reason)
  }
}

export const gameOsDigestMismatch = (
  reason: string,
  expectedDigest: string,
  actualDigest: string,
): never => { throw new GameOsDigestMismatch(reason, expectedDigest, actualDigest) }

export const gameOsRecoveryDetails = (
  worldId: string,
  mismatch?: GameOsDigestMismatch,
): Record<string, GameOsJsonValue> => ({
  recordId: `world:${worldId}`,
  ...(mismatch ? {
    expectedDigest: mismatch.expectedDigest,
    actualDigest: mismatch.actualDigest,
  } : {}),
  resetAction: { route: '/world', operation: 'reset', worldId },
  inspectionAction: {
    tool: 'knowgrph.inspect_game_os',
    view: 'world_continuity',
    worldId,
    readOnly: true,
  },
})
