#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
  SECRET_PATTERN_CATEGORIES,
  lineMatchesCategory,
} from './secret-patterns.mjs'

const DEFAULT_TIMEOUT_MS = 300_000
const SCAN_FAILURE_CODES = Object.freeze({
  'invalid-candidate-set': 'FC-SCAN-CANDIDATE-SET',
  'invalid-clock': 'FC-SCAN-CLOCK',
  'incomplete-coverage': 'FC-SCAN-INCOMPLETE',
  timeout: 'FC-SCAN-TIMEOUT',
})

const scanFailure = (cause, timeoutMs, unevaluatedCount) => ({
  code: SCAN_FAILURE_CODES[cause] ?? 'FC-SCAN-INCOMPLETE',
  cause,
  deadlineMs: timeoutMs,
  unevaluatedCount: Math.max(0, unevaluatedCount),
})

export function scanCandidate(files, options = {}) {
  const config = options && typeof options === 'object' ? options : {}
  const candidates = Array.isArray(files) ? files : []
  const timeoutMs = Number.isFinite(config.timeoutMs)
    ? Math.max(0, config.timeoutMs)
    : DEFAULT_TIMEOUT_MS
  const monotonicNow = typeof config.monotonicNow === 'function'
    ? config.monotonicNow
    : () => performance.now()
  const startedAtResult = readMonotonicClock(monotonicNow)
  const startedAt = startedAtResult.value
  const matches = []
  let scannedCount = 0
  let complete = Array.isArray(files) && startedAtResult.ok
  let cause = !Array.isArray(files)
    ? 'invalid-candidate-set'
    : startedAtResult.ok
      ? null
      : 'invalid-clock'

  for (let index = 0; index < candidates.length; index += 1) {
    const clock = readMonotonicClock(monotonicNow)
    if (!clock.ok) {
      complete = false
      cause = 'invalid-clock'
      break
    }
    if (clock.value - startedAt >= timeoutMs) {
      complete = false
      cause = 'timeout'
      break
    }

    const normalized = normalizeCandidate(candidates[index], index)
    if (!normalized.ok) {
      complete = false
      cause ??= 'incomplete-coverage'
      continue
    }

    const lines = normalized.content.split(/\r\n|\n|\r/u)
    lines.forEach((line, lineIndex) => {
      for (const category of SECRET_PATTERN_CATEGORIES) {
        if (lineMatchesCategory(line, category)) {
          matches.push({
            path: normalized.path,
            category,
            line: lineIndex + 1,
          })
        }
      }
    })
    scannedCount += 1

    const completedClock = readMonotonicClock(monotonicNow)
    if (!completedClock.ok) {
      complete = false
      cause = 'invalid-clock'
      break
    }
    if (completedClock.value - startedAt >= timeoutMs) {
      complete = false
      cause = 'timeout'
      break
    }
  }

  if (scannedCount !== candidates.length) {
    complete = false
    cause ??= 'incomplete-coverage'
  }

  const result = {
    complete,
    scannedCount,
    timestamp: safeTimestamp(config.now),
    matches,
  }
  if (cause) {
    result.cause = cause
    result.unevaluatedCount = Math.max(0, candidates.length - scannedCount)
    result.failure = scanFailure(cause, timeoutMs, result.unevaluatedCount)
  }
  return result
}

