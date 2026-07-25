import assert from 'node:assert/strict'
import { accessSync, constants as fsConstants } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { chromium } from 'playwright'

const BASE_URL = String(
  process.env.KG_CHAT_NATURAL_LANGUAGE_SMOKE_BASE_URL || 'http://localhost:4187',
).replace(/\/+$/, '')
const TARGET_URL = `${BASE_URL}/`
const USER_PROMPT = 'Create a bounded comparison card for the selected evidence.'
const CHAT_INPUT_LABEL = 'Ask a question about the current graph or selection.'
const PROVIDER = 'byteplus-modelark'
const MODEL = 'seed-2-0-lite-260228'
const ENDPOINT_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions'
const PROXY_ROUTE = '**/__chat_proxy/api/v3/chat/completions'
const DIRECT_PROVIDER_ROUTES = [
  'https://ark.ap-southeast.bytepluses.com/**',
  'https://ark.eu-west.bytepluses.com/**',
  'https://api.openai.com/**',
]
const DIRECT_PROVIDER_HOSTNAMES = new Set([
  'ark.ap-southeast.bytepluses.com',
  'ark.eu-west.bytepluses.com',
  'api.openai.com',
])
const OPTIONAL_MISSING_SOURCE_PATHS = new Set(['/__codebase_file', '/docs/workspace-readme.md'])
const PROJECTED_NODE_ID = 'mcp-response-runtime-ready-probe'
const CHAT_LOG_ABS_ROOT = resolve(String(
  process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT || '',
).trim())
const EXPECTED_SOURCE_REVISION = String(
  process.env.KG_CHAT_NATURAL_LANGUAGE_EXPECTED_HEAD || '',
).trim()
const EXPECTED_SOURCE_BRANCH = String(
  process.env.KG_CHAT_NATURAL_LANGUAGE_EXPECTED_BRANCH || '',
).trim()
const EXPECTED_SOURCE_DOCUMENT = String(
  process.env.KG_CHAT_NATURAL_LANGUAGE_SOURCE_DOCUMENT || '',
).trim()
const EXPECTED_SOURCE_PATH = `/docs/workspace-seeds/${EXPECTED_SOURCE_DOCUMENT}`
const CANONICAL_WIDGET_CARD_LAYOUT_IDS = [
  'widget-card-type-0',
  'probe-tree-type-1',
  'probe-tree-type-2',
  'rich-media-deliverables',
]
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const outputDirectory = resolve(scriptDirectory, '../../data/outputs')
const screenshotPath = resolve(outputDirectory, 'chat-natural-language-invocation-browser-smoke.png')
const evidencePath = resolve(outputDirectory, 'chat-natural-language-invocation-browser-smoke.json')

const assistantStructuredResponse = JSON.stringify({
  response: {
    intent: 'Create a bounded comparison card.',
    domain_vars: {},
    context_scope: 'current graph',
    structuredContent: {
      widgets: [{
        id: 'runtime-ready-probe',
        label: 'Runtime-ready Probe',
        layoutVariantId: 'probe-tree-type-2',
        summary: 'Which evidence strategy should guide the comparison?',
        selectionOptions: [
          'Prefer bounded current evidence with explicit uncertainty',
          'Prefer broader evidence coverage with a longer review window',
        ],
      }],
    },
  },
})

const completionResponse = {
  id: 'chatcmpl-chat-natural-language-proof',
  object: 'chat.completion',
  model: MODEL,
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: assistantStructuredResponse,
    },
    finish_reason: 'stop',
  }],
  usage: {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 2,
  },
}

function findLocalChromiumExecutable() {
  const explicit = String(process.env.KG_CHAT_NATURAL_LANGUAGE_CHROMIUM_EXECUTABLE || '').trim()
  const candidates = [
    explicit,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // Let Playwright use its bundled browser when no executable candidate exists.
    }
  }
  return null
}

async function executeWebMcpTool(page, toolName) {
  return await page.evaluate(async name => {
    const tools = Array.from(navigator.modelContext?.tools || [])
    const tool = tools.find(candidate => candidate.name === name)
    if (!tool) return null
    return await tool.execute()
  }, toolName)
}

