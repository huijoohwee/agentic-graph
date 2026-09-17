/** Sequential browser checkpoints, measured in the verifier process, not the mocked page clock. */
import { performance } from 'node:perf_hooks'
export function createMissionPhaseObservation({ now = () => performance.now(), out = console.log } = {}) {
  const started = now(), stages = []
  let previous = started
  return {
    checkpoint(label) {
      if (stages.length >= 32 || typeof label !== 'string' || !label || label.length > 160)
        throw Error('Invalid mission checkpoint')
      const end = now()
      if (!Number.isFinite(end) || end < previous) throw Error('Invalid mission observation clock')
      const stage = Object.freeze({ label, offsetMs: previous - started, elapsedMs: end - previous })
      stages.push(stage); previous = end
      out('Mission checkpoint: ' + JSON.stringify(stage))
    },
    snapshot() {
      return { authority: false, scope: 'sequential-verifier-checkpoints', clock: 'host-monotonic',
        cpuMs: null, peakMemoryBytes: null, tokens: null, costUsd: null, stages: [...stages] }
    },
  }
}
