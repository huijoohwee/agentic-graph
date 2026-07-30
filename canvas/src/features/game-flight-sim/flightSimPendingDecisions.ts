import type { FlightSimDecisionRecord } from './flightSimModel'

export type FlightSimPendingDecisionIndex = Readonly<{
  values: () => readonly FlightSimDecisionRecord[]
  retain: (decision: FlightSimDecisionRecord) => void
  acknowledge: (ids: readonly string[]) => void
  discardRun: (runId: number) => void
  clear: () => void
}>

export function createFlightSimPendingDecisionIndex(
  freezeDecision: (decision: FlightSimDecisionRecord) => FlightSimDecisionRecord,
): FlightSimPendingDecisionIndex {
  const pending = new Map<string, FlightSimDecisionRecord>()
  const flightStateIdByRun = new Map<number, string>()
  return Object.freeze({
    values: () => Object.freeze([...pending.values()]),
    retain(value) {
      const decision = freezeDecision(value)
      if (decision.payload.event === 'flight_state') {
        const runId = Number(decision.payload.runId)
        const previousId = flightStateIdByRun.get(runId)
        if (previousId) pending.delete(previousId)
        flightStateIdByRun.set(runId, decision.decisionId)
      }
      pending.set(decision.decisionId, decision)
    },
    acknowledge(ids) {
      for (const id of ids) {
        const decision = pending.get(id)
        pending.delete(id)
        if (decision?.payload.event !== 'flight_state') continue
        const runId = Number(decision.payload.runId)
        if (flightStateIdByRun.get(runId) === id) flightStateIdByRun.delete(runId)
      }
    },
    discardRun(runId) {
      for (const [id, decision] of pending) {
        if (Number(decision.payload.runId) === runId) pending.delete(id)
      }
      flightStateIdByRun.delete(runId)
    },
    clear() {
      pending.clear()
      flightStateIdByRun.clear()
    },
  })
}
