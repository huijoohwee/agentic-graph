import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  encodePublishedDocShareToken,
  resolvePublishedDocIdentity,
} from '../canvas/src/features/canvas/canvasDocShareToken.mjs'
import { LIVE_CANVAS_HERO_SOURCE_SESSION_KEY } from '../canvas/src/features/canvas/liveCanvasHeroSourceSelectionContract.mjs'
import { validateProductionRuntimeReadiness } from './production-runtime-readiness.mjs'
import { KNOWGRPH_WORKSPACE_SEED_INVENTORY } from './workspace-seed-authority.mjs'

const normalizeOrigin = value => {
  const url = new URL(String(value || 'https://airvio.co'))
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

const browserOrigin = normalizeOrigin(process.env.PRODUCTION_ORIGIN)
const markerOrigin = normalizeOrigin(process.env.PRODUCTION_MARKER_ORIGIN || browserOrigin)
const expectedSourceRevision = String(process.env.RELEASE_SHA || '').trim()
const expectedManifestDigest = String(process.env.PRODUCTION_IMMUTABLE_MANIFEST_DIGEST || '').trim()
const browserHeadless = String(process.env.PRODUCTION_BROWSER_HEADLESS || 'true').trim() !== 'false'
if (!/^[0-9a-f]{40}$/.test(expectedSourceRevision)) throw new Error('RELEASE_SHA must be an exact lowercase 40-character SHA')
if (!/^[0-9a-f]{64}$/.test(expectedManifestDigest)) {
  throw new Error('PRODUCTION_IMMUTABLE_MANIFEST_DIGEST must be an exact lowercase SHA-256 digest')
}

const fetchMarker = async pathname => {
  const response = await fetch(`${markerOrigin}${pathname}`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  })
  const body = await response.text()
  assert.equal(response.status, 200, `${pathname} must return 200`)
  assert.match(response.headers.get('content-type') || '', /^application\/json\b/i)
  return { body, marker: JSON.parse(body) }
}

const PHYSICS_PLAYGROUND_PATTERN = /Physics runtime running with (?:ball|rocket) selected\./
const WEBGL_SOFTWARE_RENDERING_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader-webgl',
  '--enable-unsafe-swiftshader',
]

const isCanvasReady = text => text.length > 200
  && !text.includes('Preparing canvas view...')
  && !text.includes('Switching document:')
  && !text.includes('Switching document...')
  && PHYSICS_PLAYGROUND_PATTERN.test(text)

