import { normalizeJson, verifyProviderCostEvidenceBeforeCall } from 'agentic-os/context/json'

export function createZeroCostWorkersAiBinding(binding, { bindingName, verifyProviderCostEvidence } = {}) {
  if (!binding || typeof binding !== 'object') return binding
  if (typeof bindingName !== 'string' || !bindingName.trim()) throw new TypeError('bindingName required')
  const name = bindingName.trim()
  const guarded = new Proxy(binding, { get(target, property) {
    const method = Reflect.get(target, property, target)
    if (typeof method !== 'function' || property === 'constructor') return method
    if (property !== 'run') return () => Promise.reject(new Error(`AI method ${String(property)} blocked.`))
    return (...args) => run({ target, method, args, name, verifyProviderCostEvidence })
  } })
  return guarded
}

async function run({ target, method, args, name, verifyProviderCostEvidence }) {
  if (typeof verifyProviderCostEvidence !== 'function') throw new Error('Cost verifier missing.')
  const model = args[0]
  if (typeof model !== 'string' || !model.trim() || model !== model.trim() || model.length > 512 || args.length < 2 || args.length > 3) {
    throw new TypeError('Invalid Workers AI model or input.')
  }
  const input = normalizeJson(args[1], 'Workers AI input')
  const options = snapshotOptions(args[2])
  const callArgs = Object.freeze(args.length === 2 ? [model, input] : [model, input, options.call])
  const proof = await verifyProviderCostEvidenceBeforeCall({
    provider: 'cloudflare-workers-ai', effect: 'workers-ai-run',
    resource: `cloudflare-workers-ai:${model} [binding:${name}]`,
    request: { binding: name, model, input, options: options.evidence },
    verifyProviderCostEvidence,
  })
  if (!['free-fail-closed', 'provider-hard-cap'].includes(proof.mode)) {
    throw new Error('Cost proof must deny or cap at $0.')
  }
  return Reflect.apply(method, target, callArgs)
}

function snapshotOptions(options) {
  if (options === undefined) return { call: undefined, evidence: { kind: 'omitted' } }
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Invalid AI options.')
  const prototype = Object.getPrototypeOf(options)
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Invalid AI options.')
  const call = {}, evidence = {}
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = typeof key === 'string' && Object.getOwnPropertyDescriptor(options, key)
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Invalid AI options.')
    if (key === 'signal' && typeof AbortSignal !== 'undefined' && descriptor.value instanceof AbortSignal) {
      call.signal = descriptor.value
      evidence.signal = { kind: 'abort-signal', aborted: descriptor.value.aborted }
    } else {
      call[key] = normalizeJson(descriptor.value, 'Workers AI options')
      evidence[key] = call[key]
    }
  }
  return { call: Object.freeze(call), evidence: normalizeJson(evidence, 'Workers AI options') }
}
