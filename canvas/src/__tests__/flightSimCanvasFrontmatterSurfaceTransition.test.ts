import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCanvasFrontmatterSurfaceTransitionQueue,
  requestCanvasFrontmatterGeospatialSurface,
  waitForActiveCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import {
  setGeospatialModeEnabled,
} from 'gympgrph'

const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve))

function deferred() {
  let resolvePromise: () => void = () => void 0
  const promise = new Promise<void>(resolve => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

test('frontmatter surface requests serialize Geo off before a following Flight Geo enable', async () => {
  const disposal = deferred()
  const commits: boolean[] = []
  let committedMode = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      if (options.isCurrent?.() === false) return
      commits.push(enabled)
      if (!enabled) await disposal.promise
      committedMode = enabled
      if (options.isCurrent?.() === false) return
      await options.afterCommit?.()
    },
    isCommitted: enabled => committedMode === enabled,
  })

  const disable = transitions.request(false)
  const joinedDisable = transitions.request(false)
  const enable = transitions.request(true)
  await flushMicrotasks()

  assert.equal(joinedDisable, disable)
  assert.deepEqual(commits, [false])

  disposal.resolve()
  await disable
  await flushMicrotasks()
  assert.deepEqual(
    commits,
    [false, true],
    'Flight Geo enable must not overtake the exclusive XR disposal',
  )
  await enable
  await transitions.wait()
  assert.equal(committedMode, true)
})

test('a failed frontmatter surface transition fails its queued successor closed', async () => {
  const commits: boolean[] = []
  let failDisable = true
  let committedMode = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      if (options.isCurrent?.() === false) return
      commits.push(enabled)
      if (!enabled && failDisable) throw new Error('disposal failed')
      committedMode = enabled
      if (options.isCurrent?.() === false) return
      await options.afterCommit?.()
    },
    isCommitted: enabled => committedMode === enabled,
  })

  const disable = transitions.request(false)
  const enable = transitions.request(true)
  await assert.rejects(disable, /disposal failed/)
  await assert.rejects(enable, /disposal failed/)
  assert.deepEqual(commits, [false])
  assert.equal(committedMode, true)

  failDisable = false
  await transitions.request(false)
  assert.deepEqual(commits, [false, false])
  assert.equal(committedMode, false)
})

test('a superseded frontmatter request cannot commit Geo ownership or XR presentation', async () => {
  const entry = deferred()
  const commits: boolean[] = []
  const presentations: string[] = []
  let requestCurrent = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      await entry.promise
      if (options.isCurrent?.() === false) return
      commits.push(enabled)
      await options.afterCommit?.()
    },
    isCommitted: () => false,
  })

  const stale = transitions.request(true, {
    afterCommit: () => {
      presentations.push('flight')
    },
    isCurrent: () => requestCurrent,
  })
  requestCurrent = false
  entry.resolve()

  await stale
  assert.deepEqual(commits, [])
  assert.deepEqual(presentations, [])
})

test('same-direction requests with distinct owners do not join a stale transition', async () => {
  const entry = deferred()
  const commits: string[] = []
  let firstCurrent = true
  const transitions = createCanvasFrontmatterSurfaceTransitionQueue({
    commit: async (enabled, options) => {
      await options.waitFor
      if (commits.length === 0) await entry.promise
      if (options.isCurrent?.() === false) return
      commits.push(`${String(enabled)}:${String(options.isCurrent?.() ?? true)}`)
      await options.afterCommit?.()
    },
    isCommitted: () => false,
  })

  const first = transitions.request(false, {
    isCurrent: () => firstCurrent,
  })
  firstCurrent = false
  const second = transitions.request(false, {
    isCurrent: () => true,
  })
  assert.notEqual(second, first)
  entry.resolve()

  await first
  await second
  assert.deepEqual(commits, ['false:true'])
})

test('a settled failed frontmatter handoff does not poison a later Flight retry', async context => {
  context.after(() => setGeospatialModeEnabled(false))
  setGeospatialModeEnabled(false)

  await assert.rejects(
    requestCanvasFrontmatterGeospatialSurface(false, {
      afterCommit: () => false,
    }),
    /could not claim ownership/,
  )
  await waitForActiveCanvasFrontmatterSurfaceTransition()
})
