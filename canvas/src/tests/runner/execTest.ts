import { ensureTestEnvPolyfills } from '../env/polyfills'
import { resetCanvasTestRuntime } from '../lib/resetCanvasTestRuntime'
import { disposeRemainingReactRoots } from '../lib/reactRootLifecycle'
import type { TestResult } from './testRunnerTypes'

let cachedFilterLower: string | null | undefined
let cachedTimeoutMs: number | undefined
let currentRunningTestName = ''
let currentRunningTestStartedAt = 0

const readFilterLower = () => {
  if (cachedFilterLower !== undefined) return cachedFilterLower
  const filter = process.argv.slice(2).find(arg => !arg.startsWith('-'))
  cachedFilterLower = filter ? filter.toLowerCase() : null
  return cachedFilterLower
}

const readTimeoutMs = () => {
  if (cachedTimeoutMs !== undefined) return cachedTimeoutMs
  const raw = Number(process.env.AG_TEST_CASE_TIMEOUT_MS)
  cachedTimeoutMs =
    Number.isFinite(raw) && raw > 1_000 ? Math.max(5_000, Math.min(10 * 60_000, Math.floor(raw))) : 120_000
  return cachedTimeoutMs
}

export const readCurrentRunningTest = (): { name: string; startedAt: number; elapsedMs: number } | null => {
  if (!currentRunningTestName || !currentRunningTestStartedAt) return null
  return {
    name: currentRunningTestName,
    startedAt: currentRunningTestStartedAt,
    elapsedMs: Math.max(0, Date.now() - currentRunningTestStartedAt),
  }
}

const setCurrentRunningTest = (name: string) => {
  currentRunningTestName = String(name || '')
  currentRunningTestStartedAt = currentRunningTestName ? Date.now() : 0
}

const clearCurrentRunningTest = () => {
  currentRunningTestName = ''
  currentRunningTestStartedAt = 0
}

export const execTest = async (results: TestResult[], name: string, fn: () => void | Promise<void>) => {
  const filterLower = readFilterLower()
  if (filterLower && !name.toLowerCase().includes(filterLower)) return

  const startedAt = Date.now()
  const errors: unknown[] = []
  const message = (error: unknown) => String((error as { message?: unknown } | null)?.message ?? error)
  const recordError = (error: unknown) => {
    errors.push(error)
    console.log(`FAIL ${name} — ${message(error)}`)
  }
  try {
    ensureTestEnvPolyfills()
    console.log(`RUN ${name}`)
    setCurrentRunningTest(name)
    const timeoutMs = readTimeoutMs()
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let heartbeatId: ReturnType<typeof setInterval> | null = null

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs)
    })

    try {
      heartbeatId = setInterval(() => {
        const elapsedMs = Date.now() - startedAt
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000))
        console.log(`RUNNING ${name} (${elapsedSec}s)`)
      }, 15_000)
      await Promise.race([Promise.resolve().then(fn), timeoutPromise])
    } finally {
      if (heartbeatId != null) clearInterval(heartbeatId)
      if (timeoutId != null) clearTimeout(timeoutId)
    }

  } catch (error) { recordError(error) }
  finally {
    // Mounted subscribers must leave before reset mutates the store and DOM.
    try { await disposeRemainingReactRoots() } catch (error) { recordError(error) }
    try { resetCanvasTestRuntime() } catch (error) { recordError(error) }
    clearCurrentRunningTest()
  }

  if (errors.length) {
    const msg = errors.map(message).join('; ')
    console.log(`DONE ${name} (error)`)
    results.push({ name, ok: false, error: msg })
  } else {
    console.log(`DONE ${name} (${Date.now() - startedAt}ms)`)
    results.push({ name, ok: true })
  }
}
