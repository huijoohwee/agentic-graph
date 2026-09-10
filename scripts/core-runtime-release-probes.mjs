import { digest } from './travel-mesh-release-plan.mjs'
import { readBoundedProbeBody } from './travel-mesh-release-probes.mjs'
import { STORAGE_FETCH_ORIGIN } from '../cloudflare/pages/agentic-graph-agent-ready-shared.mjs'

export const probeCoreStorageOrigin = async ({ fetchFn = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) => {
  const url = `${STORAGE_FETCH_ORIGIN}/api/storage/livez`
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetchFn(url, { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
      const body = JSON.parse(await readBoundedProbeBody(response))
      if (response.status !== 200 || body.ok !== true || body.service !== 'agentic-storage') throw new Error('Unexpected storage origin response')
      return { url, status: 200, bodyDigest: digest(body) }
    } catch (error) {
      if (attempt === 6) throw new Error(`Core MCP storage origin is unavailable: ${error.message}`)
      await wait(10000)
    }
  }
}

export const probeCoreBaseline = async (configuration, { fetchFn = fetch } = {}) => {
  const origin = `https://${configuration.variables.AGENTIC_OS_PUBLIC_ZONE_NAME}`
  const evidence = []
  for (const [path, expectedStatus] of [['/api/storage/livez', 200], ['/api/storage/export/kgws%3Acanonical-docs', 401]]) {
    const response = await fetchFn(`${origin}${path}`, {
      redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000),
    })
    const body = JSON.parse(await readBoundedProbeBody(response))
    if (response.status !== expectedStatus || (expectedStatus === 200 && (body.ok !== true || body.service !== 'agentic-storage'))
      || (expectedStatus === 401 && body.ok !== false)) throw new Error('core baseline storage health or authentication differs')
    evidence.push({ path, status: response.status, bodyDigest: digest(body) })
  }
  return evidence
}
export const probeRestoredCore = async (configuration, options) => {
  const observed = await probeCoreBaseline(configuration, options)
  if (!Array.isArray(options.baselineProbes) || digest(observed) !== digest(options.baselineProbes)) {
    throw new Error('restored core baseline probes differ from preflight')
  }
  return observed
}

const coreReady = (status, body) => status === 200 && body?.ok === true && body.service === 'agentic-storage'
    && body.scope === 'core' && body.runtime === 'production' && Array.isArray(body.reasons) && !body.reasons.length
    && body.dependencies?.authSchema === 'ready' && body.dependencies?.browserSessionAccessConfiguration === 'configured'
    && body.dependencies?.signingSecret === 'ready' && body.dependencies?.blobStorage === 'ready'
    && body.dependencies?.d1 === 'ready' && body.dependencies?.canvasRoom === 'ready'

const transientCoreResponse = (status, body) => status === null || status === 429
  || [502, 504].includes(status)
  || status === 404 && body?.ok === false && body.code === 'not_found'
  || status === 503 && body?.service === 'agentic-storage' && body.scope === 'core'
    && body.runtime === 'production' && Array.isArray(body.reasons) && body.reasons.length > 0
    && body.reasons.every(reason => reason === 'storage-auth-schema-unavailable')

