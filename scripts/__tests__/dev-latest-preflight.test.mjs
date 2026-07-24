import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import test from 'node:test'
import {
  assertDevServerPortAvailable,
  CANONICAL_DEV_SERVER,
  prepareDevLatest,
} from '../dev-latest-preflight.mjs'

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen({ host: CANONICAL_DEV_SERVER.host, port: 0, exclusive: true }, () => resolve())
})

const close = server => new Promise((resolve, reject) => {
  server.close(error => {
    if (error) reject(error)
    else resolve()
  })
})

test('dev latest rejects an occupied canonical port before source synchronization', async () => {
  const owner = createServer()
  await listen(owner)
  const address = owner.address()
  assert.ok(address && typeof address === 'object')

  let syncCalled = false
  await assert.rejects(
    prepareDevLatest({
      portPreflight: () => assertDevServerPortAvailable({
        host: CANONICAL_DEV_SERVER.host,
        port: address.port,
      }),
      syncSources: async () => {
        syncCalled = true
        return { message: 'unexpected' }
      },
    }),
    /stop the existing runtime.*No source checkout was updated/,
  )
  assert.equal(syncCalled, false)
  await close(owner)
})

test('dev latest synchronizes only after the canonical port preflight passes', async () => {
  const probe = createServer()
  await listen(probe)
  const address = probe.address()
  assert.ok(address && typeof address === 'object')
  await close(probe)

  const order = []
  const result = await prepareDevLatest({
    portPreflight: async () => {
      order.push('port')
      await assertDevServerPortAvailable({
        host: CANONICAL_DEV_SERVER.host,
        port: address.port,
      })
    },
    syncSources: async () => {
      order.push('sync')
      return { message: 'ready' }
    },
  })

  assert.deepEqual(order, ['port', 'sync'])
  assert.equal(result.message, 'ready')
})
