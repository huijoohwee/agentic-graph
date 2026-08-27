import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { isAcceptedWorkerScriptUrl } from './production-service-worker-registration-proof.mjs'
import { classifyServiceWorkerReleaseTransition } from './service-worker-release-transition.mjs'
import { seedReturningUserCacheProof } from './service-worker-upgrade-cache-proof.mjs'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const EVIDENCE_SCHEMA = 'agenticgraph-production-service-worker-transition/v3'
const SENTINEL_KEY = 'kg:production-service-worker-upgrade-sentinel'
const SENTINEL_DATABASE = 'kg-production-service-worker-upgrade-proof'
const CHAT_RUNTIME_SCHEMA = 'agenticgraph-chat-stream-worker/v2'
const WAIT_TIMEOUT_MS = 90_000

const mode = String(process.argv[2] || '').trim()
if (mode !== 'prewarm' && mode !== 'verify') {
  throw new Error('Usage: verify-production-service-worker-upgrade.mjs <prewarm|verify>')
}

const normalizeOrigin = value => {
  const url = new URL(String(value || '').trim())
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('production service worker profile origin must be an origin')
  }
  return url.origin
}

const profileOriginInput = String(process.env.PRODUCTION_SW_PROFILE_ORIGIN || '').trim()
if (!profileOriginInput) throw new Error('PRODUCTION_SW_PROFILE_ORIGIN is required')
const profileOrigin = normalizeOrigin(profileOriginInput)
const canonicalWorkerScope = `${profileOrigin}/agenticgraph/`
const profileDirectory = path.resolve(String(process.env.PRODUCTION_SW_PROFILE_DIR || '').trim())
const evidencePath = path.resolve(String(process.env.PRODUCTION_SW_EVIDENCE_PATH || '').trim())
const runnerTemp = path.resolve(String(process.env.RUNNER_TEMP || '').trim())
const browserHeadless = String(process.env.PRODUCTION_BROWSER_HEADLESS || 'true').trim().toLowerCase() !== 'false'

if (!process.env.PRODUCTION_SW_PROFILE_DIR || !process.env.PRODUCTION_SW_EVIDENCE_PATH || !process.env.RUNNER_TEMP) {
  throw new Error('PRODUCTION_SW_PROFILE_DIR, PRODUCTION_SW_EVIDENCE_PATH, and RUNNER_TEMP are required')
}
for (const [label, target] of [['profile directory', profileDirectory], ['evidence path', evidencePath]]) {
  if (target === runnerTemp || !target.startsWith(`${runnerTemp}${path.sep}`)) {
    throw new Error(`${label} must be a bounded child of RUNNER_TEMP`)
  }
}

const readRuntimeRevision = async () => {
  const response = await fetch(`${profileOrigin}/agenticgraph/.well-known/runtime-readiness.json`, {
    cache: 'no-store',
  })
  assert.equal(response.status, 200, 'public runtime readiness marker must be available')
  const marker = await response.json()
  const revision = String(marker?.source?.revision || '').trim()
  assert.match(revision, SHA_PATTERN, 'public runtime readiness marker must expose an exact source revision')
  return revision
}

