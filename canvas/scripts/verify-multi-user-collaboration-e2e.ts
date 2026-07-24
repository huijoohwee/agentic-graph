import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { chromium, type Page } from 'playwright'
import { buildKnowgrphStorageCanvasRoomPath } from '../src/lib/storage/knowgrphStorageSyncContract'
import { KNOWGRPH_STORAGE_DEVICE_ID_KEY } from '../src/lib/storage/knowgrphStorageDeviceIdentity'
import {
  QUERY_PARAM_OPEN_EDITOR_WORKSPACE,
  QUERY_PARAM_RUNTIME_IDENTITY_PROOF,
} from '../src/lib/routing/queryParams'
import { LOCAL_DOC_PARAM } from '../src/features/canvas/canvasDocDeepLink'

const DEFAULT_OWNER_APP_URL = 'http://127.0.0.1:5175/'
const DEFAULT_GUEST_APP_URL = 'http://127.0.0.1:5174/'
const DEFAULT_WORKER_URL = 'http://127.0.0.1:8787'
const DEFAULT_WORKSPACE_ID = 'kgws:test-room'
const DEFAULT_DOC_PATH = '/docs/workspace-seeds/knowgrph-physics-playground-demo.md'
const CLIENT_DEVICE_ID_PATTERN = /^dev:[A-Za-z0-9:-]{16,128}$/
const OWNER_APP_URL = process.env.KG_COLLABORATION_E2E_OWNER_URL || DEFAULT_OWNER_APP_URL
const GUEST_APP_URL = process.env.KG_COLLABORATION_E2E_GUEST_URL || DEFAULT_GUEST_APP_URL
const WORKER_URL = process.env.KG_COLLABORATION_E2E_WORKER_URL || DEFAULT_WORKER_URL
const WORKSPACE_ID = process.env.KG_COLLABORATION_E2E_WORKSPACE_ID || DEFAULT_WORKSPACE_ID
const OWNER_TOKEN = process.env.KG_COLLABORATION_E2E_OWNER_TOKEN || ''
const GUEST_TOKEN = process.env.KG_COLLABORATION_E2E_GUEST_TOKEN || ''
const OWNER_DEVICE_ID = requireClientDeviceId(
  'KG_COLLABORATION_E2E_OWNER_DEVICE_ID',
  process.env.KG_COLLABORATION_E2E_OWNER_DEVICE_ID,
)
const GUEST_DEVICE_ID = requireClientDeviceId(
  'KG_COLLABORATION_E2E_GUEST_DEVICE_ID',
  process.env.KG_COLLABORATION_E2E_GUEST_DEVICE_ID,
)
const DOC_PATH = process.env.KG_COLLABORATION_E2E_DOC_PATH || DEFAULT_DOC_PATH
const MARKER = process.env.KG_COLLABORATION_E2E_MARKER || `SMOKE_REMOTE_APPLY_MARKER_${new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z')}`
const SCREENSHOT_PREFIX = process.env.KG_COLLABORATION_E2E_SCREENSHOT_PREFIX || join(tmpdir(), 'knowgrph-collaboration-e2e')
const OWNER_SCREENSHOT_PATH = `${SCREENSHOT_PREFIX}.owner.png`
const GUEST_SCREENSHOT_PATH = `${SCREENSHOT_PREFIX}.guest.png`
const MACOS_BROWSER_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

type BrowserStoreSnapshot = {
  markdownDocumentName: string
  markdownDocumentText: string
  markdownWorkspaceIndexingInFlight: boolean
  sessionPhase: string
  statusText: string
  errorText: string
  peerCount: number
  connectedPeerCount: number
}

type RuntimeIdentityProof = {
  status: string
  transportStatus: string
  requiredDeviceCount: number
  observedDeviceCount: number
  verificationDigest: string
  message: string
  differences: string[]
  device: string
  knowgrphRevision: string
  agenticCanvasOsRevision: string
  catalogRevision: string
  catalogHydrationStatus: string
  catalogHydrationAttempts: number
}

function requireClientDeviceId(name: string, value: unknown): string {
  const normalized = String(value || '').trim()
  if (!CLIENT_DEVICE_ID_PATTERN.test(normalized)) {
    throw new Error(`${name} must match ${CLIENT_DEVICE_ID_PATTERN}`)
  }
  return normalized
}

