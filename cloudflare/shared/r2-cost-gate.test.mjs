import assert from 'node:assert/strict'
import test from 'node:test'
import { sha256JsonDigest } from 'agentic-os/context/json'
import { createZeroCostR2Binding, getZeroCostR2GateStatus, withZeroCostR2Bindings } from './r2-cost-gate.mjs'
import { createZeroCostR2TestVerifier } from './r2-cost-gate.test-utils.mjs'

const bucketFixture = () => {
  const calls = []
  const bucket = {
    get: async key => { calls.push(['get', key]); return null },
    put: async (key, body, options) => { calls.push(['put', key, body, options]); return { key } },
    list: async options => { calls.push(['list', options]); return { objects: [] } },
    createMultipartUpload: async key => {
      calls.push(['createMultipartUpload', key])
      return {
        key,
        uploadPart: async (part, body) => { calls.push(['uploadPart', part, body]); return { part, body } },
        complete: async parts => { calls.push(['complete', parts]); return parts },
        abort: async () => { calls.push(['abort']); return undefined },
      }
    },
    resumeMultipartUpload: (key, uploadId) => ({ key, uploadId,
      uploadPart: async (part, body) => { calls.push(['uploadPart', part, body]); return { part, body } },
      complete: async parts => { calls.push(['complete', parts]); return parts },
      abort: async () => { calls.push(['abort']); return undefined },
    }),
  }
  return { bucket, calls }
}

test('R2 operation fails closed without provider evidence and leaves the binding untouched', async () => {
  const { bucket, calls } = bucketFixture()
  const guarded = createZeroCostR2Binding(bucket, { bindingName: 'MEDIA', resourceName: 'media-bucket' })
  assert.equal(getZeroCostR2GateStatus(guarded), 'blocked')
  await assert.rejects(guarded.put('image/a.png', 'bytes'), /no trusted provider verifier/u)
  assert.deepEqual(calls, [])
})

test('R2 verifies exact operation, resource, and cost-sensitive request before the provider call', async () => {
  const { bucket, calls } = bucketFixture()
  const scopes = []
  const verifier = async request => { scopes.push(request); return createZeroCostR2TestVerifier()(request) }
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'media-bucket', verifyProviderCostEvidence: verifier,
  })
  const result = await guarded.put('image/a.png', 'bytes', { httpMetadata: { contentType: 'image/png' } })
  assert.deepEqual(result, { key: 'image/a.png' })
  assert.equal(calls.length, 1)
  assert.equal(scopes[0].provider, 'cloudflare-r2')
  assert.equal(scopes[0].effect, 'r2-put')
  assert.equal(scopes[0].resource, 'cloudflare-r2:media-bucket [binding:MEDIA]/image%2Fa.png')
  assert.equal(scopes[0].requestDigest, await sha256JsonDigest({
    binding: 'cloudflare-r2:media-bucket [binding:MEDIA]',
    method: 'put',
    arguments: {
      key: 'image/a.png', body: { kind: 'text', bytes: 5 },
      options: { httpMetadata: { contentType: 'image/png' } },
    },
  }))
})

test('provider-enforced Free-plan quota denial authorizes only the exact operation', async () => {
  const { bucket, calls } = bucketFixture()
  const scopes = []
  const verifier = async request => {
    scopes.push(request)
    return createZeroCostR2TestVerifier({ mode: 'free-fail-closed' })(request)
  }
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'media-bucket',
    verifyProviderCostEvidence: verifier,
  })
  await guarded.get('image/a.png')
  assert.equal(scopes[0].provider, 'cloudflare-r2')
  assert.equal(scopes[0].effect, 'r2-get')
  assert.equal(scopes[0].resource, 'cloudflare-r2:media-bucket [binding:MEDIA]/image%2Fa.png')
  assert.deepEqual(calls.map(([method]) => method), ['get'])
})

test('multipart follow-up operations receive separate current cost checks', async () => {
  const { bucket, calls } = bucketFixture()
  const scopes = []
  const verifier = async request => { scopes.push(request); return createZeroCostR2TestVerifier()(request) }
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'media-bucket', verifyProviderCostEvidence: verifier,
  })
  const multipart = await guarded.createMultipartUpload('video/a.mp4')
  await multipart.uploadPart(1, 'chunk')
  await multipart.complete([{ partNumber: 1, etag: 'etag' }])
  assert.deepEqual(scopes.map(scope => scope.effect), [
    'r2-create-multipart-upload', 'r2-upload-part', 'r2-complete',
  ])
  assert.deepEqual(scopes.map(scope => scope.resource), [
    'cloudflare-r2:media-bucket [binding:MEDIA]/video%2Fa.mp4',
    'cloudflare-r2:media-bucket [binding:MEDIA]/video%2Fa.mp4',
    'cloudflare-r2:media-bucket [binding:MEDIA]/video%2Fa.mp4',
  ])
  assert.deepEqual(calls.map(([method]) => method), ['createMultipartUpload', 'uploadPart', 'complete'])
})

test('R2 refuses a configured binding without an exact bucket identity', async () => {
  const { bucket, calls } = bucketFixture()
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'unresolved:MEDIA',
    verifyProviderCostEvidence: createZeroCostR2TestVerifier(),
  })
  assert.equal(getZeroCostR2GateStatus(guarded), 'blocked')
  await assert.rejects(guarded.put('image/a.png', 'bytes'), /bucket name is not bound/u)
  assert.deepEqual(calls, [])
})

test('resumeMultipartUpload preserves the synchronous R2 handle API and gates the next provider effect', async () => {
  const { bucket, calls } = bucketFixture()
  const scopes = []
  const verifier = async request => { scopes.push(request); return createZeroCostR2TestVerifier()(request) }
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'media-bucket', verifyProviderCostEvidence: verifier,
  })
  const multipart = guarded.resumeMultipartUpload('video/a.mp4', 'upload-1')
  assert.equal(typeof multipart.then, 'undefined')
  await multipart.uploadPart(1, 'chunk')
  assert.equal(scopes[0].effect, 'r2-upload-part')
  assert.equal(scopes[0].resource, 'cloudflare-r2:media-bucket [binding:MEDIA]/video%2Fa.mp4')
  assert.deepEqual(calls.map(([method]) => method), ['uploadPart'])
})

test('Worker entry binding proxies fail closed by default and keep readiness status visible', () => {
  const { bucket } = bucketFixture()
  const env = withZeroCostR2Bindings({ MEDIA: bucket }, { MEDIA: 'media-bucket' })
  assert.equal(getZeroCostR2GateStatus(env.MEDIA), 'blocked')
})
