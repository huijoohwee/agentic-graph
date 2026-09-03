import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import yaml from 'js-yaml'
import { chromium } from 'playwright'

const readRequiredEnv = name => {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const parseFrontmatter = text => {
  const match = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!match) return {}
  const parsed = yaml.load(match[1])
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

const readWorkspaceEntries = async page => page.evaluate(() => {
  const workspaceKey = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter(Boolean)
    .find(key => key === 'kg:workspace-fs' || key.endsWith('::kg:workspace-fs'))
  const raw = workspaceKey ? window.localStorage.getItem(workspaceKey) : null
  const entries = raw ? JSON.parse(raw).entries || {} : {}
  return Object.fromEntries(Object.entries(entries).map(([path, entry]) => [path, String(entry?.text || '')]))
})

const listArtifactPaths = entries => Object.keys(entries)
  .filter(path => /\/strybldr-video(?:-fallback)?-[^/]+\.md$/.test(path))
  .sort()

const basenameStem = name => String(name || '').replace(/\.[^.]+$/, '')

const envBool = name => /^(?:1|true|yes|on)$/i.test(String(process.env[name] || '').trim())

const parseErrorReason = text => /errorReason:\s*"?([^"\n]+)"?/i.exec(text)?.[1] || 'no generated artifact was written'
const parseStatus = text => /status:\s*"?([^"\n]+)"?/i.exec(text)?.[1] || ''

const parseApprovedCards = text => {
  const match = /## Approved Cards\s+```json\s+([\s\S]*?)\s+```/i.exec(text)
  if (!match) throw new Error('handoff artifact missing Approved Cards JSON block')
  const parsed = JSON.parse(match[1])
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('handoff artifact Approved Cards must be a non-empty array')
  return parsed
}