const verifyPublishedWorkerSources = async expectedRevision => {
  const fetchMutableWorkerSource = async relativeUrl => {
    const response = await fetch(`${profileOrigin}${relativeUrl}`, { cache: 'no-store' })
    assert.equal(response.status, 200, `${relativeUrl} must be publicly readable`)
    assert.match(
      String(response.headers.get('cache-control') || ''),
      /\bno-store\b/i,
      `${relativeUrl} must bypass the HTTP cache`,
    )
    return response.text()
  }
  const revisionQuery = `revision=${expectedRevision}`
  const topLevelWorker = await fetchMutableWorkerSource('/agenticgraph/sw.js')
  const revisionAuthority = await fetchMutableWorkerSource(
    `/agenticgraph/agenticgraph-service-worker-revision.js?${revisionQuery}`,
  )
  const chatRuntime = await fetchMutableWorkerSource(
    `/agenticgraph/agenticgraph-chat-stream-sw.js?${revisionQuery}`,
  )
  assert.match(
    topLevelWorker,
    new RegExp(`agenticgraph-service-worker-revision\\.js\\?${revisionQuery}`),
    'public service worker must revision-bind its authority import',
  )
  assert.match(
    topLevelWorker,
    new RegExp(`agenticgraph-chat-stream-sw\\.js\\?${revisionQuery}`),
    'public service worker must revision-bind its chat runtime import',
  )
  assert.match(
    revisionAuthority,
    new RegExp(`const sourceRevision = ["']${expectedRevision}["']`),
    'public active-worker authority must report the exact release revision',
  )
  assert.match(chatRuntime, new RegExp(CHAT_RUNTIME_SCHEMA))
  assert.doesNotMatch(
    chatRuntime,
    /addEventListener\(["'](?:install|activate)["']/,
    'public chat runtime must not retain legacy lifecycle listeners',
  )
}

const waitForDocumentRevision = async (page, expectedRevision) => {
  const expectedPrefix = `/agenticgraph/assets/${expectedRevision}/`
  await page.waitForFunction(prefix => {
    const scripts = Array.from(document.scripts)
      .map(script => script.src)
      .filter(Boolean)
      .map(source => new URL(source).pathname)
      .filter(pathname => pathname.startsWith('/agenticgraph/assets/'))
    return scripts.length > 0 && scripts.every(pathname => pathname.startsWith(prefix))
  }, expectedPrefix, { timeout: WAIT_TIMEOUT_MS })
  const scriptPaths = await page.evaluate(() => Array.from(document.scripts)
    .map(script => script.src)
    .filter(Boolean)
    .map(source => new URL(source).pathname)
    .filter(pathname => pathname.startsWith('/agenticgraph/assets/')))
  assert.ok(scriptPaths.length > 0, 'document must load a revision-bound application script')
  assert.deepEqual(
    scriptPaths.filter(pathname => !pathname.startsWith(expectedPrefix)),
    [],
    'document scripts must all belong to the expected release revision',
  )
  return scriptPaths
}

const writeSentinels = async (page, value) => page.evaluate(async ({ databaseName, key, sentinel }) => {
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

const readSentinels = async page => page.evaluate(async ({ databaseName, key }) => {
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

const readServiceWorkerRevisionEvidence = async page => page.evaluate(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations()
  const readWorkerAttestation = (worker, requestType, responseType, readValue) => new Promise(resolve => {
    if (!worker) {
      resolve('')
      return
    }
    const channel = new MessageChannel()
    let settled = false
    const finish = revision => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      channel.port1.onmessage = null
      channel.port1.onmessageerror = null
      channel.port1.close()
      try {
        channel.port2.close()
      } catch {
        // The worker owns the transferred endpoint after postMessage succeeds.
      }
      resolve(revision)
    }
    channel.port1.onmessage = event => {
      const data = event.data
      finish(data?.type === responseType ? readValue(data) : '')
    }
    channel.port1.onmessageerror = () => finish('')
    channel.port1.start()
    const timeoutId = setTimeout(() => finish(''), 2_000)
    try {
      worker.postMessage(
        { type: requestType },
        [channel.port2],
      )
    } catch {
      finish('')
    }
  })
  const readActiveAttestedRevision = worker => readWorkerAttestation(
    worker,
    'AG_SERVICE_WORKER_SOURCE_REVISION_REQUEST',
    'AG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE',
    data => {
      const revision = String(data?.sourceRevision || '')
      return /^[0-9a-f]{40}$/.test(revision) ? revision : ''
    },
  )
  const readChatRuntimeSchema = worker => readWorkerAttestation(
    worker,
    'AG_CHAT_STREAM_RUNTIME_ATTEST_REQUEST',
    'AG_CHAT_STREAM_RUNTIME_ATTEST_RESPONSE',
    data => String(data?.schema || '') === 'agenticgraph-chat-stream-worker/v2'
      ? 'agenticgraph-chat-stream-worker/v2'
      : '',
  )
  const activeAttestedRevision = registrations.length === 1
    ? await readActiveAttestedRevision(registrations[0].active)
    : ''
  const controllerAttestedRevision = await readActiveAttestedRevision(
    navigator.serviceWorker.controller,
  )
  const activeChatRuntimeSchema = registrations.length === 1
    ? await readChatRuntimeSchema(registrations[0].active)
    : ''
  const controllerChatRuntimeSchema = await readChatRuntimeSchema(
    navigator.serviceWorker.controller,
  )
  const cacheNames = await caches.keys()
  const precacheCacheNames = cacheNames
    .filter(cacheName => cacheName.startsWith('workbox-precache'))
    .sort()
  const cachedAssetPaths = []
  const cachedHtmlPaths = []
  const preservedSiblingHtmlPaths = []
  const precacheAssetPaths = []
  const precacheHtmlPaths = []
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName)
    const isAgenticGraphOwnedCache = ['kg-assets', 'kg-static', 'kg-data'].includes(cacheName)
      || (
        cacheName.startsWith('workbox-precache')
        && cacheName.includes(`${window.location.origin}/agenticgraph/`)
      )
    const requests = await cache.keys()
    for (const request of requests) {
      const url = new URL(request.url)
      if (url.origin !== window.location.origin) continue
      const isAsset = url.pathname.startsWith('/agenticgraph/assets/')
      const isScopedPath = url.pathname === '/agenticgraph' || url.pathname.startsWith('/agenticgraph/')
      const response = await cache.match(request)
      const contentType = String(response?.headers.get('content-type') || '').trim()
      const isHtml = url.pathname === '/agenticgraph'
        || url.pathname === '/agenticgraph/'
        || (url.pathname.startsWith('/agenticgraph/') && url.pathname.endsWith('.html'))
        || /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)
      const cacheKey = `${url.pathname}${url.search}`
      if (isAsset) cachedAssetPaths.push(url.pathname)
      if (isHtml && (isAgenticGraphOwnedCache || isScopedPath)) cachedHtmlPaths.push(cacheKey)
      if (isHtml && !isAgenticGraphOwnedCache && !isScopedPath) preservedSiblingHtmlPaths.push(cacheKey)
      if (cacheName.startsWith('workbox-precache')) {
        if (isAsset) precacheAssetPaths.push(url.pathname)
        if (isHtml) precacheHtmlPaths.push(cacheKey)
      }
    }
  }
  const cachedAssetNamespaces = [...new Set(cachedAssetPaths
    .map(pathname => pathname.match(/^\/agenticgraph\/assets\/([^/]+)\//)?.[1] || 'unversioned'))]
    .sort()
  const precacheAssetNamespaces = [...new Set(precacheAssetPaths
    .map(pathname => pathname.match(/^\/agenticgraph\/assets\/([^/]+)\//)?.[1] || 'unversioned'))]
    .sort()
  return {
    registrations: registrations.map(registration => ({
      scope: registration.scope,
      updateViaCache: registration.updateViaCache,
      activeState: registration.active?.state || '',
      activeScriptUrl: registration.active?.scriptURL || '',
      installingScriptUrl: registration.installing?.scriptURL || '',
      waitingScriptUrl: registration.waiting?.scriptURL || '',
    })),
    controllerScriptUrl: navigator.serviceWorker.controller?.scriptURL || '',
    activeAttestedRevision,
    controllerAttestedRevision,
    activeChatRuntimeSchema,
    controllerChatRuntimeSchema,
    controllerMatchesActive: registrations.length === 1
      && navigator.serviceWorker.controller === registrations[0].active,
    cacheNames: [...cacheNames].sort(),
    cachedAssetCount: cachedAssetPaths.length,
    cachedAssetNamespaces,
    cachedHtmlPaths: [...new Set(cachedHtmlPaths)].sort(),
    preservedSiblingHtmlPaths: [...new Set(preservedSiblingHtmlPaths)].sort(),
    precacheCacheNames,
    precacheAssetCount: precacheAssetPaths.length,
    precacheAssetNamespaces,
    precacheHtmlPaths: [...new Set(precacheHtmlPaths)].sort(),
  }
})

const isExpectedServiceWorkerRevision = (
  evidence,
  expectedRevision,
  {
    requireNoCachedHtml = false,
    requireActiveAttestation = false,
    requireNetworkOnlyRegistration = false,
    requireRevisionBoundRegistration = false,
  } = {},
) => {
  if (evidence.registrations.length !== 1) return false
  const [registration] = evidence.registrations
  const isAcceptedScriptUrl = scriptUrl => isAcceptedWorkerScriptUrl({
    scriptUrl, profileOrigin, expectedRevision, requireRevisionBoundRegistration,
  })
  return registration.scope === canonicalWorkerScope
    && (!requireNetworkOnlyRegistration || registration.updateViaCache === 'none')
    && registration.activeState === 'activated'
    && isAcceptedScriptUrl(registration.activeScriptUrl)
    && registration.installingScriptUrl === ''
    && registration.waitingScriptUrl === ''
    && isAcceptedScriptUrl(evidence.controllerScriptUrl)
    && evidence.controllerMatchesActive
    && (!requireActiveAttestation || (
      evidence.activeAttestedRevision === expectedRevision
      && evidence.controllerAttestedRevision === expectedRevision
      && evidence.activeChatRuntimeSchema === CHAT_RUNTIME_SCHEMA
      && evidence.controllerChatRuntimeSchema === CHAT_RUNTIME_SCHEMA
    ))
    && evidence.cachedAssetCount > 0
    && evidence.cachedAssetNamespaces.length === 1
    && evidence.cachedAssetNamespaces[0] === expectedRevision
    && evidence.precacheCacheNames.length === 1
    && evidence.precacheAssetCount > 0
    && evidence.precacheAssetNamespaces.length === 1
    && evidence.precacheAssetNamespaces[0] === expectedRevision
    && (!requireNoCachedHtml || (
      evidence.cachedHtmlPaths.length === 0
      && evidence.precacheHtmlPaths.length === 0
    ))
}

const waitForServiceWorkerRevision = async (
  page,
  expectedRevision,
  requirements = {},
) => {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  let evidence = null
  while (Date.now() < deadline) {
    try {
      evidence = await readServiceWorkerRevisionEvidence(page)
      if (isExpectedServiceWorkerRevision(
        evidence,
        expectedRevision,
        requirements,
      )) return evidence
    } catch {
      // The controlled document may reload while the new worker claims it.
    }
    await page.waitForTimeout(250)
  }
  assert.fail(
    `service worker did not converge to ${expectedRevision}: ${JSON.stringify(evidence)}`,
  )
}

const observePageFailures = page => {
  const pageErrors = []
  const scriptPaths = []
  const poisonedModules = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => {
    const request = response.request()
    const url = new URL(response.url())
    if (request.resourceType() !== 'script') return
    if (url.pathname.startsWith('/agenticgraph/assets/')) scriptPaths.push(url.pathname)
    if (String(response.headers()['content-type'] || '').toLowerCase().includes('text/html')) {
      poisonedModules.push(response.url())
    }
  })
  return { pageErrors, scriptPaths, poisonedModules }
}

const launchProfile = () => chromium.launchPersistentContext(profileDirectory, {
  channel: 'chrome',
  headless: browserHeadless,
  serviceWorkers: 'allow',
})

const prewarm = async () => {
  await fs.mkdir(profileDirectory, { recursive: false })
  const previousRevision = await readRuntimeRevision()
  const expectedRevision = String(process.env.RELEASE_SHA || '').trim()
  const transitionKind = classifyServiceWorkerReleaseTransition({
    previousRevision,
    expectedRevision,
  })
  const sentinel = `${previousRevision}:${Date.now()}`
  const context = await launchProfile()
  try {
    let page = context.pages()[0]
    if (!page) page = await context.newPage()
    const prewarmObservation = observePageFailures(page)
    const initialNavigationResponse = await page.goto(
      `${profileOrigin}/agenticgraph/?kgSwUpgradePrewarm=${previousRevision}`,
      {
        waitUntil: 'domcontentloaded',
        timeout: WAIT_TIMEOUT_MS,
      },
    )
    assert.ok(initialNavigationResponse, 'prewarm requires an initial navigation response')
    await waitForDocumentRevision(page, previousRevision)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    const reloadNavigationResponse = await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: WAIT_TIMEOUT_MS,
    })
    assert.ok(reloadNavigationResponse, 'prewarm requires a controlled reload response')
    const scriptPaths = await waitForDocumentRevision(page, previousRevision)
    const seededCachePaths = await seedReturningUserCacheProof(
      page,
      transitionKind === 'revision-upgrade' ? previousRevision : '',
    )
    const serviceWorker = await waitForServiceWorkerRevision(page, previousRevision)
    await writeSentinels(page, sentinel)
    assert.deepEqual(
      prewarmObservation.poisonedModules,
      [],
      `prewarm JavaScript module requests returned HTML: ${prewarmObservation.poisonedModules.join(', ')}`,
    )
    assert.deepEqual(
      prewarmObservation.pageErrors,
      [],
      `prewarm browser errors: ${prewarmObservation.pageErrors.join(' | ')}`,
    )
    const navigation = {
      initialFromServiceWorker: initialNavigationResponse.fromServiceWorker(),
      reloadFromServiceWorker: reloadNavigationResponse.fromServiceWorker(),
    }
    await fs.writeFile(evidencePath, `${JSON.stringify({
      schema: EVIDENCE_SCHEMA,
      profileOrigin,
      previousRevision,
      expectedRevision,
      transitionKind,
      sentinel,
      scriptPaths,
      navigation,
      seededCachePaths,
      serviceWorker,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    process.stdout.write(`${JSON.stringify({
      status: 'prewarmed',
      profileOrigin,
      previousRevision,
      expectedRevision,
      transitionKind,
      navigation,
      seededCachePaths,
      serviceWorker,
    })}\n`)
  } finally {
    await context.close()
  }
}

const verify = async () => {
  const expectedRevision = String(process.env.RELEASE_SHA || '').trim()
  assert.match(expectedRevision, SHA_PATTERN, 'RELEASE_SHA must be an exact source revision')
  const evidence = JSON.parse(await fs.readFile(evidencePath, 'utf8'))
  assert.equal(evidence.schema, EVIDENCE_SCHEMA)
  assert.equal(evidence.profileOrigin, profileOrigin)
  assert.match(evidence.previousRevision, SHA_PATTERN)
  assert.equal(evidence.expectedRevision, expectedRevision)
  const transitionKind = classifyServiceWorkerReleaseTransition({
    previousRevision: evidence.previousRevision,
    expectedRevision,
  })
  assert.equal(evidence.transitionKind, transitionKind)
  assert.equal(typeof evidence.navigation?.initialFromServiceWorker, 'boolean')
  assert.equal(typeof evidence.navigation?.reloadFromServiceWorker, 'boolean')
  if (transitionKind === 'revision-upgrade') {
    assert.notEqual(evidence.previousRevision, expectedRevision)
    assert.equal(
      evidence.seededCachePaths?.assetPath,
      `/agenticgraph/assets/${evidence.previousRevision}/service-worker-upgrade-stale-runtime-proof.js`,
    )
    assert.deepEqual(
      evidence.seededCachePaths?.htmlPaths,
      [
        `/agenticgraph?kgSwUpgradeStaleHtmlProof=${evidence.previousRevision}`,
        `/agenticgraph/deep-link?kgSwUpgradeStaleHtmlProof=${evidence.previousRevision}`,
        `/favicon.ico?kgSwUpgradeStaleHtmlProof=${evidence.previousRevision}`,
      ],
    )
  } else {
    assert.equal(evidence.previousRevision, expectedRevision)
    assert.equal(evidence.seededCachePaths?.assetPath, null)
    assert.deepEqual(evidence.seededCachePaths?.htmlPaths, [])
  }
  assert.equal(
    evidence.seededCachePaths?.siblingCacheName,
    'singabldr-pwa:static:20260504-2',
  )
  assert.deepEqual(
    evidence.seededCachePaths?.siblingHtmlPaths,
    ['/singabldr/', '/singabldr/index.html'],
  )
  assert.ok(
    isExpectedServiceWorkerRevision(evidence.serviceWorker, evidence.previousRevision),
    'prewarm evidence must bind the controlled profile to the previous production worker revision',
  )
  await verifyPublishedWorkerSources(expectedRevision)

  const context = await launchProfile()
  try {
    const upgradePage = context.pages()[0] || await context.newPage()
    const upgradeObservation = observePageFailures(upgradePage)
    await upgradePage.goto(`${profileOrigin}/agenticgraph/?kgSwUpgradeVerify=${expectedRevision}`, {
      waitUntil: 'domcontentloaded',
      timeout: WAIT_TIMEOUT_MS,
    }).catch(error => {
      if (!/interrupted by another navigation|ERR_ABORTED/i.test(String(error?.message || error))) throw error
    })
    await waitForDocumentRevision(upgradePage, expectedRevision)
    const upgradeServiceWorker = await waitForServiceWorkerRevision(
      upgradePage,
      expectedRevision,
      {
        requireNoCachedHtml: true,
        requireActiveAttestation: true,
        requireNetworkOnlyRegistration: true,
        requireRevisionBoundRegistration: true,
      },
    )
    assert.deepEqual(
      upgradeServiceWorker.preservedSiblingHtmlPaths,
      evidence.seededCachePaths.siblingHtmlPaths,
      'service worker convergence must preserve sibling application HTML caches',
    )
    await upgradePage.waitForTimeout(1_000)
    assert.deepEqual(
      upgradeObservation.poisonedModules,
      [],
      `upgrade-tab JavaScript module requests returned HTML: ${upgradeObservation.poisonedModules.join(', ')}`,
    )
    assert.deepEqual(
      upgradeObservation.pageErrors,
      [],
      `upgrade-tab browser errors: ${upgradeObservation.pageErrors.join(' | ')}`,
    )
    assert.deepEqual(await readSentinels(upgradePage), {
      local: evidence.sentinel,
      indexed: evidence.sentinel,
    }, 'service worker convergence must preserve local-first browser storage')

    const finalPage = await context.newPage()
    const finalObservation = observePageFailures(finalPage)
    const navigationResponse = await finalPage.goto(
      `${profileOrigin}/agenticgraph/?kgSwUpgradeFinal=${expectedRevision}`,
      { waitUntil: 'domcontentloaded', timeout: WAIT_TIMEOUT_MS },
    )
    assert.ok(navigationResponse, 'returning-user verification requires an HTTP navigation response')
    assert.equal(navigationResponse.fromServiceWorker(), false, 'production HTTP must remain the sole HTML owner')
    await waitForDocumentRevision(finalPage, expectedRevision)
    const finalServiceWorker = await waitForServiceWorkerRevision(
      finalPage,
      expectedRevision,
      {
        requireNoCachedHtml: true,
        requireActiveAttestation: true,
        requireNetworkOnlyRegistration: true,
        requireRevisionBoundRegistration: true,
      },
    )
    assert.deepEqual(
      finalServiceWorker.preservedSiblingHtmlPaths,
      evidence.seededCachePaths.siblingHtmlPaths,
      'converged service worker must retain sibling application HTML caches',
    )
    await finalPage.waitForTimeout(1_000)

    const expectedPrefix = `/agenticgraph/assets/${expectedRevision}/`
    assert.ok(finalObservation.scriptPaths.length > 0, 'returning-user verification must observe application scripts')
    assert.deepEqual(
      [...new Set(finalObservation.scriptPaths.filter(pathname => !pathname.startsWith(expectedPrefix)))],
      [],
      'converged returning-user scripts must all belong to the exact release revision',
    )
    assert.deepEqual(
      finalObservation.poisonedModules,
      [],
      `JavaScript module requests returned HTML: ${finalObservation.poisonedModules.join(', ')}`,
    )
    assert.deepEqual(
      finalObservation.pageErrors,
      [],
      `converged returning-user browser errors: ${finalObservation.pageErrors.join(' | ')}`,
    )
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      transitionKind,
      profileOrigin,
      previousRevision: evidence.previousRevision,
      sourceRevision: expectedRevision,
      prewarmNavigation: evidence.navigation,
      upgradeServiceWorker,
      finalServiceWorker,
      storagePreserved: true,
    })}\n`)
  } finally {
    await context.close()
  }
}

if (mode === 'prewarm') await prewarm()
else await verify()
