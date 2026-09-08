import { ensureTestEnvPolyfills } from '../env/polyfills'
import { resetCanvasTestRuntime } from '../lib/resetCanvasTestRuntime'
import { disposeRemainingReactRoots } from '../lib/reactRootLifecycle'
import type { TestResult } from './testRunnerTypes'

// Capture the host clock before fixtures replace browser globals or wall time.
export const readTestMonotonicTime = globalThis.performance.now.bind(globalThis.performance)

let cachedFilters: readonly string[] | undefined
let cachedTimeoutMs: number | undefined
let currentRunningTestName = ''
let currentRunningTestStartedAt = 0
let currentRunningTestElapsedStart = 0

export const readTestFilters = (): readonly string[] => {
  if (cachedFilters) return cachedFilters
  const filters = process.argv.slice(2).filter(arg => !arg.startsWith('-'))
  if (filters.length > 32 || filters.reduce((bytes, value) => bytes + new TextEncoder().encode(value).byteLength, 0) > 32_768
    || filters.some(value => !value.trim())) throw new Error('Expected at most 32 nonempty test filters within 32 KiB')
  cachedFilters = Object.freeze([...new Set(filters.map(value => value.trim().toLowerCase()))])
  return cachedFilters
}

const readTimeoutMs = () => {
  if (cachedTimeoutMs !== undefined) return cachedTimeoutMs
  const raw = Number(process.env.AG_TEST_CASE_TIMEOUT_MS)
  cachedTimeoutMs =
    Number.isFinite(raw) && raw > 1_000 ? Math.max(5_000, Math.min(10 * 60_000, Math.floor(raw))) : 120_000
  return cachedTimeoutMs
}

export const readCurrentRunningTest = (): { name: string; startedAt: number; elapsedMs: number } | null => {
  if (!currentRunningTestName) return null
  return {
    name: currentRunningTestName,
    startedAt: currentRunningTestStartedAt,
    elapsedMs: Math.max(0, Math.round(readTestMonotonicTime() - currentRunningTestElapsedStart)),
  }
}

const setCurrentRunningTest = (name: string) => {
  currentRunningTestName = String(name || '')
  currentRunningTestStartedAt = currentRunningTestName ? Date.now() : 0
  currentRunningTestElapsedStart = readTestMonotonicTime()
}

const clearCurrentRunningTest = () => {
  currentRunningTestName = ''
  currentRunningTestStartedAt = 0
  currentRunningTestElapsedStart = 0
}

export const execTest = async (results: TestResult[], name: string, fn: () => void | Promise<void>) => {
  const filters = readTestFilters()
  if (filters.length && !filters.some(filter => name.toLowerCase().includes(filter))) return

  const startedAt = readTestMonotonicTime()
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
        const elapsedMs = readTestMonotonicTime() - startedAt
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
    console.log(`DONE ${name} (${Math.max(0, Math.round(readTestMonotonicTime() - startedAt))}ms)`)
    results.push({ name, ok: true })
  }
}
