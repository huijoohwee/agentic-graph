import assert from 'node:assert/strict'
import { CANONICAL_MIRROR_NAMESPACE, LEGACY_PRODUCT_NAMESPACES } from './mirror-namespace-contract.mjs'

export const CANONICAL_SCOPE_SEGMENT = CANONICAL_MIRROR_NAMESPACE
const SHA_PATTERN = /^[0-9a-f]{40}$/
const SENTINEL_KEY = 'kg:production-service-worker-upgrade-sentinel'
const SENTINEL_DATABASE = 'kg-production-service-worker-upgrade-proof'

export const normalizeOrigin = value => {
  const url = new URL(String(value || '').trim())
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('production service worker profile origin must be an origin')
  }
  return url.origin
}

// Retired names are accepted only as observed pre-deployment migration inputs.
export const isKnownPreviousScope = scope => scope === CANONICAL_SCOPE_SEGMENT
  || LEGACY_PRODUCT_NAMESPACES.includes(scope)
export const classifyScopeUpgradeKind = scope => {
  assert.ok(isKnownPreviousScope(scope), 'unknown previous deployment scope')
  return scope === CANONICAL_SCOPE_SEGMENT ? 'in-scope-upgrade' : 'scope-transition'
}

export const readPublishedRuntimeRevision = async ({ profileOrigin, fetchFn = fetch }) => {
  const origin = new URL(profileOrigin)
  assert.equal(origin.origin, profileOrigin, 'profile origin must contain no path or credentials')
  const probe = async (pathname, optional = false, retiredAlias = false) => {
    const response = await fetchFn(`${profileOrigin}${pathname}`, {
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    })
    if (optional && response.status === 404) { await response.body?.cancel(); return null }
    if (retiredAlias && [301, 308].includes(response.status)) {
      const location = response.headers.get('location')
      assert.ok(location, 'retired marker redirect requires a location')
      const target = new URL(location, profileOrigin)
      assert.ok(target.origin === profileOrigin && !target.search && !target.hash
        && target.pathname !== pathname
        && LEGACY_PRODUCT_NAMESPACES.some(scope => target.pathname === `/${scope}/.well-known/runtime-readiness.json`),
      'retired marker may redirect only to another known same-origin retired marker')
      await response.body?.cancel()
      return null // An alias is not a second deployed scope; never follow it.
    }
    assert.equal(response.status, 200, `runtime marker ${pathname} must be available`)
    assert.match(response.headers.get('content-type') || '', /^application\/json(?:;|$)/i)
    const marker = await response.json()
    const revision = String(marker?.source?.revision || '').trim()
    assert.match(revision, SHA_PATTERN, 'runtime marker must expose an exact source revision')
    return revision
  }
  const scoped = scope => probe(`/${scope}/.well-known/runtime-readiness.json`, true, scope !== CANONICAL_SCOPE_SEGMENT)
  const canonicalRevision = await scoped(CANONICAL_SCOPE_SEGMENT)
  let result = canonicalRevision && { scopeSegment: CANONICAL_SCOPE_SEGMENT, revision: canonicalRevision }
  if (!result) {
    const retired = []
    for (const scopeSegment of LEGACY_PRODUCT_NAMESPACES) {
      const revision = await scoped(scopeSegment)
      if (revision) retired.push({ scopeSegment, revision })
    }
    assert.equal(retired.length, 1, 'prewarm requires one observed retired deployment scope')
    result = retired[0]
  }
  const rootRevision = await probe('/.well-known/runtime-readiness.json')
  assert.equal(result.revision, rootRevision, 'scoped runtime marker must match the root deployment marker')
  return result
}

export const checkPublishedWorkerSources = async ({ profileOrigin, expectedRevision, chatRuntimeSchema, fetchFn = fetch }) => {
  const fetchMutableWorkerSource = async relativeUrl => {
    const response = await fetchFn(`${profileOrigin}${relativeUrl}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) })
    assert.equal(response.status, 200, `${relativeUrl} must be publicly readable`)
    assert.match(
      String(response.headers.get('cache-control') || ''),
      /\bno-store\b/i,
      `${relativeUrl} must bypass the HTTP cache`,
    )
    return response.text()
  }
  const revisionQuery = `revision=${expectedRevision}`
  const topLevelWorker = await fetchMutableWorkerSource('/agentic-graph/sw.js')
  const revisionAuthority = await fetchMutableWorkerSource(
    `/agentic-graph/agentic-graph-service-worker-revision.js?${revisionQuery}`,
  )
  const chatRuntime = await fetchMutableWorkerSource(
    `/agentic-graph/agentic-graph-chat-stream-sw.js?${revisionQuery}`,
  )
  assert.match(
    topLevelWorker,
    new RegExp(`agentic-graph-service-worker-revision\\.js\\?${revisionQuery}`),
    'public service worker must revision-bind its authority import',
  )
  assert.match(
    topLevelWorker,
    new RegExp(`agentic-graph-chat-stream-sw\\.js\\?${revisionQuery}`),
    'public service worker must revision-bind its chat runtime import',
  )
  assert.match(
    revisionAuthority,
    new RegExp(`const sourceRevision = ["']${expectedRevision}["']`),
    'public active-worker authority must report the exact release revision',
  )
  assert.match(chatRuntime, new RegExp(chatRuntimeSchema))
  assert.doesNotMatch(
    chatRuntime,
    /addEventListener\(["'](?:install|activate)["']/,
    'public chat runtime must not retain legacy lifecycle listeners',
  )
}

export const writeSentinels = async (page, value) => page.evaluate(async ({ databaseName, key, sentinel }) => {
  window.localStorage.setItem(key, sentinel)
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('proof')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const transaction = request.result.transaction('proof', 'readwrite')
      transaction.objectStore('proof').put(sentinel, key)
      transaction.oncomplete = () => {
        request.result.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    }
  })
}, { databaseName: SENTINEL_DATABASE, key: SENTINEL_KEY, sentinel: value })

export const readSentinels = async page => page.evaluate(async ({ databaseName, key }) => {
  const local = window.localStorage.getItem(key)
  const indexed = await new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (!request.result.objectStoreNames.contains('proof')) {
        request.result.close()
        resolve(null)
        return
      }
      const transaction = request.result.transaction('proof', 'readonly')
      const read = transaction.objectStore('proof').get(key)
      read.onsuccess = () => {
        request.result.close()
        resolve(read.result ?? null)
      }
      read.onerror = () => reject(read.error)
    }
  })
  return { local, indexed }
}, { databaseName: SENTINEL_DATABASE, key: SENTINEL_KEY })

export const observePageFailures = (page, scopeSegment = CANONICAL_SCOPE_SEGMENT) => {
  const assetsPrefix = `/${scopeSegment}/assets/`
  const pageErrors = []
  const scriptPaths = []
  const poisonedModules = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => {
    const request = response.request()
    const url = new URL(response.url())
    if (request.resourceType() !== 'script') return
    if (url.pathname.startsWith(assetsPrefix)) scriptPaths.push(url.pathname)
    if (String(response.headers()['content-type'] || '').toLowerCase().includes('text/html')) {
      poisonedModules.push(response.url())
    }
  })
  return { pageErrors, scriptPaths, poisonedModules }
}

