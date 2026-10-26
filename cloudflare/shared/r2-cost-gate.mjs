import { verifyProviderCostEvidenceBeforeCall } from 'agentic-os/context/json'

const BUCKET_METHODS = new Set([
  'get', 'put', 'head', 'delete', 'list', 'createMultipartUpload', 'resumeMultipartUpload',
])
const MULTIPART_METHODS = new Set(['uploadPart', 'complete', 'abort'])
const gateStates = new WeakMap()

const kebab = value => String(value).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
const keyOf = args => typeof args[0] === 'string' ? args[0] : ''
const boundedString = value => value.length <= 4096 ? value : value.slice(0, 4096)

function bodySummary(value) {
  if (value == null) return { kind: value === null ? 'null' : 'undefined', bytes: 0 }
  if (typeof value === 'string') return { kind: 'text', bytes: new TextEncoder().encode(value).byteLength }
  if (value instanceof ArrayBuffer) return { kind: 'array-buffer', bytes: value.byteLength }
  if (ArrayBuffer.isView(value)) return { kind: 'array-buffer-view', bytes: value.byteLength }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { kind: 'blob', bytes: value.size, contentType: boundedString(value.type) }
  }
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
    return { kind: 'stream', bytes: null }
  }
  const size = Number.isSafeInteger(value?.size) && value.size >= 0 ? value.size : null
  return { kind: 'opaque', bytes: size }
}

function safeValue(value, depth = 0) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) {
    return typeof value === 'string' ? boundedString(value) : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === undefined) return { kind: 'undefined' }
  if (depth > 6) return { kind: 'depth-limit' }
  if (Array.isArray(value)) return value.slice(0, 64).map(item => safeValue(item, depth + 1))
  if (typeof value !== 'object') return { kind: typeof value }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)
    || typeof Blob !== 'undefined' && value instanceof Blob
    || typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return bodySummary(value)
  const output = {}
  for (const [key, item] of Object.entries(value).slice(0, 64)) {
    output[boundedString(key)] = safeValue(item, depth + 1)
  }
  return output
}

function requestSummary(method, args, baseResource) {
  const key = keyOf(args)
  const resource = key ? `${baseResource}/${encodeURIComponent(key)}` : baseResource
  let operationArgs
  if (method === 'put') operationArgs = { key, body: bodySummary(args[1]), options: safeValue(args[2]) }
  else if (method === 'uploadPart') operationArgs = { partNumber: safeValue(args[0]), body: bodySummary(args[1]) }
  else if (method === 'createMultipartUpload') operationArgs = { key, options: safeValue(args[1]) }
  else operationArgs = safeValue(args)
  return { resource, request: { binding: baseResource, method, arguments: operationArgs } }
}

async function verifyR2Call({ method, args, baseResource, verifier, resourceResolved }) {
  if (!resourceResolved) {
    throw new Error('Cloudflare R2 is blocked: the deployed bucket name is not bound to an exact source configuration.')
  }
  if (!verifier) {
    throw new Error('Cloudflare R2 is blocked: no trusted provider verifier proves an exact USD 0 hard cap.')
  }
  if (!BUCKET_METHODS.has(method) && !MULTIPART_METHODS.has(method)) {
    throw new Error(`Cloudflare R2 operation ${method} has no cost classification and is blocked.`)
  }
  const { resource, request } = requestSummary(method, args, baseResource)
  const proof = await verifyProviderCostEvidenceBeforeCall({
    provider: 'cloudflare-r2',
    effect: `r2-${kebab(method)}`,
    resource,
    request,
    verifyProviderCostEvidence: verifier,
  })
  const hardCap = proof.mode === 'provider-hard-cap' && proof.providerHardCapUsd === 0
  const freeQuota = proof.mode === 'free-fail-closed' && proof.billingPlan === 'free'
    && proof.quotaExhaustion === 'deny'
  if (!hardCap && !freeQuota) {
    throw new Error('Cloudflare R2 is blocked: provider evidence must prove a USD 0 cap or deny-on-exhaustion Free plan.')
  }
}

function wrapOperations(target, { baseResource, verifier, resourceResolved, multipart = false }) {
  if (!target || typeof target !== 'object') return target
  const allowed = multipart ? MULTIPART_METHODS : BUCKET_METHODS
  const proxy = new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object)
      if (typeof value !== 'function' || property === 'constructor') return value
      const method = String(property)
      if (!allowed.has(method)) {
        return () => Promise.reject(new Error(`Cloudflare R2 operation ${method} has no cost classification and is blocked.`))
      }
      if (!multipart && method === 'resumeMultipartUpload') {
        // Cloudflare documents this as a local handle constructor with no provider check.
        // The multipart proxy verifies each actual upload, completion, or abort operation.
        return (...args) => {
          const upload = Reflect.apply(value, object, args)
          return wrapOperations(upload, { baseResource: requestSummary(method, args, baseResource).resource,
            verifier, resourceResolved, multipart: true })
        }
      }
      return (...args) => verifyR2Call({ method, args, baseResource, verifier, resourceResolved }).then(async () => {
        const result = await Reflect.apply(value, object, args)
        return !multipart && ['createMultipartUpload', 'resumeMultipartUpload'].includes(method)
          ? wrapOperations(result, { baseResource: requestSummary(method, args, baseResource).resource,
            verifier, resourceResolved, multipart: true })
          : result
      })
    },
  })
  gateStates.set(proxy, verifier && resourceResolved ? 'guarded' : 'blocked')
  return proxy
}

export function createZeroCostR2Binding(bucket, { bindingName, resourceName, verifyProviderCostEvidence } = {}) {
  if (!bucket || typeof bucket !== 'object') return bucket
  if (typeof bindingName !== 'string' || !bindingName.trim()
    || typeof resourceName !== 'string' || !resourceName.trim()) {
    throw new TypeError('An exact Cloudflare R2 binding and resource name are required.')
  }
  const resourceResolved = !resourceName.trim().startsWith('unresolved:')
  return wrapOperations(bucket, {
    baseResource: `cloudflare-r2:${resourceName.trim()} [binding:${bindingName.trim()}]`,
    verifier: verifyProviderCostEvidence,
    resourceResolved,
  })
}

export function withZeroCostR2Bindings(env, bindingResources) {
  if (!env || typeof env !== 'object') return env
  const verifier = Reflect.get(env, 'verifyProviderCostEvidence', env)
  const guarded = new Map()
  for (const [bindingName, resourceName] of Object.entries(bindingResources)) {
    const bucket = Reflect.get(env, bindingName, env)
    if (bucket && typeof bucket === 'object') {
      guarded.set(bindingName, createZeroCostR2Binding(bucket, {
        bindingName, resourceName, verifyProviderCostEvidence: verifier,
      }))
    }
  }
  return new Proxy(env, {
    get(target, property, receiver) {
      return guarded.has(property) ? guarded.get(property) : Reflect.get(target, property, receiver)
    },
  })
}

export function getZeroCostR2GateStatus(bucket) {
  return bucket && typeof bucket === 'object' ? gateStates.get(bucket) ?? null : null
}
