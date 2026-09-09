import { digest } from './travel-mesh-release-plan.mjs'
import { readBoundedProbeBody } from './travel-mesh-release-probes.mjs'

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

export const probeCoreRuntime = async (configuration, { fetchFn = fetch, now = () => new Date() } = {}) => {
  const url = `https://${configuration.variables.AGENTIC_OS_PUBLIC_ZONE_NAME}/api/storage/readyz/core`
  const response = await fetchFn(url, { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
  const body = JSON.parse(await readBoundedProbeBody(response))
  if (response.status !== 200 || body.ok !== true || body.service !== 'agentic-storage'
    || body.scope !== 'core' || body.runtime !== 'production' || !Array.isArray(body.reasons) || body.reasons.length
    || body.dependencies?.authSchema !== 'ready' || body.dependencies?.browserSessionAccessConfiguration !== 'configured'
    || body.dependencies?.signingSecret !== 'ready' || body.dependencies?.blobStorage !== 'ready'
    || body.dependencies?.d1 !== 'ready' || body.dependencies?.canvasRoom !== 'ready') throw new Error('core storage readiness failed')
  const denied = await fetchFn(`https://${configuration.variables.AGENTIC_OS_PUBLIC_ZONE_NAME}/api/storage/export/kgws%3Acanonical-docs`, {
    redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000),
  })
  await denied.body?.cancel()
  if (denied.status !== 401) throw new Error('core unauthenticated storage request was not denied')
  const browserSession = await probeCoreBrowserSession(configuration, { fetchFn, now })
  return [{ browserSession, id: 'storage', service: 'agentic-storage', scope: 'core', url, status: response.status,
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