function resolveBrowserLaunchOptions(): Parameters<typeof chromium.launch>[0] {
  const configuredExecutablePath = String(process.env.KG_COLLABORATION_E2E_BROWSER_EXECUTABLE || '').trim()
  if (configuredExecutablePath) {
    return { headless: true, executablePath: configuredExecutablePath }
  }
  const discoveredExecutablePath = MACOS_BROWSER_CANDIDATES.find(candidate => existsSync(candidate))
  if (discoveredExecutablePath) {
    return { headless: true, executablePath: discoveredExecutablePath }
  }
  return { headless: true }
}

function buildWorkspaceUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.searchParams.set(QUERY_PARAM_RUNTIME_IDENTITY_PROOF, '1')
  if (!String(url.searchParams.get(QUERY_PARAM_OPEN_EDITOR_WORKSPACE) || '').trim()) {
    url.searchParams.set(QUERY_PARAM_OPEN_EDITOR_WORKSPACE, '1')
  }
  if (!String(url.searchParams.get(LOCAL_DOC_PARAM) || '').trim()) {
    url.searchParams.set(LOCAL_DOC_PARAM, DOC_PATH)
  }
  return url.toString()
}

async function failWithScreenshots(ownerPage: Page | null, guestPage: Page | null, message: string): Promise<never> {
  await ownerPage?.screenshot({ path: OWNER_SCREENSHOT_PATH, fullPage: true }).catch(() => undefined)
  await guestPage?.screenshot({ path: GUEST_SCREENSHOT_PATH, fullPage: true }).catch(() => undefined)
  throw new Error(`${message}\nOwner screenshot: ${OWNER_SCREENSHOT_PATH}\nGuest screenshot: ${GUEST_SCREENSHOT_PATH}`)
}

function assertIncludes(haystack: string, needle: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`expected Collaboration panel to include ${JSON.stringify(needle)}`)
  }
}

async function readBrowserStoreSnapshot(page: Page): Promise<BrowserStoreSnapshot> {
  return await page.evaluate(async () => {
    const graphStoreModule = await import('/src/hooks/useGraphStore.ts')
    const collaborationStoreModule = await import('/src/features/collaboration/p2pCollaborationStore.ts')
    const graphState = graphStoreModule.useGraphStore.getState()
    const collaborationState = collaborationStoreModule.useP2PCollaborationStore.getState()
    const peers = Array.isArray(collaborationState.peers) ? collaborationState.peers : []
    return {
      markdownDocumentName: String(graphState.markdownDocumentName || ''),
      markdownDocumentText: String(graphState.markdownDocumentText || ''),
      markdownWorkspaceIndexingInFlight: graphState.markdownWorkspaceIndexingInFlight === true,
      sessionPhase: String(collaborationState.phase || ''),
      statusText: String(collaborationState.statusText || ''),
      errorText: String(collaborationState.errorText || ''),
      peerCount: peers.length,
      connectedPeerCount: peers.filter(peer => String(peer?.connectionState || '') === 'connected').length,
    }
  })
}

async function readRuntimeIdentityProof(page: Page): Promise<RuntimeIdentityProof> {
  return await page.evaluate(async () => {
    const gateModule = await import('/src/features/runtime-identity/runtimeIdentityAttestationStore.ts')
    const identityModule = await import('/src/features/runtime-identity/knowgrphRuntimeIdentity.ts')
    const gate = gateModule.getKnowgrphRuntimeIdentityGateSnapshot()
    const identity = identityModule.getKnowgrphRuntimeIdentity()
    return {
      status: String(gate.status || ''),
      transportStatus: String(gate.transportStatus || ''),
      requiredDeviceCount: Number(gate.requiredDeviceCount || 0),
      observedDeviceCount: Number(gate.observedDeviceCount || 0),
      verificationDigest: String(gate.verificationDigest || ''),
      message: String(gate.message || ''),
      differences: Array.isArray(gate.differences) ? gate.differences.map(String) : [],
      device: String(identity.device || ''),
      knowgrphRevision: String(identity.knowgrphRevision || ''),
      agenticCanvasOsRevision: String(identity.agenticCanvasOsRevision || ''),
      catalogRevision: String(identity.catalogRevision || ''),
      catalogHydrationStatus: String(identity.catalogHydration?.status || ''),
      catalogHydrationAttempts: Number(identity.catalogHydration?.attempts || 0),
    }
  })
}