export async function scanCandidatePaths(paths, options = {}) {
  const config = options && typeof options === 'object' ? options : {}
  const candidatePaths = Array.isArray(paths) ? paths : []
  const timeoutMs = Number.isFinite(config.timeoutMs)
    ? Math.max(0, Number(config.timeoutMs))
    : DEFAULT_TIMEOUT_MS
  const readCandidate = typeof config.readCandidate === 'function'
    ? config.readCandidate
    : (candidatePath, readOptions) => readFile(candidatePath, readOptions)
  const hardNow = typeof config.hardNow === 'function'
    ? config.hardNow
    : () => performance.now()
  const startedAt = Number(hardNow())
  const controller = new AbortController()
  const records = Array.from({ length: candidatePaths.length }, (_, index) => ({
    path: typeof candidatePaths[index] === 'string' && candidatePaths[index].length > 0
      ? candidatePaths[index]
      : '@invalid-path',
    content: null,
  }))
  const reads = candidatePaths.map(async (candidatePath, index) => {
    if (typeof candidatePath !== 'string' || candidatePath.length === 0) {
      return
    }
    try {
      records[index] = {
        path: candidatePath,
        content: await readCandidate(candidatePath, { signal: controller.signal }),
      }
    } catch {
      records[index] = { path: candidatePath, content: null }
    }
  })

  let timer
  let timedOut = false
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('secret scan read deadline exceeded'))
      resolve()
    }, Math.max(0, Math.ceil(timeoutMs)))
  })
  await Promise.race([Promise.all(reads), deadline])
  clearTimeout(timer)

  if (timedOut) {
    const unevaluatedCount = candidatePaths.length
    return {
      complete: false,
      scannedCount: 0,
      timestamp: safeTimestamp(config.now),
      matches: [],
      cause: 'timeout',
      unevaluatedCount,
      failure: scanFailure('timeout', timeoutMs, unevaluatedCount),
    }
  }

  const elapsedMs = Math.max(0, Number(hardNow()) - startedAt)
  const remainingMs = Math.max(0, timeoutMs - elapsedMs)
  if (remainingMs <= 0 && candidatePaths.length > 0) {
    return {
      complete: false,
      scannedCount: 0,
      timestamp: safeTimestamp(config.now),
      matches: [],
      cause: 'timeout',
      unevaluatedCount: candidatePaths.length,
      failure: scanFailure('timeout', timeoutMs, candidatePaths.length),
    }
  }
  const result = scanCandidate(records, {
    ...config,
    timeoutMs: remainingMs,
  })
  if (result.failure) {
    result.failure = {
      ...result.failure,
      deadlineMs: timeoutMs,
    }
  }
  return result
}

function normalizeCandidate(candidate, index) {
  if (!candidate || typeof candidate !== 'object') return { ok: false }
  const candidatePath = typeof candidate.path === 'string' && candidate.path.length > 0
    ? candidate.path
    : `@candidate/${index}`
  const bytes = candidate.content ?? candidate.bytes
  if (typeof bytes === 'string') {
    return { ok: true, path: candidatePath, content: bytes }
  }
  if (Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) {
    return {
      ok: true,
      path: candidatePath,
      content: Buffer.from(bytes).toString('utf8'),
    }
  }
  if (bytes instanceof ArrayBuffer) {
    return {
      ok: true,
      path: candidatePath,
      content: Buffer.from(bytes).toString('utf8'),
    }
  }
  return { ok: false }
}

function safeTimestamp(now) {
  try {
    const value = typeof now === 'function' ? now() : now
    const date = value === undefined ? new Date() : new Date(value)
    if (!Number.isNaN(date.valueOf())) return date.toISOString()
  } catch {
    // A bad injected clock is a policy input failure, not a reason to throw.
  }
  return new Date(0).toISOString()
}

function readMonotonicClock(clock) {
  try {
    const value = Number(clock())
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: 0 }
  } catch {
    return { ok: false, value: 0 }
  }
}

export async function runSecretScanCli(args = process.argv.slice(2)) {
  const filePaths = []
  let timeoutMs = DEFAULT_TIMEOUT_MS
  for (const argument of args) {
    if (argument.startsWith('--timeout-ms=')) {
      timeoutMs = Number(argument.slice('--timeout-ms='.length))
    } else {
      filePaths.push(argument)
    }
  }

  const result = await scanCandidatePaths(filePaths, { timeoutMs })
  console.log(JSON.stringify(result))
  return result.complete && result.matches.length === 0 ? 0 : 1
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  process.exitCode = await runSecretScanCli()
}
