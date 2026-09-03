import { canonical, digest, parseProbeSpec, requireText } from './travel-mesh-release-plan.mjs'
import { COMMERCE_PROVIDER_RUNTIME_SPECS } from '../cloudflare/workers/commerce-provider-runtime-contract.mjs'

const MAX_PROBE_BYTES = 65_536
const SOURCE_REVISION = /^[0-9a-f]{40}$/
const VERSION_ID = /^[A-Za-z0-9_-]{1,128}$/
const PROVIDER_SPECS = Object.freeze(Object.values(COMMERCE_PROVIDER_RUNTIME_SPECS))

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)

export const commerceProviderRuntimeProofFor = (sourceRevision, providerVersionId) => ({
  schema: 'commerce.provider-runtime-proof/v1', sourceRevision, providerVersionId,
  providers: PROVIDER_SPECS.map(spec => {
    const evidence = { schema: 'commerce.upstream-runtime-evidence/v1', prdRevision: '0.3.0', sourceRevision,
      storageCompatibilityRevision: spec.storageRevision, providerVersionId,
      checks: [...spec.checks].sort().map(name => ({ name, ok: true })) }
    return { id: spec.id, contract: spec.contract, capabilitiesDigest: digest(spec.capabilities),
      evidence: { ...evidence, receiptDigest: digest(evidence) } }
  }),
})

export const verifyCommerceProviderRuntimeProof = (value, expected = null) => {
  if (!isRecord(value)) throw new Error('commerce provider runtime proof is missing')
  const sourceRevision = expected?.sourceRevision ?? value.sourceRevision
  const providerVersionId = expected?.providerVersionId ?? value.providerVersionId
  if (!SOURCE_REVISION.test(sourceRevision ?? '') || !VERSION_ID.test(providerVersionId ?? '')) {
    throw new Error('commerce provider runtime metadata is malformed')
  }
  const exact = commerceProviderRuntimeProofFor(sourceRevision, providerVersionId)
  if (canonical(value) !== canonical(exact)) throw new Error('commerce provider runtime proof drifted')
  return exact
}

const cancelReader = async reader => {
  try { await reader.cancel('bounded travel mesh probe stopped') } catch { /* best-effort cancellation */ }
}

export const readBoundedProbeBody = async response => {
  if (!response?.body || typeof response.body.getReader !== 'function') throw new Error('probe response body is not readable')
  const declaredLength = Number(response.headers?.get?.('content-length'))
  const reader = response.body.getReader(), chunks = []
  let total = 0
  try {
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROBE_BYTES) {
      await cancelReader(reader)
      throw new Error('probe response exceeds the byte limit')
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw new Error('probe response chunk is malformed')
      total += value.byteLength
      if (total > MAX_PROBE_BYTES) {
        await cancelReader(reader)
        throw new Error('probe response exceeds the byte limit')
      }
      chunks.push(value)
    }
  } catch (error) {
    await cancelReader(reader)
    throw error
  } finally { try { reader.releaseLock() } catch { /* already released */ } }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export const probeMesh = async (spec, {
  environment = process.env, fetchFn = fetch, now = () => new Date(), providerMetadata = null,
} = {}) => {
  const accessId = requireText(environment.TRAVEL_ACCESS_CLIENT_ID, 'TRAVEL_ACCESS_CLIENT_ID')
  const accessSecret = requireText(environment.TRAVEL_ACCESS_CLIENT_SECRET, 'TRAVEL_ACCESS_CLIENT_SECRET')
  const evidence = []
  for (const entry of parseProbeSpec(spec, { publicHost: environment.TRAVEL_PUBLIC_ZONE_NAME })) {
    let status = null, body = null, providerRuntime = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const headers = { accept: 'application/json', ...(entry.id === 'operator-gateway'
          ? { 'CF-Access-Client-Id': accessId, 'CF-Access-Client-Secret': accessSecret } : {}) }
        const response = await fetchFn(entry.url, { headers, signal: AbortSignal.timeout(15_000) })
        status = response.status
        body = JSON.parse(await readBoundedProbeBody(response))
        const identityMatches = response.ok && body?.ok === true && body.service === entry.service
        if (identityMatches && entry.id === 'operator-gateway' && (providerMetadata || body.providerRuntime)) {
          try { providerRuntime = verifyCommerceProviderRuntimeProof(body.providerRuntime, providerMetadata) }
          catch { providerRuntime = null }
        }
        if (identityMatches && (entry.id !== 'operator-gateway' || !providerMetadata || providerRuntime)) break
      } catch { body = null; providerRuntime = null }
    }
    if (status == null || body?.ok !== true || body.service !== entry.service
      || (entry.id === 'operator-gateway' && providerMetadata && !providerRuntime)) throw new Error(`${entry.id} live dependency probe failed`)
    evidence.push({ ...entry, status, observedAt: now().toISOString(), bodyDigest: digest(body),
      ...(providerRuntime ? { providerRuntime } : {}) })
  }
  return evidence
}