async function waitForRuntimeIdentityPass(page: Page, label: string): Promise<RuntimeIdentityProof> {
  const startedAt = Date.now()
  let lastProof = await readRuntimeIdentityProof(page)
  while (Date.now() - startedAt < 60_000) {
    lastProof = await readRuntimeIdentityProof(page)
    const revisionsAreExact = /^[0-9a-f]{40}$/.test(lastProof.knowgrphRevision)
      && /^[0-9a-f]{40}$/.test(lastProof.agenticCanvasOsRevision)
      && lastProof.catalogRevision === lastProof.agenticCanvasOsRevision
    const hydrationIsFresh = lastProof.catalogHydrationStatus === 'fresh'
      && lastProof.catalogHydrationAttempts <= 2
    if (
      lastProof.status === 'pass'
      && lastProof.transportStatus === 'connected'
      && lastProof.requiredDeviceCount >= 2
      && lastProof.observedDeviceCount >= lastProof.requiredDeviceCount
      && /^[0-9a-f]{64}$/.test(lastProof.verificationDigest)
      && revisionsAreExact
      && hydrationIsFresh
    ) return lastProof
    await page.waitForTimeout(500)
  }
  throw new Error(`${label} runtime identity proof timed out: ${JSON.stringify(lastProof)}`)
}

async function openCollaborationPanel(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__KG_MAIN_PANEL_OPEN_READY__ === true, null, { timeout: 60_000 })
  await page.waitForSelector('[aria-label="Markdown Workspace"]', { timeout: 60_000 })
  const selectedTab = page.locator('#main-panel-collaboration-tab[aria-selected="true"]')
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('kg:mainPanelOpen', { detail: { tab: 'collaboration' } }))
    })
    if (await selectedTab.isVisible().catch(() => false)) return
    await page.waitForTimeout(500)
  }
  throw new Error('collaboration panel did not acknowledge the bounded open request')
}

async function closeFloatingPanelIfOpen(page: Page): Promise<void> {
  const floatingPanel = page.locator('[data-kg-floating-panel-root="true"]')
  if (!await floatingPanel.isVisible().catch(() => false)) return
  await floatingPanel.getByRole('button', { name: 'Close', exact: true }).click()
  await floatingPanel.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function readMainPanelText(page: Page): Promise<string> {
  return await page.getByRole('complementary', { name: 'Main panel', exact: true }).innerText()
}

async function waitForPageCondition(page: Page, label: string, predicate: (snapshot: BrowserStoreSnapshot) => boolean): Promise<BrowserStoreSnapshot> {
  const startedAt = Date.now()
  let lastSnapshot = await readBrowserStoreSnapshot(page)
  while (Date.now() - startedAt < 60_000) {
    lastSnapshot = await readBrowserStoreSnapshot(page)
    if (predicate(lastSnapshot)) return lastSnapshot
    await page.waitForTimeout(500)
  }
  throw new Error(`${label} timed out: ${JSON.stringify(lastSnapshot)}`)
}

async function connectAuthenticatedRoom(page: Page): Promise<void> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await openCollaborationPanel(page)
    await waitForActiveDocumentReady(page)
    await closeFloatingPanelIfOpen(page)
    const connectButton = page.getByRole('button', { name: /Connect Room|Reconnect Room/, exact: false })
    await connectButton.waitFor({ state: 'visible', timeout: 30_000 })
    await connectButton.click({ timeout: 30_000 })
    try {
      await waitForPageCondition(
        page,
        `workspace room connection attempt ${attempt}`,
        snapshot => snapshot.sessionPhase === 'connected' && snapshot.statusText.includes('Workspace room connected'),
      )
      const panelText = await readMainPanelText(page)
      assertIncludes(panelText, 'Runtime Status')
      assertIncludes(panelText, 'Workspace room connected')
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < 3) {
        await page.waitForTimeout(1_000)
        continue
      }
    }
  }
  if (lastError) throw lastError
  throw new Error('workspace room connection failed without surfaced error')
}

async function waitForActiveDocumentReady(page: Page): Promise<void> {
  const expectedDocumentName = basename(DOC_PATH)
  const isReady = (snapshot: BrowserStoreSnapshot) => (
    basename(snapshot.markdownDocumentName) === expectedDocumentName
    && snapshot.markdownDocumentText.trim().length > 0
    && snapshot.markdownWorkspaceIndexingInFlight === false
  )
  await waitForPageCondition(page, 'active document readiness', isReady)
  // Indexing starts on a short deferred task, so confirm readiness after that task can begin.
  await page.waitForTimeout(250)
  await waitForPageCondition(page, 'stable active document readiness', isReady)
}

