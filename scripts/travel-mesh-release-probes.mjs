import { digest, parseProbeSpec, requireText } from './travel-mesh-release-plan.mjs'

const MAX_PROBE_BYTES = 65_536

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

export const probeMesh = async (spec, { environment = process.env, fetchFn = fetch, now = () => new Date() } = {}) => {
  const accessId = requireText(environment.TRAVEL_ACCESS_CLIENT_ID, 'TRAVEL_ACCESS_CLIENT_ID')
  const accessSecret = requireText(environment.TRAVEL_ACCESS_CLIENT_SECRET, 'TRAVEL_ACCESS_CLIENT_SECRET')
  const evidence = []
  for (const entry of parseProbeSpec(spec, { publicHost: environment.TRAVEL_PUBLIC_ZONE_NAME })) {
    let status = null, body = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const headers = { accept: 'application/json', ...(entry.id === 'operator-gateway'
          ? { 'CF-Access-Client-Id': accessId, 'CF-Access-Client-Secret': accessSecret } : {}) }
        const response = await fetchFn(entry.url, { headers, signal: AbortSignal.timeout(15_000) })
        status = response.status
        body = JSON.parse(await readBoundedProbeBody(response))
        if (response.ok && body?.ok === true && body.service === entry.service) break
      } catch { body = null }
    }
    if (status == null || body?.ok !== true || body.service !== entry.service) throw new Error(`${entry.id} live dependency probe failed`)
    evidence.push({ ...entry, status, observedAt: now().toISOString(), bodyDigest: digest(body) })
  }
  return evidence
}