const assertHandoffArtifact = (text, expectedStatus, opts = {}) => {
  const required = [
    'kgStrybldrVideoHandoff: true',
    `status: "${expectedStatus}"`,
    '## Compiled Prompt',
    '## Approved Cards',
  ]
  for (const value of required) {
    if (!text.includes(value)) throw new Error(`handoff artifact missing ${value}`)
  }
  if (expectedStatus === 'fallback' && !/errorReason:\s*".+?"/i.test(text)) {
    throw new Error('fallback handoff artifact missing errorReason')
  }
  const cards = parseApprovedCards(text)
  const references = cards
    .flatMap(card => Array.isArray(card?.references) ? card.references : [])
    .map(value => String(value || ''))
  if (opts.expectRemoteVideoReferences) {
    if (!references.some(value => value.includes('/__video_frame?'))) {
      throw new Error('handoff artifact missing frame-extraction thumbnail reference')
    }
    if (!references.some(value => /(?:^|\/\/)i\.ytimg\.com\//i.test(value))) {
      throw new Error('handoff artifact missing provider-safe YouTube thumbnail fallback')
    }
  }
  return { cardCount: cards.length, referenceCount: references.length }
}

const assertPlayableMediaBody = (text, status) => {
  if (status !== 'generated' && status !== 'copied') return
  if (!text.includes('## Video')) throw new Error('playable handoff artifact missing Video section')
  if (!/(<video\b|<iframe\b|\[Open Strybldr video\])/i.test(text)) {
    throw new Error('playable handoff artifact missing visible video playback markup or link')
  }
}

const assertImportedDemoFile = (entries, demoBasename, importUrl = '') => {
  const importUrlText = String(importUrl || '')
  const required = [
    [/implementation_contract:\s*"?docs\/documents\/agentic-graph-strytree-prd-tad\.md"?/, 'Strytree implementation contract'],
    [/kgCanvas2dRenderer:\s*"?strybldr"?/, 'Strybldr renderer frontmatter'],
    [/kgStrybldrStoryboard:\s*true/, 'Strybldr storyboard marker'],
    [/strybldr_storyboard:\s*(?:\n|$)/, 'Strybldr storyboard frontmatter payload'],
  ]
  if (importUrlText) required.push([importUrlText, 'external validation source'])
  const stem = basenameStem(demoBasename)
  const candidates = Object.entries(entries)
    .map(([path, text]) => [path, String(text || '')])
    .filter(([path, text]) => path.includes(stem) || (!!importUrlText && text.includes(importUrlText)))
  for (const [path, text] of candidates) {
    const missing = required.filter(([pattern]) => pattern instanceof RegExp ? !pattern.test(text) : !text.includes(pattern))
    if (missing.length === 0) return path
  }
  const candidatePaths = candidates.map(([path]) => path).slice(0, 10)
  throw new Error(`local-file run did not import ${demoBasename} with required Strytree/Strybldr content; candidates=${JSON.stringify(candidatePaths)}`)
}

const waitForImportedDemoFile = async (page, demoBasename, importUrl = '') => {
  const stem = basenameStem(demoBasename)
  const handle = await page.waitForFunction(
    ({ stem, importUrl }) => {
      const workspaceKey = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter(Boolean)
        .find(key => key === 'kg:workspace-fs' || key.endsWith('::kg:workspace-fs'))
      const raw = workspaceKey ? window.localStorage.getItem(workspaceKey) : null
      const entries = raw ? JSON.parse(raw).entries || {} : {}
      for (const [path, entry] of Object.entries(entries)) {
        const text = String(entry?.text || '')
        if (!String(path).includes(stem) && !(importUrl && text.includes(importUrl))) continue
        if (!text.includes('docs/documents/agentic-graph-strytree-prd-tad.md')) continue
        if (!/kgCanvas2dRenderer:\s*"?strybldr"?/.test(text)) continue
        if (!/kgStrybldrStoryboard:\s*true/.test(text)) continue
        if (!/strybldr_storyboard:\s*(?:\n|$)/.test(text)) continue
        if (importUrl && !text.includes(importUrl)) continue
        return path
      }
      return ''
    },
    { stem, importUrl },
    { timeout: 60000 },
  )
  const importedPath = String(await handle.jsonValue() || '')
  if (!importedPath) throw new Error(`local-file run did not import ${demoBasename}`)
  return importedPath
}

const waitForStrybldrSurface = async (page, opts = {}) => {
  await page.getByRole('button', { name: 'Canvas View Mode: 2D Renderer: Strybldr' }).waitFor({ timeout: 45000 })
  await page.getByRole('region', { name: 'Storyboard lane Source' }).waitFor({ timeout: 45000 })
  await page.getByRole('region', { name: 'Storyboard lane Storyboard' }).waitFor({ timeout: 45000 })
  await page.getByRole('region', { name: 'Storyboard lane Elements' }).waitFor({ timeout: 45000 })
  if (opts.expectStorytreeLane) {
    await page.getByRole('region', { name: 'Storyboard lane Storytree' }).waitFor({ timeout: 45000 })
    await page.locator('[data-kg-storytree-edge]').first().waitFor({ state: 'visible', timeout: 45000 })
    if (opts.expectStorytreeParentEdges) {
      await page.locator('[data-kg-storytree-edge="parent_node_id"]').first().waitFor({ state: 'visible', timeout: 45000 })
    }
  }
}

const exerciseStorytreeWorkflow = async page => {
  await page.getByRole('button', { name: 'Strybldr storytree filter Protected' }).click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Strybldr storytree filter All' }).click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Strybldr like storytree branch' }).click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Strybldr storytree filter Protected' }).click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Strybldr unlock storytree branch' }).click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Strybldr storytree filter All' }).click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Strybldr draft storytree continuation' }).click({ timeout: 15000 })
  await page.locator('select[aria-label="Strybldr storytree branch"] option', { hasText: 'Draft continuation' }).first().waitFor({ state: 'attached', timeout: 15000 })
}

const seedBytePlusProviderSettings = url => {
  const basePath = (() => {
    try {
      const pathname = new URL(url).pathname || '/'
      if (!pathname || pathname === '/') return '/'
      return pathname.endsWith('/') ? pathname : `${pathname}/`
    } catch {
      return '/'
    }
  })()
  const prefix = basePath === '/' ? '' : `kg:scope:${basePath}::`
  for (const storagePrefix of prefix ? ['', prefix] : ['']) {
    window.localStorage.setItem(`${storagePrefix}kg:chat:provider`, JSON.stringify('byteplus-modelark'))
    window.localStorage.setItem(`${storagePrefix}kg:chat:authMode`, JSON.stringify('serverManaged'))
  }
}

const appUrl = process.env.AGENTIC_OS_APP_URL || 'http://127.0.0.1:5173/'
const demoInputPath = String(
  process.env.AGENTIC_OS_STRYTREE_DEMO_INPUT ||
  process.env.AGENTIC_OS_STRYBLDR_DEMO_INPUT ||
  '',
).trim() ||
  readRequiredEnv('AGENTIC_OS_STRYBLDR_DEMO_INPUT')