async function selectExpectedDocument(page: Page): Promise<void> {
  const expectedDocumentName = basename(DOC_PATH)
  const activeDocument = await readBrowserStoreSnapshot(page)
  if (
    basename(activeDocument.markdownDocumentName) === expectedDocumentName
    && activeDocument.markdownDocumentText.trim().length > 0
  ) return
  const refreshButton = page.getByRole('button', { name: 'Refresh', exact: true })
  await refreshButton.waitFor({ state: 'visible', timeout: 30_000 })
  await refreshButton.click()
  const directoryNames = DOC_PATH.split('/').filter(Boolean).slice(0, -1)
  for (const directoryName of directoryNames) {
    const directory = page.getByRole('button', { name: `Folder ${directoryName}`, exact: true }).first()
    await directory.waitFor({ state: 'visible', timeout: 30_000 })
    await directory.click()
  }
  const sourceFile = page.getByRole('button', { name: `File ${expectedDocumentName}`, exact: true }).first()
  await sourceFile.waitFor({ state: 'visible', timeout: 60_000 })
  await sourceFile.click()
  await waitForActiveDocumentReady(page)
}

async function appendMarkerThroughActiveEditor(page: Page, marker: string): Promise<void> {
  const mainPanel = page.getByRole('complementary', { name: 'Main panel', exact: true })
  await mainPanel.getByRole('button', { name: 'Close', exact: true }).click()
  await mainPanel.waitFor({ state: 'hidden', timeout: 30_000 })

  const editorSurface = page.locator('.kg-markdown-editor-pane .view-lines')
  await editorSurface.waitFor({ state: 'visible', timeout: 30_000 })
  const editorSurfaceCount = await editorSurface.count()
  if (editorSurfaceCount !== 1) {
    throw new Error(`expected one active Markdown editor surface, got ${editorSurfaceCount}`)
  }
  await editorSurface.click()
  const editorFocused = await page.evaluate(() => {
    const editorRoot = document.querySelector('.kg-markdown-editor-pane .monaco-editor')
    return Boolean(document.activeElement && editorRoot?.contains(document.activeElement))
  })
  if (!editorFocused) throw new Error('active Markdown editor did not acquire keyboard focus')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.insertText(`\n${marker}\n`)
}

async function assertSession(workerUrl: string, token: string, label: string): Promise<void> {
  if (!String(token || '').trim()) return
  const response = await fetch(new URL('/api/storage/chat/session', workerUrl), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`${label} session request failed with ${response.status}`)
  }
}