async function waitForWebMcpSnapshot(page, toolName, predicate, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let lastSnapshot = null
  while (Date.now() < deadline) {
    lastSnapshot = await executeWebMcpTool(page, toolName)
    if (lastSnapshot && predicate(lastSnapshot)) return lastSnapshot
    await page.waitForTimeout(250)
  }
  throw new Error(`${label} timed out; last snapshot: ${JSON.stringify(lastSnapshot)}`)
}

async function seedChatSettings({ targetUrl }) {
  window.localStorage.clear()
  window.sessionStorage.clear()
  const pathname = new URL(targetUrl).pathname || '/'
  const basePath = pathname === '/' ? '/' : (pathname.endsWith('/') ? pathname : `${pathname}/`)
  const scopedPrefix = basePath === '/' ? '' : `kg:scope:${basePath}::`
  const prefixes = scopedPrefix ? ['', scopedPrefix] : ['']
  const jsonValues = {
    'kg:chat:provider': 'byteplus-modelark',
    'kg:chat:authMode': 'serverManaged',
    'kg:chat:endpointUrl': 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
    'kg:chat:model': 'seed-2-0-lite-260228',
    'kg:chat:storage:target': 'chatKnowgrph',
    'kg:chat:storage:localRootPath': '/chat-log',
    'kg:chat:chatKnowgrph:storageMode': 'local',
  }
  for (const prefix of prefixes) {
    for (const [key, value] of Object.entries(jsonValues)) {
      window.localStorage.setItem(`${prefix}${key}`, JSON.stringify(value))
    }
    window.localStorage.setItem(`${prefix}kg:chat:stream`, '0')
    window.localStorage.removeItem(`${prefix}kg:chat:stream:durable:activeRun`)
    window.localStorage.removeItem(`${prefix}kg:chat:chatKnowgrph:workspacePath`)
    window.localStorage.removeItem(`${prefix}kg:chat:history:workspacePath`)
  }
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function readUrlParts(url) {
  try {
    const parsed = new URL(String(url || ''))
    return { hostname: parsed.hostname.toLowerCase(), pathname: parsed.pathname }
  } catch {
    return { hostname: '', pathname: '' }
  }
}

function isAllowedOptionalMissingSourceResponse(response) {
  return response.status === 404 && OPTIONAL_MISSING_SOURCE_PATHS.has(readUrlParts(response.url).pathname)
}

function readPersistedWorkspaceProof(workspacePath, markdown) {
  const normalizedPath = String(workspacePath || '').trim()
  assert.match(normalizedPath, /^\/chat-log\/.+\.md$/, 'persisted workspace path must stay under /chat-log')
  const relativePath = normalizedPath.replace(/^\/chat-log\//, '')
  const hostPath = resolve(CHAT_LOG_ABS_ROOT, relativePath)
  assert.ok(
    hostPath.startsWith(`${CHAT_LOG_ABS_ROOT}/`),
    'persisted workspace path must remain inside the isolated chat-log root',
  )
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(markdown.replace(/\r\n/g, '\n'))
  assert.ok(match?.[1], 'persisted workspace document must have leading YAML frontmatter')
  const frontmatter = yaml.load(match[1])
  assert.ok(frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter))
  const flow = frontmatter.flow
  assert.ok(flow && typeof flow === 'object' && !Array.isArray(flow))
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : []
  const edges = Array.isArray(flow.edges) ? flow.edges : []
  const node = nodes.find(candidate => candidate?.id === PROJECTED_NODE_ID)
  assert.ok(node, 'persisted workspace document must contain the projected Widget node')
  assert.equal(node.type, 'TextGeneration')
  const properties = node.properties
  assert.ok(properties && typeof properties === 'object' && !Array.isArray(properties))
  assert.equal(properties['flow:widgetTypeId'], 'default')
  assert.equal(properties['flow:widgetFormId'], 'textGeneration')
  assert.equal(properties.probeTreeCardVariant, 'probe-tree-type-2')
  assert.equal(properties.probeTreeTypeLabel, 'Probe-Tree Type 2')
  assert.equal(properties.selectionMode, 'multiple')
  assert.equal(properties.allowOther, true)
  assert.equal(properties.output, '')
  const rawOptions = typeof properties.selectionOptions === 'string'
    ? JSON.parse(properties.selectionOptions)
    : properties.selectionOptions
  const optionLabels = Array.isArray(rawOptions)
    ? rawOptions.map(option => String(option?.label || option || ''))
    : []
  assert.deepEqual(optionLabels, [
    'Prefer bounded current evidence with explicit uncertainty',
    'Prefer broader evidence coverage with a longer review window',
  ])
  const edge = edges.find(candidate => candidate?.id === 'e-mcp-response-1')
  assert.ok(edge, 'persisted workspace document must contain the projected Widget edge')
  assert.equal(edge.source, 'n-deliver')
  assert.equal(edge.sourceHandle, 'rendered')
  assert.equal(edge.target, PROJECTED_NODE_ID)
  assert.equal(edge.targetHandle, 'prompt_in')
  return {
    hostPath,
    byteLength: Buffer.byteLength(markdown),
    node: {
      id: node.id,
      type: node.type,
      widgetTypeId: properties['flow:widgetTypeId'],
      formId: properties['flow:widgetFormId'],
      probeTreeCardVariant: properties.probeTreeCardVariant,
      selectionMode: properties.selectionMode,
      optionLabels,
      allowOther: properties.allowOther,
      output: properties.output,
    },
    edge,
  }
}

async function main() {
  const parsedTargetUrl = new URL(TARGET_URL)
  assert.equal(parsedTargetUrl.pathname, '/', 'browser proof must use the normal root application route')
  assert.equal(parsedTargetUrl.search, '', 'browser proof must not depend on a proof query parameter')
  assert.match(
    EXPECTED_SOURCE_REVISION,
    /^[0-9a-f]{40}$/,
    'browser proof requires the runner-owned exact source revision',
  )
  assert.ok(EXPECTED_SOURCE_BRANCH, 'browser proof requires the runner-owned source branch')
  assert.ok(EXPECTED_SOURCE_DOCUMENT, 'browser proof requires the runner-owned source document')
  assert.notEqual(CHAT_LOG_ABS_ROOT, resolve(''), 'browser proof requires an isolated chat-log root')

  await mkdir(outputDirectory, { recursive: true })
  const executablePath = findLocalChromiumExecutable()
  const browser = await chromium.launch({
    headless: process.env.KG_CHAT_NATURAL_LANGUAGE_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : {}),
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  })
  const page = await context.newPage()
  const proxyRequests = []
  const requestAssertionFailures = []
  const directProviderRequests = []
  const pageErrors = []
  const consoleErrors = []
  const applicationConsoleErrors = []
  const failedResponses = []
  const criticalFailedResponses = []
  const failedRequests = []
  const criticalFailedRequests = []
  const recordDirectProviderRequest = url => {
    const normalizedUrl = String(url || '')
    if (normalizedUrl && !directProviderRequests.includes(normalizedUrl)) {
      directProviderRequests.push(normalizedUrl)
    }
  }

  page.on('pageerror', error => pageErrors.push(String(error?.message || error)))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    consoleErrors.push(text)
    // Empty isolated workspace roots can report missing optional sources; retain them as evidence.
    if (!text.startsWith('Failed to load resource:')) applicationConsoleErrors.push(text)
  })
  page.on('response', response => {
    const status = response.status()
    if (status < 400) return
    const request = response.request()
    const failedResponse = {
      url: response.url(),
      status,
      resourceType: request.resourceType(),
      requestBody: request.postData(),
    }
    failedResponses.push(failedResponse)
    if (!isAllowedOptionalMissingSourceResponse(failedResponse)) {
      criticalFailedResponses.push(failedResponse)
    }
  })
  page.on('requestfailed', request => {
    const failedRequest = {
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || 'unknown request failure',
    }
    failedRequests.push(failedRequest)
    if (!DIRECT_PROVIDER_HOSTNAMES.has(readUrlParts(failedRequest.url).hostname)) {
      criticalFailedRequests.push(failedRequest)
    }
  })
  page.on('request', request => {
    try {
      const hostname = new URL(request.url()).hostname.toLowerCase()
      if (DIRECT_PROVIDER_HOSTNAMES.has(hostname)) recordDirectProviderRequest(request.url())
    } catch {
      // Relative browser requests are not provider egress.
    }
  })

  let proofFailure = null
  let chatSnapshot = null
  let canvasSnapshot = null
  let runtimeIdentitySnapshot = null
  let sourceFilesSnapshot = null
  let postFinalizeSourceFilesSnapshot = null
  let paletteLayoutIds = []
  let localStorageSettings = null
  let persistedWorkspaceProof = null

  try {
    for (const providerRoute of DIRECT_PROVIDER_ROUTES) {
      await context.route(providerRoute, async route => {
        recordDirectProviderRequest(route.request().url())
        await route.abort('blockedbyclient')
      })
    }
    await context.addInitScript(seedChatSettings, { targetUrl: TARGET_URL })
    await context.route(PROXY_ROUTE, async route => {
      const request = route.request()
      const body = request.postDataJSON()
      const headers = request.headers()
      const messages = Array.isArray(body?.messages) ? body.messages : []
      const systemText = messages
        .filter(message => message?.role === 'system')
        .map(message => String(message?.content || ''))
        .join('\n\n')
      const userMessage = [...messages].reverse().find(message => message?.role === 'user')
      const contractHeader = 'FloatingPanel Props Panel Widgets response contract:'
      const contractHeaderCount = systemText.split(contractHeader).length - 1

      proxyRequests.push({
        url: request.url(),
        method: request.method(),
        provider: headers['x-kg-chat-provider'] || null,
        hasByokHeader: Boolean(headers['x-kg-chat-api-key']),
        model: body?.model || null,
        stream: body?.stream,
        userText: userMessage?.content || null,
        contractHeaderCount,
        hasProbeTreeTypeTwoContract: systemText.includes('`probe-tree-type-2` (Probe-Tree Type 2)'),
      })

      try {
        assert.equal(request.method(), 'POST')
        assert.equal(headers['x-kg-chat-provider'], PROVIDER)
        assert.equal(headers['x-kg-chat-api-key'], undefined)
        assert.equal(body?.model, MODEL)
        assert.equal(body?.stream, false)
        assert.equal(userMessage?.content, USER_PROMPT)
        assert.equal(/^\s*[/#@]/.test(String(userMessage?.content || '')), false)
        assert.equal(contractHeaderCount, 1)
        assert.ok(systemText.includes('`probe-tree-type-2` (Probe-Tree Type 2)'))
      } catch (error) {
        requestAssertionFailures.push(error instanceof Error ? error.message : String(error))
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(completionResponse),
      })
    })
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForFunction(() => Boolean(window.__knowgrphFloatingPanelBridge), null, { timeout: 120_000 })
    sourceFilesSnapshot = await waitForWebMcpSnapshot(
      page,
      'knowgrph.inspect_local_source_files_snapshot',
      snapshot => (
        snapshot.available === true
        && snapshot.errorSourceFileCount === 0
        && snapshot.activePath === EXPECTED_SOURCE_PATH
        && snapshot.activeSourcePath === `workspace:${EXPECTED_SOURCE_PATH}`
        && snapshot.activeSourceFile?.name === EXPECTED_SOURCE_DOCUMENT
        && snapshot.activeSourceFile?.status === 'parsed'
        && snapshot.activeSourceFile?.hasParsedGraphData === true
        && snapshot.activeSourceFile?.textLength > 0
      ),
      'Authored default source bootstrap',
    )

    const chatButton = page.getByRole('button', { name: 'Chat', exact: true })
    await chatButton.waitFor({ state: 'visible', timeout: 30_000 })
    await chatButton.click()
    const composer = page.getByRole('textbox', { name: CHAT_INPUT_LABEL, exact: true })
    await composer.waitFor({ state: 'visible', timeout: 120_000 })
    await composer.fill(USER_PROMPT)
    const sendButton = page.getByRole('button', { name: 'Send', exact: true })
    assert.equal(await sendButton.isEnabled(), true, 'Chat Send button must be enabled for the no-slash request')
    await sendButton.click()

    chatSnapshot = await waitForWebMcpSnapshot(
      page,
      'knowgrph.inspect_local_chat_pipeline_state',
      snapshot => (
        snapshot.available === true
        && snapshot.isLoading === false
        && snapshot.finalize?.finalStatus === 'ok'
        && typeof snapshot.finalize?.persistedKnowgrphPath === 'string'
        && ['applied', 'skipped', 'error'].includes(snapshot.finalize?.stage)
      ),
      'Chat structured-response finalization',
    )
    const persistedRelativePath = chatSnapshot.finalize.persistedKnowgrphPath.replace(/^\/chat-log\//, '')
    const persistedHostPath = resolve(CHAT_LOG_ABS_ROOT, persistedRelativePath)
    const persistedWorkspaceDocument = await readFile(persistedHostPath, 'utf8')
    persistedWorkspaceProof = readPersistedWorkspaceProof(
      chatSnapshot.finalize.persistedKnowgrphPath,
      persistedWorkspaceDocument,
    )
    postFinalizeSourceFilesSnapshot = await executeWebMcpTool(
      page,
      'knowgrph.inspect_local_source_files_snapshot',
    )
    assert.equal(postFinalizeSourceFilesSnapshot.available, true)
    assert.equal(postFinalizeSourceFilesSnapshot.errorSourceFileCount, 0)
    assert.equal(
      postFinalizeSourceFilesSnapshot.activePath,
      chatSnapshot.finalize.persistedKnowgrphPath,
    )
    assert.equal(
      postFinalizeSourceFilesSnapshot.activeSourcePath,
      `workspace:${chatSnapshot.finalize.persistedKnowgrphPath}`,
    )
    assert.equal(postFinalizeSourceFilesSnapshot.activeSourceFile?.status, 'parsed')
    assert.equal(postFinalizeSourceFilesSnapshot.activeSourceFile?.hasParsedGraphData, true)
    assert.equal(
      postFinalizeSourceFilesSnapshot.activeSourceFile?.textLength,
      persistedWorkspaceDocument.length,
    )
    assert.equal(chatSnapshot.available, true)
    assert.equal(chatSnapshot.errorText, null)
    assert.equal(chatSnapshot.chatStorageTarget, 'chatKnowgrph')
    assert.equal(chatSnapshot.finalize.applied, true)
    assert.equal(chatSnapshot.finalize.stage, 'applied')
    assert.equal(chatSnapshot.finalize.finalStatus, 'ok')
    assert.equal(
      chatSnapshot.finalize.message,
      'Canonical KGC workspace document was persisted and applied to the active canvas graph.',
    )

    canvasSnapshot = await waitForWebMcpSnapshot(
      page,
      'knowgrph.inspect_local_canvas_topology',
      snapshot => (
        snapshot.available === true
        && Array.isArray(snapshot.graphNodeIds)
        && snapshot.graphNodeIds.includes(PROJECTED_NODE_ID)
      ),
      'Projected structured-response canvas node',
    )
    runtimeIdentitySnapshot = await waitForWebMcpSnapshot(
      page,
      'knowgrph.read_local_runtime_identity',
      snapshot => (
        snapshot.identity?.schema === 'knowgrph-runtime-identity/v1'
        && snapshot.gate?.schema === 'knowgrph-runtime-identity-gate/v1'
      ),
      'Canonical local runtime identity',
    )
    assert.equal(runtimeIdentitySnapshot.identity.knowgrphRevision, EXPECTED_SOURCE_REVISION)
    assert.equal(runtimeIdentitySnapshot.identity.branch, EXPECTED_SOURCE_BRANCH)
    assert.ok(runtimeIdentitySnapshot.identity.device)

    assert.equal(proxyRequests.length, 1, `expected one intercepted provider request, got ${proxyRequests.length}`)
    assert.deepEqual(requestAssertionFailures, [])
    assert.deepEqual(directProviderRequests, [])
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(criticalFailedResponses, [])
    assert.deepEqual(criticalFailedRequests, [])

    const workspaceMain = page.getByRole('main', { name: 'Markdown Editor and Viewer', exact: true })
    await workspaceMain.getByTitle('Close', { exact: true }).click()
    await workspaceMain.waitFor({ state: 'detached', timeout: 30_000 })
    const projectedTypeTwo = page.locator(
      `[data-node-id="${PROJECTED_NODE_ID}"] [data-kg-probe-tree-type="2"]`,
    ).first()
    await projectedTypeTwo.waitFor({ state: 'visible', timeout: 60_000 })
    const firstOption = page.getByRole('checkbox', { name: `Select option 1 for ${PROJECTED_NODE_ID}` })
    const secondOption = page.getByRole('checkbox', { name: `Select option 2 for ${PROJECTED_NODE_ID}` })
    const otherOption = page.getByRole('checkbox', { name: `Select Other for ${PROJECTED_NODE_ID}` })
    await firstOption.waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await firstOption.isChecked(), false)
    assert.equal(await secondOption.isChecked(), false)
    assert.equal(await otherOption.isChecked(), false)
    const projectedTypeTwoText = await projectedTypeTwo.textContent()
    assert.ok(projectedTypeTwoText?.includes('Prefer bounded current evidence with explicit uncertainty'))
    assert.ok(projectedTypeTwoText?.includes('Prefer broader evidence coverage with a longer review window'))

    assert.equal(
      await page.locator('[data-kg-widget-palette-layout]').count(),
      0,
      'Chat must not mount a duplicate Widget palette',
    )
    await page.locator('[data-kg-floating-panel-view-trigger="propsPanel"]').click()
    const typeTwoPalette = page.locator('[data-kg-widget-palette-layout="probe-tree-type-2"]').first()
    await typeTwoPalette.waitFor({ state: 'attached', timeout: 30_000 })
    await typeTwoPalette.scrollIntoViewIfNeeded()
    await typeTwoPalette.waitFor({ state: 'visible', timeout: 30_000 })
    paletteLayoutIds = await page.locator('[data-kg-widget-palette-layout]').evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-kg-widget-palette-layout')).filter(Boolean)
    ))
    assert.ok(paletteLayoutIds.length >= 5)
    assert.equal(new Set(paletteLayoutIds).size, paletteLayoutIds.length)
    assert.deepEqual(paletteLayoutIds.slice(0, 4), CANONICAL_WIDGET_CARD_LAYOUT_IDS)
    await page.getByText('Rich Media Panel', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 })

    localStorageSettings = await page.evaluate(keys => Object.fromEntries(
      keys.map(key => [key, window.localStorage.getItem(key)]),
    ), [
      'kg:chat:provider',
      'kg:chat:authMode',
      'kg:chat:endpointUrl',
      'kg:chat:model',
      'kg:chat:stream',
      'kg:chat:storage:target',
      'kg:chat:chatKnowgrph:storageMode',
    ])
    assert.equal(localStorageSettings['kg:chat:provider'], JSON.stringify(PROVIDER))
    assert.equal(localStorageSettings['kg:chat:authMode'], JSON.stringify('serverManaged'))
    assert.equal(localStorageSettings['kg:chat:endpointUrl'], JSON.stringify(ENDPOINT_URL))
    assert.equal(localStorageSettings['kg:chat:model'], JSON.stringify(MODEL))
    assert.equal(localStorageSettings['kg:chat:stream'], '0')
    assert.equal(localStorageSettings['kg:chat:storage:target'], JSON.stringify('chatKnowgrph'))
    assert.equal(localStorageSettings['kg:chat:chatKnowgrph:storageMode'], JSON.stringify('local'))
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(applicationConsoleErrors, [])
  } catch (error) {
    proofFailure = error
  }

  let screenshotCaptureError = null
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch (error) {
    screenshotCaptureError = errorText(error)
  }
  const proofError = proofFailure
    ? errorText(proofFailure)
    : screenshotCaptureError
      ? `ScreenshotError: ${screenshotCaptureError}`
      : null
  let evidenceWriteFailure = null
  try {
    await writeFile(evidencePath, `${JSON.stringify({
      schema: 'knowgrph-chat-natural-language-invocation-browser-smoke/v1',
      status: proofError ? 'failed' : 'passed',
      error: proofError,
      targetUrl: TARGET_URL,
      proofQuery: null,
      paidProviderCalled: false,
      localStorageSettings,
      proxyRequests,
      requestAssertionFailures,
      directProviderRequests,
      pageErrors,
      consoleErrors,
      applicationConsoleErrors,
      failedResponses,
      criticalFailedResponses,
      failedRequests,
      criticalFailedRequests,
      persistedWorkspaceProof,
      chatSnapshot,
      canvasSnapshot,
      runtimeIdentitySnapshot,
      sourceFilesSnapshot,
      postFinalizeSourceFilesSnapshot,
      projectedNodeId: PROJECTED_NODE_ID,
      paletteLayoutIds,
      screenshotPath: screenshotCaptureError ? null : screenshotPath,
      screenshotCaptureError,
    }, null, 2)}\n`, 'utf8')
  } catch (error) {
    evidenceWriteFailure = error
  }

  try {
    await context.close()
  } finally {
    await browser.close()
  }
  if (proofFailure) throw proofFailure
  if (screenshotCaptureError) throw new Error(`Browser proof screenshot capture failed: ${screenshotCaptureError}`)
  if (evidenceWriteFailure) throw evidenceWriteFailure
  console.log(`[chat-natural-language-invocation-browser-smoke] PASS ${evidencePath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
