import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchOpenPullRequests } from '../github-active-scope-client.mjs'

test('active scope query retries bounded transient GitHub failures', async () => {
  const statuses = [503, 502, 504, 200]
  const delays = []
  const pullRequests = await fetchOpenPullRequests('owner/repository', 'token', {
    fetchImpl: async () => {
      const status = statuses.shift()
      return {
        ok: status === 200,
        status,
        json: async () => [{ number: 96 }],
      }
    },
    retryDelaysMs: [10, 20, 40],
    sleepImpl: async delayMs => delays.push(delayMs),
  })

  assert.deepEqual(delays, [10, 20, 40])
  assert.deepEqual(pullRequests, [{ number: 96 }])
})

test('active scope query remains fail-closed after transient retries', async () => {
  let calls = 0
  await assert.rejects(
    fetchOpenPullRequests('owner/repository', 'token', {
      fetchImpl: async () => {
        calls += 1
        return { ok: false, status: 503 }
      },
      retryDelaysMs: [0, 0],
      sleepImpl: async () => {},
    }),
    /GitHub active-scope query failed with HTTP 503 after 3 attempts/,
  )
  assert.equal(calls, 3)
})

test('active scope query does not retry non-transient GitHub failures', async () => {
  let calls = 0
  await assert.rejects(
    fetchOpenPullRequests('owner/repository', 'token', {
      fetchImpl: async () => {
        calls += 1
        return { ok: false, status: 401 }
      },
      retryDelaysMs: [0, 0],
      sleepImpl: async () => {},
    }),
    /GitHub active-scope query failed with HTTP 401$/,
  )
  assert.equal(calls, 1)
})

test('active scope query bounds each GitHub request and fails closed on timeout', async () => {
  let observedSignal = null
  await assert.rejects(
    fetchOpenPullRequests('owner/repository', 'token', {
      fetchImpl: async (_url, { signal }) => {
        observedSignal = signal
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
      requestTimeoutMs: 10,
    }),
    /GitHub active-scope query timed out after 10ms/,
  )
  assert.equal(observedSignal?.aborted, true)
})

test('active scope query bounds a GitHub response body before accepting it', async () => {
  await assert.rejects(
    fetchOpenPullRequests('owner/repository', 'token', {
      fetchImpl: async (_url, { signal }) => ({
        ok: true,
        json: async () => new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
      }),
      requestTimeoutMs: 10,
    }),
    /GitHub active-scope query timed out after 10ms/,
  )
})