async function assertRoomStatus(workerUrl: string, docPath: string): Promise<void> {
  if (!String(OWNER_TOKEN || '').trim()) return
  const roomId = String(docPath || '').replace(/^\/+/, '')
  const response = await fetch(
    new URL(buildKnowgrphStorageCanvasRoomPath(WORKSPACE_ID, roomId), workerUrl),
    { headers: { Authorization: `Bearer ${OWNER_TOKEN}` } },
  )
  if (!response.ok) {
    throw new Error(`workspace room status request failed with ${response.status}`)
  }
  const body = await response.json() as { activePeerCount?: unknown; roomId?: unknown }
  if (String(body.roomId || '') !== roomId) {
    throw new Error(`expected worker room id ${JSON.stringify(roomId)}, got ${JSON.stringify(body.roomId)}`)
  }
  if (Number(body.activePeerCount || 0) < 2) {
    throw new Error(`expected worker room to report at least 2 active peers, got ${JSON.stringify(body.activePeerCount)}`)
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch(resolveBrowserLaunchOptions())
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  await Promise.all([
    ownerContext.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: KNOWGRPH_STORAGE_DEVICE_ID_KEY, value: OWNER_DEVICE_ID },
    ),
    guestContext.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: KNOWGRPH_STORAGE_DEVICE_ID_KEY, value: GUEST_DEVICE_ID },
    ),
  ])
  const ownerPage = await ownerContext.newPage()
  const guestPage = await guestContext.newPage()
  const pageErrors: string[] = []
  for (const page of [ownerPage, guestPage]) {
    page.on('pageerror', error => {
      pageErrors.push(error.message)
    })
  }

  try {
    await assertSession(WORKER_URL, OWNER_TOKEN, 'owner')
    await assertSession(WORKER_URL, GUEST_TOKEN, 'guest')

    await ownerPage.goto(buildWorkspaceUrl(OWNER_APP_URL), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await guestPage.goto(buildWorkspaceUrl(GUEST_APP_URL), { waitUntil: 'domcontentloaded', timeout: 60_000 })

    const [ownerIdentityProof, guestIdentityProof] = await Promise.all([
      waitForRuntimeIdentityPass(ownerPage, 'owner'),
      waitForRuntimeIdentityPass(guestPage, 'guest'),
    ])
    if (ownerIdentityProof.device === guestIdentityProof.device) {
      throw new Error(`expected distinct runtime devices, got ${JSON.stringify(ownerIdentityProof.device)}`)
    }
    if (ownerIdentityProof.verificationDigest !== guestIdentityProof.verificationDigest) {
      throw new Error('expected owner and guest runtime identity verification digests to match')
    }
    for (const key of ['knowgrphRevision', 'agenticCanvasOsRevision', 'catalogRevision'] as const) {
      if (ownerIdentityProof[key] !== guestIdentityProof[key]) {
        throw new Error(`expected owner and guest ${key} to match`)
      }
    }

    await Promise.all([
      selectExpectedDocument(ownerPage),
      selectExpectedDocument(guestPage),
    ])

    await Promise.all([
      closeFloatingPanelIfOpen(ownerPage),
      closeFloatingPanelIfOpen(guestPage),
    ])

    await Promise.all([
      openCollaborationPanel(ownerPage),
      openCollaborationPanel(guestPage),
    ])

    await Promise.all([
      waitForActiveDocumentReady(ownerPage),
      waitForActiveDocumentReady(guestPage),
    ])

    await Promise.all([
      connectAuthenticatedRoom(ownerPage),
      connectAuthenticatedRoom(guestPage),
    ])

    const [ownerConnectedSnapshot] = await Promise.all([
      waitForPageCondition(ownerPage, 'owner peer roster', snapshot => snapshot.connectedPeerCount >= 2),
      waitForPageCondition(guestPage, 'guest peer roster', snapshot => snapshot.connectedPeerCount >= 2),
    ])
    await assertRoomStatus(WORKER_URL, ownerConnectedSnapshot.markdownDocumentName)

    await appendMarkerThroughActiveEditor(guestPage, MARKER)

    const guestSnapshot = await waitForPageCondition(
      guestPage,
      'guest marker retention',
      snapshot => snapshot.markdownDocumentText.includes(MARKER),
    )
    const ownerSnapshot = await waitForPageCondition(
      ownerPage,
      'owner marker propagation',
      snapshot => snapshot.markdownDocumentText.includes(MARKER),
    )
    await openCollaborationPanel(guestPage)

    const ownerPanelText = await readMainPanelText(ownerPage)
    const guestPanelText = await readMainPanelText(guestPage)
    for (const panelText of [ownerPanelText, guestPanelText]) {
      assertIncludes(panelText, 'Session')
      assertIncludes(panelText, 'Peers')
      assertIncludes(panelText, 'Transport')
      assertIncludes(panelText, 'Workspace room connected')
    }

    await ownerPage.screenshot({ path: OWNER_SCREENSHOT_PATH, fullPage: true })
    await guestPage.screenshot({ path: GUEST_SCREENSHOT_PATH, fullPage: true })
    console.log(
      JSON.stringify({
        ok: true,
        ownerAppUrl: buildWorkspaceUrl(OWNER_APP_URL),
        guestAppUrl: buildWorkspaceUrl(GUEST_APP_URL),
        workerUrl: WORKER_URL,
        marker: MARKER,
        ownerDocumentName: ownerSnapshot.markdownDocumentName,
        guestDocumentName: guestSnapshot.markdownDocumentName,
        ownerTextLength: ownerSnapshot.markdownDocumentText.length,
        guestTextLength: guestSnapshot.markdownDocumentText.length,
        runtimeIdentity: {
          status: ownerIdentityProof.status,
          observedDeviceCount: ownerIdentityProof.observedDeviceCount,
          requiredDeviceCount: ownerIdentityProof.requiredDeviceCount,
          verificationDigest: ownerIdentityProof.verificationDigest,
          devices: [ownerIdentityProof.device, guestIdentityProof.device],
          knowgrphRevision: ownerIdentityProof.knowgrphRevision,
          agenticCanvasOsRevision: ownerIdentityProof.agenticCanvasOsRevision,
          catalogRevision: ownerIdentityProof.catalogRevision,
          catalogHydrationStatus: ownerIdentityProof.catalogHydrationStatus,
          catalogHydrationAttempts: ownerIdentityProof.catalogHydrationAttempts,
        },
        ownerScreenshotPath: OWNER_SCREENSHOT_PATH,
        guestScreenshotPath: GUEST_SCREENSHOT_PATH,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const suffix = pageErrors.length ? `\nPage errors:\n${pageErrors.join('\n')}` : ''
    await failWithScreenshots(ownerPage, guestPage, `${message}${suffix}`)
  } finally {
    await browser.close()
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error(error instanceof Error ? (error.stack || error.message) : String(error))
    process.exit(1)
  })
