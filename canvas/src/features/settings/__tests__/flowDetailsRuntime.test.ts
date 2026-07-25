import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFlowDetailsLoader } from '../flowDetailsRuntime'

test('flow details loader caches success', async () => {
  let imports = 0
  const load = createFlowDetailsLoader(async () => {
    imports += 1
    return { default: { chatProvider: { area: 'Chat' } } }
  })

  const [first, second] = await Promise.all([load(), load()])

  assert.equal(imports, 1)
  assert.equal(first.status, 'ready')
  assert.deepEqual(first, second)
  assert.equal(first.details.chatProvider?.area, 'Chat')
})

test('flow details loader exposes failure and retries the rejected import', async () => {
  let imports = 0
  const load = createFlowDetailsLoader(async () => {
    imports += 1
    if (imports === 1) throw new Error('offline chunk miss')
    return { default: { chatProvider: { area: 'Chat' } } }
  })

  const unavailable = await load()
  const recovered = await load()

  assert.equal(unavailable.status, 'unavailable')
  assert.deepEqual(unavailable.details, {})
  assert.match(unavailable.error ?? '', /offline chunk miss/)
  assert.equal(recovered.status, 'ready')
  assert.equal(recovered.details.chatProvider?.area, 'Chat')
  assert.equal(imports, 2)
})