const demoInputBasename = basename(demoInputPath)
const demoText = await readFile(demoInputPath, 'utf8')
const expectRemoteVideoReferences = /(?:youtube\.com|youtu\.be|kgYoutubeVideoId)/i.test(`${demoText}\n${process.env.AGENTIC_OS_STRYTREE_IMPORT_URL || ''}\n${process.env.AGENTIC_OS_STRYBLDR_IMPORT_URL || ''}`)
const expectStorytreeLane = /"storytree"\s*:/.test(demoText)
const expectStorytreeParentEdges = /"parentNodeId"\s*:\s*"[^"]+"/.test(demoText)
const flowMode = String(
  process.env.AGENTIC_OS_STRYTREE_E2E_MODE ||
  process.env.AGENTIC_OS_STRYBLDR_E2E_MODE ||
  'import-url',
).trim().toLowerCase()
if (flowMode !== 'import-url' && flowMode !== 'local-file') {
  throw new Error('AGENTIC_OS_STRYBLDR_E2E_MODE must be import-url or local-file')
}
const importUrl = String(
  process.env.AGENTIC_OS_STRYTREE_IMPORT_URL ||
  process.env.AGENTIC_OS_STRYBLDR_IMPORT_URL ||
  parseFrontmatter(demoText).kgWebpageUrl ||
  '',
).trim()
if (flowMode === 'import-url' && !/^https?:\/\//i.test(importUrl)) {
  throw new Error('demo frontmatter must provide kgWebpageUrl or set AGENTIC_OS_STRYBLDR_IMPORT_URL')
}
if (flowMode === 'local-file' && importUrl && !/^https?:\/\//i.test(importUrl)) {
  throw new Error('local-file import source must be an absolute HTTP URL when provided')
}

const timeoutMs = Number(process.env.AGENTIC_OS_GENERATED_VIDEO_TIMEOUT_MS || 360000)
const requireGeneratedVideo = envBool('AGENTIC_OS_REQUIRE_GENERATED_VIDEO')
const headless = process.env.AGENTIC_OS_E2E_HEADLESS
  ? process.env.AGENTIC_OS_E2E_HEADLESS !== '0'
  : !process.env.AGENTIC_OS_E2E_CHROME_EXECUTABLE
const launchOptions = {
  headless,
  ...(process.env.AGENTIC_OS_E2E_CHROME_EXECUTABLE ? { executablePath: process.env.AGENTIC_OS_E2E_CHROME_EXECUTABLE } : {}),
}