const waitForCanvas = async resolveBody => {
  const deadline = Date.now() + 45_000
  let lastError = null
  let lastText = ''
  while (Date.now() < deadline) {
    try {
      const body = await resolveBody()
      const text = await body.innerText({ timeout: 2_000 })
      lastText = text
      if (isCanvasReady(text)) return text
    } catch (error) {
      // Document selection replaces the frame; re-resolve it until the selected canvas owns the page.
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const observed = lastText.replace(/\s+/g, ' ').trim().slice(0, 240)
  const detail = observed ? ` Last observed text: ${observed}` : ''
  throw new Error(`Canvas did not reach a stable ready state within 45 seconds.${detail}`, { cause: lastError })
}

const resolveHomeCanvasFrames = page => page.frames().filter(candidate => {
    if (candidate === page.mainFrame()) return false
    try {
      const url = new URL(candidate.url())
      return url.pathname.replace(/\/$/, '') === '/knowgrph'
        && url.searchParams.get('kgPreview') === '1'
    } catch {
      return false
    }
  })

const resolveHomeCanvasBody = async page => {
  const frame = resolveHomeCanvasFrames(page).at(-1)
  // The Home startup handoff may promote the selected canvas into the top-level surface.
  return frame ? frame.locator('body') : page.locator('body')
}

const readHomeSourceAuthority = async page => {
  const frames = resolveHomeCanvasFrames(page)
  const targets = frames.length > 0 ? frames : [page]
  const evidenceByTarget = await Promise.all(targets.map(async target => ({
    url: target.url(),
    ...await target.evaluate(() => ({
      prematureSceneMounts: window.__kgHomeSourceAuthorityEvidence || [],
      sceneAuthorityMounts: window.__kgHomeXrSceneAuthorityEvidence || [],
      sceneRootCount: document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]').length,
      documentLoadedRootCount: document.querySelectorAll(
        '[data-kg-xr-scene-media-drop="1"][data-kg-xr-document-loaded="1"]',
      ).length,
      canvasCount: document.querySelectorAll('[data-kg-xr-scene-media-drop="1"] canvas').length,
      sceneAuthorities: Array.from(document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]'))
        .map(element => element.getAttribute('data-kg-xr-scene-authority')),
      emptyWorldCount: document.querySelectorAll('[data-kg-xr-empty-world="1"]').length,
      gameStageCount: document.querySelectorAll('[data-kg-game-fps-stage]').length,
      viewportLabels: Array.from(document.querySelectorAll('[data-kg-canvas-viewport-root="1"]'))
        .map(element => element.getAttribute('aria-label')),
      heavyRuntimeIntents: Array.from(document.querySelectorAll('[data-kg-canvas-heavy-runtime-intent]'))
        .map(element => element.getAttribute('data-kg-canvas-heavy-runtime-intent')),
      bodyTextTail: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(-500),
    })),
  })))
  return evidenceByTarget.reduce((total, evidence) => ({
    targetUrls: [...total.targetUrls, evidence.url],
    prematureSceneMounts: [...total.prematureSceneMounts, ...evidence.prematureSceneMounts],
    sceneAuthorityMounts: [...total.sceneAuthorityMounts, ...evidence.sceneAuthorityMounts],
    sceneRootCount: total.sceneRootCount + evidence.sceneRootCount,
    documentLoadedRootCount: total.documentLoadedRootCount + evidence.documentLoadedRootCount,
    canvasCount: total.canvasCount + evidence.canvasCount,
    sceneAuthorities: [...total.sceneAuthorities, ...evidence.sceneAuthorities],
    emptyWorldCount: total.emptyWorldCount + evidence.emptyWorldCount,
    gameStageCount: total.gameStageCount + evidence.gameStageCount,
    viewportLabels: [...total.viewportLabels, ...evidence.viewportLabels],
    heavyRuntimeIntents: [...total.heavyRuntimeIntents, ...evidence.heavyRuntimeIntents],
    bodyTextTail: evidence.bodyTextTail || total.bodyTextTail,
  }), {
    targetUrls: [],
    prematureSceneMounts: [],
    sceneAuthorityMounts: [],
    sceneRootCount: 0,
    documentLoadedRootCount: 0,
    canvasCount: 0,
    sceneAuthorities: [],
    emptyWorldCount: 0,
    gameStageCount: 0,
    viewportLabels: [],
    heavyRuntimeIntents: [],
    bodyTextTail: '',
  })
}

const waitForHomeSourceAuthority = async page => {
  const deadline = Date.now() + 30_000
  let lastEvidence = null
  let lastError = null
  while (Date.now() < deadline) {
    try {
      lastEvidence = await readHomeSourceAuthority(page)
      if (
        lastEvidence.sceneRootCount === 1
        && lastEvidence.documentLoadedRootCount === 1
        && lastEvidence.canvasCount === 1
      ) return lastEvidence
    } catch (error) {
      // The remote-document handoff may replace the frame; always re-resolve it on the next poll.
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(
    `Home source authority did not stabilize: ${JSON.stringify(lastEvidence)}`,
    { cause: lastError },
  )
}

const readVisibleWorkspaceSeedInventory = async seedFolder => seedFolder.evaluate(section => {
  const childList = section.nextElementSibling
  if (!(childList instanceof HTMLUListElement)) return []
  return Array.from(childList.querySelectorAll(':scope > li > section[aria-label^="File "]'))
    .map(element => String(element.getAttribute('aria-label') || '').replace(/^File /, ''))
    .filter(Boolean)
    .sort()
})

const openWorkspaceFolder = async (parent, name) => {
  const folderLabel = `Folder ${name}`
  const folder = parent.locator(`section[aria-label="${folderLabel}"]`)
  await folder.waitFor({ state: 'visible', timeout: 45_000 })
  const isExpanded = await folder.evaluate(section => section.nextElementSibling instanceof HTMLUListElement)
  if (!isExpanded) await folder.getByRole('button', { name: folderLabel, exact: true }).click()
  await folder.locator('xpath=following-sibling::ul[1]').waitFor({ state: 'visible', timeout: 45_000 })
  return folder
}

const waitForWorkspaceSeedInventory = async page => {
  const explorer = page.locator('aside[aria-label="Markdown Explorer"]')
  if (!await explorer.isVisible()) {
    await page.getByRole('button', { name: 'Workspace View', exact: true }).click()
    const editorWorkspace = page.getByRole('button', { name: 'Editor Workspace', exact: true })
    await editorWorkspace.waitFor({ state: 'visible', timeout: 45_000 })
    await editorWorkspace.click()
  }
  await explorer.waitFor({ state: 'visible', timeout: 45_000 })
  const sourceFilesSection = explorer.locator('section[aria-label="Source Files"]')
  await sourceFilesSection.waitFor({ state: 'visible', timeout: 45_000 })
  const sourceFilesToggle = sourceFilesSection.getByRole('button', { name: 'Source Files', exact: true })
  if (await sourceFilesToggle.getAttribute('aria-expanded') === 'false') await sourceFilesToggle.click()
  const sourceFilesContent = sourceFilesSection.locator('section[aria-label="Source Files content"]')
  await sourceFilesContent.waitFor({ state: 'visible', timeout: 45_000 })
  await openWorkspaceFolder(sourceFilesContent, 'docs')
  const seedFolder = await openWorkspaceFolder(sourceFilesContent, 'workspace-seeds')
  const expected = [...KNOWGRPH_WORKSPACE_SEED_INVENTORY].sort()
  const deadline = Date.now() + 45_000
  let observed = []
  while (Date.now() < deadline) {
    observed = await readVisibleWorkspaceSeedInventory(seedFolder)
    if (JSON.stringify(observed) === JSON.stringify(expected)) return observed
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(
    `Explorer Source Files workspace-seeds inventory mismatch: expected=${JSON.stringify(expected)} observed=${JSON.stringify(observed)}`,
  )
}

const markerAtApex = await fetchMarker('/.well-known/runtime-readiness.json')
const markerAtApp = await fetchMarker('/knowgrph/.well-known/runtime-readiness.json')
assert.equal(markerAtApex.body, markerAtApp.body, 'apex and /knowgrph readiness markers must be byte-identical')
await validateProductionRuntimeReadiness(markerAtApex.marker, {
  sourceRevision: expectedSourceRevision,
  immutableManifestDigest: expectedManifestDigest,
})
for (const missingPath of [
  `/knowgrph-release-missing-${expectedSourceRevision}.png`,
  `/knowgrph-release-missing-${expectedSourceRevision}.js`,
  `/knowgrph-release-missing-${expectedSourceRevision}/`,
  '/index.html',
  '/hackamap/',
]) {
  const missingResponse = await fetch(`${markerOrigin}${missingPath}`, {
    cache: 'no-store',
    redirect: 'manual',
  })
  const missingBody = await missingResponse.text()
  assert.equal(missingResponse.status, 404, 'missing assets must not resolve through the apex Home app shell')
  assert.match(missingResponse.headers.get('content-type') || '', /^text\/html\b/i)
  assert.match(missingBody, /<h1>Not found<\/h1>/)
  assert.doesNotMatch(missingBody, /\/knowgrph\/assets\//)
}
const siblingAppResponse = await fetch(`${markerOrigin}/singabldr/`, { cache: 'no-store' })
const siblingAppBody = await siblingAppResponse.text()
assert.equal(siblingAppResponse.status, 200, 'the Pages 404 boundary must preserve the sibling Singabldr app')
assert.match(siblingAppResponse.headers.get('content-type') || '', /^text\/html\b/i)
assert.match(siblingAppBody, /<title>Singabldr<\/title>/)
const siblingManifestResponse = await fetch(`${markerOrigin}/singabldr/manifest.webmanifest`, {
  cache: 'no-store',
})
assert.equal(siblingManifestResponse.status, 200, 'the Pages 404 boundary must preserve sibling static assets')
assert.equal((await siblingManifestResponse.json()).name, 'Singabldr')
const siblingWorkerResponse = await fetch(`${markerOrigin}/singabldr/sw.js`, { cache: 'no-store' })
assert.equal(siblingWorkerResponse.status, 200, 'the Pages 404 boundary must preserve the sibling worker')
assert.match(siblingWorkerResponse.headers.get('content-type') || '', /javascript/i)

const browser = await chromium.launch({
  channel: 'chrome',
  headless: browserHeadless,
  // Release proof runs only the trusted immutable candidate and needs WebGL on GPU-less CI hosts.
  args: WEBGL_SOFTWARE_RENDERING_ARGS,
})
const context = await browser.newContext({ serviceWorkers: 'block' })
const installHomeSourceAuthorityEvidence = targetContext => targetContext.addInitScript(() => {
  const prematureSceneMounts = []
  const sceneAuthorityMounts = []
  const observedSceneRoots = new WeakSet()
  const recordSceneAuthorityMount = () => {
    const sceneRoots = document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]')
    for (const root of sceneRoots) {
      if (observedSceneRoots.has(root)) continue
      observedSceneRoots.add(root)
      sceneAuthorityMounts.push({
        authority: root.getAttribute('data-kg-xr-scene-authority'),
        documentLoaded: root.getAttribute('data-kg-xr-document-loaded'),
      })
    }
  }
  const recordPrematureSceneMount = () => {
    recordSceneAuthorityMount()
    const sceneRoots = document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]')
    const canonicalSourceReady = document.querySelector('[data-kg-xr-physics-run-ready="full-frame"]')
      || Array.from(sceneRoots).every(root => root.getAttribute('data-kg-xr-document-loaded') === '1')
    if (sceneRoots.length === 0 || canonicalSourceReady) return
    prematureSceneMounts.push({
      rootCount: sceneRoots.length,
      documentLoaded: Array.from(sceneRoots).map(root => root.getAttribute('data-kg-xr-document-loaded')),
      sceneAuthorities: Array.from(sceneRoots).map(root => root.getAttribute('data-kg-xr-scene-authority')),
      emptyWorldCount: document.querySelectorAll('[data-kg-xr-empty-world="1"]').length,
      gameStageCount: document.querySelectorAll('[data-kg-game-fps-stage]').length,
    })
  }
  new MutationObserver(recordPrematureSceneMount).observe(document, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: [
      'data-kg-xr-document-loaded',
      'data-kg-xr-physics-run-ready',
      'data-kg-xr-scene-authority',
      'data-kg-xr-scene-media-drop',
    ],
  })
  Object.defineProperty(window, '__kgHomeSourceAuthorityEvidence', {
    configurable: false,
    get: () => prematureSceneMounts.slice(),
  })
  Object.defineProperty(window, '__kgHomeXrSceneAuthorityEvidence', {
    configurable: false,
    get: () => sceneAuthorityMounts.slice(),
  })
})
await installHomeSourceAuthorityEvidence(context)
const pageErrors = []
const poisonedModules = []
const browserAssetScripts = []
context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)))
context.on('response', response => {
  const request = response.request()
  const contentType = String(response.headers()['content-type'] || '').toLowerCase()
  const url = new URL(response.url())
  if (request.resourceType() === 'script' && url.pathname.startsWith('/knowgrph/assets/')) {
    browserAssetScripts.push(url.pathname)
  }
  if (request.resourceType() === 'script' && contentType.includes('text/html')) {
    poisonedModules.push(response.url())
  }
})

