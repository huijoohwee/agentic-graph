import type { CostEntry } from '../bundle/bundle-types'

export function zeroOrchestrationCost(cascadeId: string, now = new Date()): CostEntry {
  return Object.freeze({
    cascadeId,
    component: 'Reopt_Worker',
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    recordedAt: now.toISOString(),
  })
}