const browser = await chromium.launch(launchOptions)
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  page.setDefaultNavigationTimeout(60000)
  const appConsoleErrors = []
  const failedResponses = []
  page.on('console', msg => {
    if (msg.type() === 'error') appConsoleErrors.push(msg.text())
  })
  page.on('pageerror', error => appConsoleErrors.push(error.message))
  page.on('response', response => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() })
  })

  await page.addInitScript(seedBytePlusProviderSettings, appUrl)
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(() => window.localStorage.clear())
  await page.evaluate(seedBytePlusProviderSettings, appUrl)
  await page.reload({ waitUntil: 'domcontentloaded' })

  let importedDemoPath = null
  if (flowMode === 'local-file') {
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Launch' }).click()
    await page.getByRole('button', { name: /^Import local files$/ }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(demoInputPath)
    importedDemoPath = await waitForImportedDemoFile(page, demoInputBasename, importUrl)
  } else {
    await page.getByRole('button', { name: 'Launch' }).click()
    await page.getByRole('button', { name: /^Import URL$/ }).click()
    await page.locator('.kg-import-url-input').fill(importUrl)
    await page.locator('select[aria-label="Import URL renderer"]').selectOption('strybldr:document')
    await page.locator('.kg-import-url-confirm').click()
  }
  try {
    await waitForStrybldrSurface(page, { expectStorytreeLane, expectStorytreeParentEdges })
    if (expectStorytreeLane) await exerciseStorytreeWorkflow(page)
  } catch (error) {
    const screenshotPath = join(tmpdir(), `agentic-graph-strybldr-generated-video-e2e-surface-${Date.now().toString(36)}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => null)
    const diagnostic = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 1000),
      storageKeys: Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter(Boolean).sort(),
    })).catch(() => null)
    console.error(JSON.stringify({ stage: 'waitForStrybldrSurface', screenshotPath, diagnostic, appConsoleErrors, failedResponses }, null, 2))
    throw error
  }

  const beforeEntries = await readWorkspaceEntries(page)
  if (flowMode === 'local-file') {
    importedDemoPath = importedDemoPath || assertImportedDemoFile(beforeEntries, demoInputBasename, importUrl)
  }
  const beforeArtifacts = listArtifactPaths(beforeEntries)
  await page.getByRole('button', { name: 'Run all' }).click()
  await page.waitForFunction(
    previous => {
      const raw = window.localStorage.getItem('kg:workspace-fs')
        || Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
          .filter(Boolean)
          .filter(key => key.endsWith('::kg:workspace-fs'))
          .map(key => window.localStorage.getItem(key))
          .find(Boolean)
      const entries = raw ? JSON.parse(raw).entries || {} : {}
      return Object.keys(entries).some(path => /\/strybldr-video(?:-fallback)?-[^/]+\.md$/.test(path) && !previous.includes(path))
    },
    beforeArtifacts,
    { timeout: timeoutMs },
  )

  const afterEntries = await readWorkspaceEntries(page)
  const newArtifacts = listArtifactPaths(afterEntries).filter(path => !beforeArtifacts.includes(path))
  const actionableConsoleErrors = appConsoleErrors.filter(message => {
    const text = String(message || '')
    if (/^Failed to load resource:/i.test(text)) return false
    if (/CORS policy/i.test(text) && /https:\/\/airvio\.co\/api\/storage\//i.test(text)) return false
    return true
  })
  if (actionableConsoleErrors.length > 0) {
    throw new Error(`application console errors: ${JSON.stringify(actionableConsoleErrors)}`)
  }
  const playablePath = newArtifacts.find(path => /\/strybldr-video-(?!fallback-)[^/]+\.md$/.test(path))
  const fallbackPath = newArtifacts.find(path => /\/strybldr-video-fallback-[^/]+\.md$/.test(path))
  if (!playablePath) {
    const fallbackText = fallbackPath ? afterEntries[fallbackPath] : ''
    const reason = parseErrorReason(fallbackText)
    const settingsSnapshot = await page.evaluate(() => Object.fromEntries(
      Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter(key => key && /kg:chat:(?:provider|authMode|endpointUrl|model)$/.test(key))
        .map(key => [key, window.localStorage.getItem(key)]),
    )).catch(() => null)
    const detail = {
      appUrl,
      demoInputPath,
      importedDemoPath,
      importUrl,
      flowMode,
      fallbackPath: fallbackPath || null,
      reason,
      settingsSnapshot,
      appConsoleErrors,
      failedResponses,
    }
    if (!fallbackPath) {
      console.error(JSON.stringify(detail, null, 2))
      process.exitCode = 2
    } else {
      const artifact = assertHandoffArtifact(fallbackText, 'fallback', { expectRemoteVideoReferences })
      if (requireGeneratedVideo) {
        console.error(JSON.stringify({ ...detail, mode: 'fallback', artifact, strictGeneratedVideo: true }, null, 2))
        process.exitCode = 2
      } else {
        console.log(JSON.stringify({ ...detail, mode: 'fallback', artifact }, null, 2))
      }
    }
  } else {
    const playableText = afterEntries[playablePath]
    const status = parseStatus(playableText)
    const paidCallEvidence = status === 'generated' ? 'paidCallCount: 1' : 'paidCallCount: 0'
    for (const required of ['kgStrybldrVideoHandoff: true', `status: "${status}"`, 'renderUrl:', 'sourceUrl:', paidCallEvidence]) {
      if (!playableText.includes(required)) throw new Error(`playable artifact missing ${required}`)
    }
    if (status !== 'generated' && status !== 'copied') throw new Error(`unsupported playable video status: ${status}`)
    if (status === 'copied' && !playableText.includes('copyReason:')) throw new Error('copied video artifact missing copyReason')
    assertPlayableMediaBody(playableText, status)
    const artifact = assertHandoffArtifact(playableText, status, { expectRemoteVideoReferences })
    console.log(JSON.stringify({
      appUrl,
      demoInputPath,
      importedDemoPath,
      importUrl,
      flowMode,
      playablePath,
      mode: status,
      artifact,
      failedResponseCount: failedResponses.length,
    }, null, 2))
  }
  await context.close()
} finally {
  await browser.close().catch(() => null)
}