let staleSelectionContext = null
try {
  const home = await context.newPage()
  await home.goto(`${browserOrigin}/?kgReleaseProof=${expectedSourceRevision}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await home.locator('h1').filter({ hasText: 'Map intent' }).waitFor({ state: 'visible', timeout: 30_000 })
  const heading = await home.locator('h1').innerText()
  for (const phrase of ['Map intent', 'Run agents', 'Get results']) assert.ok(heading.includes(phrase))
  const promptPresetFieldset = home.locator('[data-kg-live-canvas-hero-prompt-presets="true"]')
  const promptPresetSelect = promptPresetFieldset.locator('[data-kg-live-canvas-hero-prompt-preset-select="true"]')
  await promptPresetSelect.waitFor({ state: 'visible', timeout: 30_000 })
  assert.equal(
    await promptPresetFieldset.locator('[role="alert"]').count(),
    0,
    'Home prompt catalog must load without a source-authority alert',
  )
  assert.ok(
    await promptPresetSelect.locator('option').count() >= 11,
    'Home must load the complete canonical prompt preset catalog',
  )
  const heroFrameElement = home.locator('iframe').first()
  await heroFrameElement.waitFor({ state: 'attached', timeout: 30_000 })
  const heroFrameSrc = await heroFrameElement.getAttribute('src')
  assert.ok(heroFrameSrc, 'Home must mount the canonical shared-canvas iframe')
  assert.equal(new URL(heroFrameSrc, browserOrigin).searchParams.get('kgPreview'), '1')
  const heroCanvasText = await waitForCanvas(() => resolveHomeCanvasBody(home))
  assert.match(heroCanvasText, PHYSICS_PLAYGROUND_PATTERN)
  assert.match(heroCanvasText, /Beach Ball/)
  assert.match(heroCanvasText, /Rocket/)
  assert.doesNotMatch(heroCanvasText, /Validation seed fallback/)
  const homeSourceAuthority = await waitForHomeSourceAuthority(home)
  assert.deepEqual(homeSourceAuthority.prematureSceneMounts, [], 'Home mounted an XR world before canonical source readiness')
  assert.ok(homeSourceAuthority.sceneAuthorityMounts.length > 0, 'Home must record its first XR scene authority')
  assert.deepEqual(
    homeSourceAuthority.sceneAuthorityMounts.map(mount => mount.authority),
    homeSourceAuthority.sceneAuthorityMounts.map(() => 'native-controller'),
    `Home recovered from a non-canonical XR scene owner: ${JSON.stringify(homeSourceAuthority.sceneAuthorityMounts)}`,
  )
  assert.equal(homeSourceAuthority.sceneRootCount, 1, 'Home must retain exactly one canonical XR scene root')
  assert.equal(homeSourceAuthority.documentLoadedRootCount, 1, 'Home XR scene root must own the loaded source document')
  assert.equal(homeSourceAuthority.canvasCount, 1, 'Home must retain exactly one canonical XR Canvas')
  assert.deepEqual(homeSourceAuthority.sceneAuthorities, ['native-controller'], 'Home canonical Physics must retain native-controller scene authority')
  assert.equal(homeSourceAuthority.emptyWorldCount, 0, 'Home must never retain an empty-world fallback')
  assert.equal(homeSourceAuthority.gameStageCount, 0, 'Home must not activate Game Mode before explicit invocation')

  const canonicalHomeIdentity = resolvePublishedDocIdentity({
    shareUrl: new URL(heroFrameSrc, browserOrigin).toString(),
    appBasePath: '/knowgrph',
  })
  assert.ok(canonicalHomeIdentity?.canonicalPath, 'Home iframe must expose a decodable canonical document identity')
  const conflictingShareToken = encodePublishedDocShareToken({
    canonicalPath: `${canonicalHomeIdentity.canonicalPath}.conflicting`,
  })
  staleSelectionContext = await browser.newContext({ serviceWorkers: 'block' })
  await staleSelectionContext.addInitScript(({ key, selection }) => {
    if (window.location.pathname === '/') {
      window.sessionStorage.setItem(key, JSON.stringify(selection))
    }
  }, {
    key: LIVE_CANVAS_HERO_SOURCE_SESSION_KEY,
    selection: {
      sourcePath: canonicalHomeIdentity.canonicalPath,
      embedUrl: `${browserOrigin}/knowgrph/share/${conflictingShareToken}?kgPreview=1`,
    },
  })
  await installHomeSourceAuthorityEvidence(staleSelectionContext)
  staleSelectionContext.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)))
  const staleHome = await staleSelectionContext.newPage()
  await staleHome.goto(`${browserOrigin}/?kgReleaseProof=${expectedSourceRevision}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await staleHome.locator('h1').filter({ hasText: 'Map intent' }).waitFor({ state: 'visible', timeout: 30_000 })
  const staleHeroFrame = staleHome.locator('iframe').first()
  await staleHeroFrame.waitFor({ state: 'attached', timeout: 30_000 })
  const staleHeroFrameSrc = await staleHeroFrame.getAttribute('src')
  assert.ok(staleHeroFrameSrc, 'Home must recover a canonical iframe from a persisted source conflict')
  const recoveredIdentity = resolvePublishedDocIdentity({
    shareUrl: new URL(staleHeroFrameSrc, browserOrigin).toString(),
    appBasePath: '/knowgrph',
  })
  assert.deepEqual(recoveredIdentity, canonicalHomeIdentity, 'persisted source conflict must recover the canonical Home document')
  const retainedSelection = await staleHome.evaluate(key => window.sessionStorage.getItem(key), LIVE_CANVAS_HERO_SOURCE_SESSION_KEY)
  assert.equal(retainedSelection, null, 'persisted source conflict must be removed at the Home source owner')
  const recoveredCanvasText = await waitForCanvas(() => resolveHomeCanvasBody(staleHome))
  assert.match(recoveredCanvasText, PHYSICS_PLAYGROUND_PATTERN)
  const recoveredSourceAuthority = await waitForHomeSourceAuthority(staleHome)
  assert.deepEqual(recoveredSourceAuthority.prematureSceneMounts, [], 'stale Home source recovery mounted a premature XR world')
  assert.deepEqual(
    recoveredSourceAuthority.sceneAuthorityMounts.map(mount => mount.authority),
    recoveredSourceAuthority.sceneAuthorityMounts.map(() => 'native-controller'),
    `stale Home source recovery constructed a fallback XR owner: ${JSON.stringify(recoveredSourceAuthority.sceneAuthorityMounts)}`,
  )
  assert.equal(recoveredSourceAuthority.sceneRootCount, 1, 'stale Home source recovery must retain one XR root')
  assert.equal(recoveredSourceAuthority.canvasCount, 1, 'stale Home source recovery must retain one Canvas')
  assert.equal(recoveredSourceAuthority.emptyWorldCount, 0, 'stale Home source recovery must never mount empty-world')
  assert.equal(recoveredSourceAuthority.gameStageCount, 0, 'stale Home source recovery must never mount Game fallback')

  const app = await context.newPage()
  await app.goto(`${browserOrigin}/knowgrph?kgReleaseProof=${expectedSourceRevision}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  const appText = await waitForCanvas(() => app.locator('body'))
  assert.match(appText, PHYSICS_PLAYGROUND_PATTERN)
  assert.match(appText, /Beach Ball/)
  const workspaceSeedInventory = await waitForWorkspaceSeedInventory(app)
  assert.deepEqual(workspaceSeedInventory, [...KNOWGRPH_WORKSPACE_SEED_INVENTORY].sort())
  assert.ok(browserAssetScripts.length > 0, 'browser proof must load exact-revision Knowgrph JavaScript assets')
  const exactReleaseAssetPrefix = `/knowgrph/assets/${expectedSourceRevision}/`
  const scriptsOutsideExactReleaseNamespace = [
    ...new Set(browserAssetScripts.filter(pathname => !pathname.startsWith(exactReleaseAssetPrefix))),
  ]
  assert.deepEqual(
    scriptsOutsideExactReleaseNamespace,
    [],
    `browser loaded JavaScript outside the exact release namespace: ${scriptsOutsideExactReleaseNamespace.join(', ')}`,
  )
  assert.deepEqual(poisonedModules, [], `JavaScript module requests returned HTML: ${poisonedModules.join(', ')}`)
  assert.deepEqual(pageErrors, [], `uncaught browser errors: ${pageErrors.join(' | ')}`)
} finally {
  await staleSelectionContext?.close()
  await browser.close()
}

process.stdout.write(`${JSON.stringify({
  status: 'passed',
  browserOrigin,
  markerOrigin,
  sourceRevision: markerAtApex.marker.source.revision,
  agenticCanvasOsRevision: markerAtApex.marker.agenticCanvasOs.revision,
  artifactDigest: markerAtApex.marker.artifact.digest,
})}\n`)
