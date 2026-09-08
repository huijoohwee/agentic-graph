import { readCurrentRunningTest } from '@/tests/runner/execTest'

export function testRunnerElapsedTimeIgnoresWallClockChanges(): void {
  const before = readCurrentRunningTest()
  if (!before) throw new Error('expected an active native registry case')
  const originalNow = Date.now
  try {
    for (const wallTime of [before.startedAt + 31_536_000_000, 0]) {
      Date.now = () => wallTime
      const current = readCurrentRunningTest()
      if (!current || current.name !== before.name || current.startedAt !== before.startedAt) {
        throw new Error('wall-clock changes must preserve active-case identity and timestamp')
      }
      if (!Number.isFinite(current.elapsedMs) || current.elapsedMs < before.elapsedMs || current.elapsedMs > before.elapsedMs + 10_000) {
        throw new Error(`wall-clock changes corrupted elapsed duration: ${current.elapsedMs}`)
      }
    }
  } finally {
    Date.now = originalNow
  }
}