// Provider activation and a public readiness response are separate observations.
// Retry only recognized temporary states; configuration or identity failures stop.
const awaitCoreReadiness = async (url, fetchFn, wait) => {
  const observations = []
  for (let attempt = 1; attempt <= 6; attempt++) {
    let status = null, body = null, failure = null
    try {
      const response = await fetchFn(url, { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
      status = response.status
      body = JSON.parse(await readBoundedProbeBody(response))
    } catch { failure = status === null ? 'request-unavailable' : 'unreadable-response' }
    if (coreReady(status, body)) return { status, body }
    // Only fixed reason labels and a body digest enter retained diagnostics.
    // Arbitrary provider response text must not become release-log content.
    const reasons = Array.isArray(body?.reasons) ? body.reasons.filter(reason => [
      'd1-binding-missing', 'canvas-room-binding-missing', 'storage-browser-session-access-configuration-missing',
      'storage-signing-secret-missing', 'storage-auth-schema-unavailable', 'storage-blob-binding-missing',
    ].includes(reason)) : []
    observations.push({ attempt, status, failure, reasons: [...new Set(reasons)], bodyDigest: body === null ? null : digest(body) })
    if (attempt === 6 || !transientCoreResponse(status, body)) {
      throw new Error(`core storage readiness failed: ${JSON.stringify({ url, observations })}`)
    }
    await wait(10000)
  }
}

export const probeCoreRuntime = async (configuration, {
  fetchFn = fetch, now = () => new Date(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) => {
  const url = `https://${configuration.variables.AGENTIC_OS_PUBLIC_ZONE_NAME}/api/storage/readyz/core`
  const { status, body } = await awaitCoreReadiness(url, fetchFn, wait)
  const denied = await fetchFn(`https://${configuration.variables.AGENTIC_OS_PUBLIC_ZONE_NAME}/api/storage/export/kgws%3Acanonical-docs`, {
    redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000),
  })
  await denied.body?.cancel()
  if (denied.status !== 401) throw new Error('core unauthenticated storage request was not denied')
  const storageOrigin = await probeCoreStorageOrigin({ fetchFn })
  const browserSession = await probeCoreBrowserSession(configuration, { fetchFn, now })
  return [{ browserSession, storageOrigin, id: 'storage', service: 'agentic-storage', scope: 'core', url, status,
    anonymousStatus: denied.status, observedAt: now().toISOString(), bodyDigest: digest(body) }]
}


export const probeCoreBrowserSession = async (configuration, { fetchFn = fetch, now = () => new Date() } = {}) => {
  const origin = `https://${configuration.variables.AGENTIC_OS_PUBLIC_ZONE_NAME}`
  const workspace = configuration.variables.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID
  const sessionUrl = `${origin}/api/storage/auth/session?workspace_id=${encodeURIComponent(workspace)}`
  const options = { redirect: 'manual', signal: AbortSignal.timeout(5000) }
  const login = await fetchFn(`${origin}/api/storage/auth/login?return_to=%2Fagentic-graph%2F`, {
    ...options, method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_key: configuration.ownerAccessKey }).toString(),
  })
  await login.body?.cancel()
  const setCookie = login.headers.get('set-cookie') || ''
  const cookie = setCookie.match(/^(__Host-agentic_os_storage_session=[a-f0-9]{64});/)?.[1]
  if (!cookie) throw new Error('core login did not issue a browser session')
  let loggedOut = false
  const logout = async () => {
    const response = await fetchFn(`${origin}/api/storage/auth/logout`, {
      redirect: 'manual', signal: AbortSignal.timeout(5000), method: 'POST', headers: { origin, cookie },
    })
    await response.body?.cancel()
    if (response.status !== 204) throw new Error('core browser logout failed')
    loggedOut = true
  }
  try {
    if (login.status !== 303 || login.headers.get('location') !== '/agentic-graph/'
      || !/; Path=\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Strict$/.test(setCookie)) throw new Error('core browser login response is invalid')
    const response = await fetchFn(sessionUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { cookie } })
    const body = JSON.parse(await readBoundedProbeBody(response))
    const expires = Date.parse(body.session?.expiresAt)
    if (response.status !== 200 || body.ok !== true || body.authenticated !== true || body.workspaceId !== workspace
      || !Number.isFinite(expires) || expires <= now().getTime()
      || expires > Date.parse(configuration.variables.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT)) throw new Error('core workspace session was not proved')
    await logout()
    const revoked = await fetchFn(sessionUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { cookie } })
    await revoked.body?.cancel()
    if (revoked.status !== 401) throw new Error('core revoked browser session remained usable')
    return { loginStatus: 303, workspaceStatus: 200, logoutStatus: 204, revokedStatus: 401, expiresAt: body.session.expiresAt }
  } finally {
    if (!loggedOut) await logout()
  }
}
