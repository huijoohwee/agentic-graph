import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeCloudflarePublicHtml } from './cloudflare-public-html.mjs'
import { assertSafeRoot, resolveWithin } from './production-mirror-artifact-paths.mjs'

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const routeName = 'sheets-route.json'
const digest = body => createHash('sha256').update(body).digest('hex')
const git = (root, args) => execFileSync('git', args, { cwd: root, maxBuffer: 1_000_000, stdio: ['ignore', 'pipe', 'pipe'] })
const baseFiles = ['app.mjs', 'core.mjs', 'formula.mjs', 'index.html', 'LICENSE', 'LICENSE.design-system', 'manifest.webmanifest', 'schema.mjs', 'shared-ui-profile.css', 'storage.mjs', 'styles.css', 'sw.js']
const panelFile = 'floating-panel.mjs'
const sortNames = names => names.sort((a, b) => a.localeCompare(b))
const panelFiles = sortNames([...baseFiles, panelFile])
const panelAssets = [panelFile, 'collection-layout.js', 'floating-panel.js', 'icons.json', 'panel-section.js', 'skills-commands.js', 'toolbar-icons.js']
const nativeFiles = sortNames([...baseFiles, ...panelAssets])

// Select a known producer inventory before using any manifest entry as a path.
function artifactFileNames(manifest) {
  const declared = manifest.files?.map(row => row.path)
  for (const known of [baseFiles, panelFiles, nativeFiles]) {
    if (JSON.stringify(declared) === JSON.stringify(known)) return known
  }
  throw new Error('Invalid Sheets artifact file inventory')
}
export const SHEETS_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
export const sheetsRedirects = [
  '/agentic-sheets /agentic-sheets/ 308',
  // Pages canonicalizes an index.html proxy target with a 308. Proxy both public entries to the directory.
  '/agentic-sheets/ /content/agentic-sheets/ 200',
  '/agentic-sheets/index.html /content/agentic-sheets/ 200',
  '/content/agentic-sheets /agentic-sheets/ 308',
  '/content/agentic-sheets/ /agentic-sheets/ 308',
  '/agentic-sheets/* /content/agentic-sheets/:splat 200',
  '/content/agentic-sheets/* /agentic-sheets/:splat 308',
]
export const sheetsHeaders = ['/content/agentic-sheets', '/agentic-sheets'].flatMap(prefix => [
  `${prefix}/*`, `  Content-Security-Policy: ${SHEETS_CSP}`,
  '  Cache-Control: no-cache, max-age=0, must-revalidate', '  X-Content-Type-Options: nosniff',
  `${prefix}/sw.js`, '  Service-Worker-Allowed: /agentic-sheets/',
  ...['LICENSE', 'LICENSE.design-system'].flatMap(name => [`${prefix}/${name}`, '  Content-Type: text/plain; charset=utf-8']),
])
function validateSheetsPin(pin) {
  if (pin.schema !== 'agentic-graph/sheets-source/v1' || pin.repository !== 'https://github.com/huijoohwee/agentic-sheets'
    || !/^[0-9a-f]{40}$/.test(pin.revision)) throw new Error('Invalid Sheets source pin')
  return pin
}
export async function loadSheetsPin() {
  return validateSheetsPin(JSON.parse(await fs.readFile(path.join(scriptRoot, 'agentic-sheets-source.json'))))
}
export function resolveSheetsSource(graphRoot) {
  if (process.env.AGENTIC_SHEETS_SOURCE_ROOT) return path.resolve(process.env.AGENTIC_SHEETS_SOURCE_ROOT)
  const ciSource = path.resolve(graphRoot, '..', 'agentic-sheets-source')
  if (process.env.GITHUB_ACTIONS === 'true') return ciSource
  const common = git(graphRoot, ['rev-parse', '--git-common-dir']).toString().trim()
  return path.resolve(path.dirname(path.resolve(graphRoot, common)), '..', 'agentic-sheets')
}
function validateArtifact(manifest, files) {
  if (manifest.schema !== 'sheets/artifact/v1' || manifest.contract !== 'sheets/workbook/v1'
    || digest(JSON.stringify(manifest.files)) !== manifest.artifactDigest
    || digest(JSON.stringify(manifest.inputs)) !== manifest.sourceDigest) throw new Error('Invalid Sheets artifact manifest')
  let total = 0
  for (const row of manifest.files) {
    const body = files.get(row.path)
    if (!body || body.length !== row.bytes || body.length >= 500000 || digest(body) !== row.sha256) throw new Error('Sheets artifact drift: ' + row.path)
    total += body.length
  }
  if (total !== manifest.totalBytes || total > 400000 || total + files.get('artifact-manifest.json').length > 400000) throw new Error('Sheets artifact byte budget exceeded')
  if (digest(files.get('shared-ui-profile.css')) !== manifest.designSystem.profileSha256
    || digest(files.get('LICENSE.design-system')) !== manifest.designSystem.licenseSha256) throw new Error('Sheets profile/license drift')
}
export async function createSheetsArtifact({ graphRoot = path.resolve(scriptRoot, '..'), sourceRoot = resolveSheetsSource(graphRoot), pin } = {}) {
  pin = pin === undefined ? await loadSheetsPin() : validateSheetsPin(pin)
  // Read immutable Git blobs. Unrelated local drafts never enter a release.
  const read = relative => git(sourceRoot, ['show', `${pin.revision}:${relative}`])
  const manifestBytes = read('sheets/dist/artifact-manifest.json'), manifest = JSON.parse(manifestBytes)
  const files = new Map(artifactFileNames(manifest).map(name => [name, read(`sheets/dist/${name}`)]))
  files.set('artifact-manifest.json', manifestBytes)
  validateArtifact(manifest, files)
  for (const row of manifest.inputs) {
    resolveWithin(path.resolve(sourceRoot), row.path)
    const body = read(row.path)
    if (body.length !== row.bytes || digest(body) !== row.sha256) throw new Error('Sheets source input drift: ' + row.path)
  }
  const route = { schema: 'agentic-graph/sheets-route/v1', sourceRepository: pin.repository, sourceRevision: pin.revision,
    artifactDigest: manifest.artifactDigest, sourceDigest: manifest.sourceDigest,
    files: [...files].map(([path, body]) => ({ path, bytes: body.length, sha256: digest(body) })) }
  files.set(routeName, Buffer.from(JSON.stringify(route, null, 2) + '\n'))
  return { files, manifest, route }
}
async function inventory(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    for (const entry of entries) if (!entry.isFile() || ![...nativeFiles, 'artifact-manifest.json', routeName].includes(entry.name)) throw new Error('Unowned Sheets mirror entry: ' + entry.name)
    return entries.map(entry => entry.name)
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
export async function planSheetsSync({ graphRoot, mirrorRoot, sourceRoot, pin }) {
  const targetRoot = resolveWithin(assertSafeRoot(mirrorRoot, 'Sheets mirror'), 'content/agentic-sheets')
  try { const stat = await fs.lstat(targetRoot); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid Sheets mirror directory') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const artifact = await createSheetsArtifact({ graphRoot, sourceRoot, pin }), existing = await inventory(targetRoot)
  const obsoletePanels = []
  if (existing.length) {
    const previous = JSON.parse(await fs.readFile(resolveWithin(targetRoot, routeName)))
    if (previous.schema !== 'agentic-graph/sheets-route/v1' || !Array.isArray(previous.files)) throw new Error('Sheets mirror ownership mismatch')
    for (const name of existing) {
      if (name === routeName) continue
      const prior = previous.files.find(row => row.path === name)
      if (prior) {
        if (!artifact.files.has(name)) obsoletePanels.push(prior)
        continue
      }
      // A retry may find new panel assets written before the route receipt was replaced.
      if (panelAssets.includes(name) && artifact.files.has(name)
        && (await fs.readFile(resolveWithin(targetRoot, name))).equals(artifact.files.get(name))) continue
      throw new Error('Sheets mirror ownership mismatch')
    }
  }
  const toCopy = []
  for (const [relativePath, body] of artifact.files) {
    let previous
    try { previous = await fs.readFile(resolveWithin(targetRoot, relativePath)) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (!previous?.equals(body)) toCopy.push({ relativePath, body })
  }
  return { targetRoot, artifact, toCopy, obsoletePanels, hasDrift: toCopy.length > 0 || obsoletePanels.length > 0 }
}
export async function applySheetsSync(plan) {
  await fs.mkdir(plan.targetRoot, { recursive: true })
  for (const previous of plan.obsoletePanels) {
    const file = resolveWithin(plan.targetRoot, previous.path)
    try {
      const current = await fs.readFile(file)
      if (current.length !== previous.bytes || digest(current) !== previous.sha256) {
        throw new Error('Changed Sheets panel asset during rollback')
      }
      await fs.unlink(file)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const { relativePath, body } of plan.toCopy) {
    const target = resolveWithin(plan.targetRoot, relativePath), temporary = target + '.tmp-' + process.pid
    await fs.writeFile(temporary, body, { flag: 'wx' })
    try { await fs.rename(temporary, target) } finally { await fs.rm(temporary, { force: true }) }
  }
}
const mime = name => name.endsWith('.html') ? /text\/html/i : name.endsWith('.mjs') || name.endsWith('.js') ? /(?:javascript|ecmascript)/i
  : name.endsWith('.css') ? /text\/css/i : name.endsWith('.json') || name.endsWith('.webmanifest') ? /(?:json|manifest)/i : /text\/plain/i
export async function verifySheetsRoute({ artifactRoot, origins, publicOrigin, fetchImpl = fetch, sourceRevision } = {}) {
  const root = assertSafeRoot(artifactRoot, 'Sheets artifact'), route = JSON.parse(await fs.readFile(resolveWithin(root, routeName)))
  const pin = await loadSheetsPin()
  if (route.schema !== 'agentic-graph/sheets-route/v1' || route.sourceRepository !== pin.repository || route.sourceRevision !== (sourceRevision || pin.revision)) throw new Error('Sheets route source mismatch')
  const manifestBytes = await fs.readFile(resolveWithin(root, 'artifact-manifest.json'))
  const manifest = JSON.parse(manifestBytes), names = artifactFileNames(manifest)
  const files = new Map([['artifact-manifest.json', manifestBytes]])
  for (const name of [...names, routeName]) files.set(name, await fs.readFile(resolveWithin(root, name)))
  validateArtifact(manifest, files)
  if (route.artifactDigest !== manifest.artifactDigest || route.sourceDigest !== manifest.sourceDigest
    || route.files.length !== names.length + 1 || new Set(route.files.map(row => row.path)).size !== route.files.length
    || route.files.some(row => row.path === routeName || !files.has(row.path) || files.get(row.path).length !== row.bytes || digest(files.get(row.path)) !== row.sha256)) throw new Error('Sheets route digest mismatch')
  const results = []
  for (const origin of origins) {
    const url = new URL(origin)
    if (!['https:', 'http:'].includes(url.protocol) || url.href !== url.origin + '/' || url.username || url.password) throw new Error('Invalid Sheets origin')
    const get = relative => fetchImpl(new URL(relative, url), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) })
    const redirect = await get('/agentic-sheets')
    if (![301, 308].includes(redirect.status) || new URL(redirect.headers.get('location'), url).href !== new URL('/agentic-sheets/', url).href) throw new Error('Sheets canonical redirect failed')
    const observations = []
    for (const [name, body] of files) {
      for (const routePath of name === 'index.html' ? ['/agentic-sheets/', '/agentic-sheets/index.html'] : [`/agentic-sheets/${name}`]) {
        const response = await get(routePath), actual = Buffer.from(await response.arrayBuffer())
        const contentType = response.headers.get('content-type') || ''
        const normalized = name === 'index.html' && url.origin === publicOrigin && !actual.equals(body)
          ? normalizeCloudflarePublicHtml(actual, url.origin)
          : { body: actual, normalization: [] }
        const sha256 = digest(actual)
        if (response.status !== 200 || !mime(name).test(contentType) || !normalized.body.equals(body)) {
          throw new Error(`Sheets live artifact mismatch: ${url.origin}${routePath} (HTTP ${response.status}, MIME ${contentType}, raw ${sha256}, canonical ${digest(normalized.body)}, expected ${digest(body)})`)
        }
        if (name === 'index.html' && !String(response.headers.get('content-security-policy') || '').split(', ').map(policy => policy.trim()).includes(SHEETS_CSP)) throw new Error('Sheets enforced CSP mismatch')
        if (name === 'sw.js' && response.headers.get('service-worker-allowed') !== '/agentic-sheets/') throw new Error('Sheets worker scope mismatch')
        const observation = { path: routePath, status: response.status, sha256 }
        if (normalized.normalization.length) {
          observation.canonicalSha256 = digest(normalized.body)
          observation.normalization = normalized.normalization
        }
        observations.push(observation)
      }
    }
    for (const missing of ['missing-sheet-route', 'missing.js', 'assets/missing.css']) {
      const response = await get('/agentic-sheets/' + missing)
      if (response.status !== 404) throw new Error('Sheets missing route must return 404: ' + missing)
    }
    results.push({ origin: url.origin, files: observations, missingRoutes: 3 })
  }
  return { schema: 'agentic-graph/sheets-route-proof/v1', sourceRepository: route.sourceRepository, sourceRevision: route.sourceRevision, artifactDigest: manifest.artifactDigest, origins: results }
}

export async function verifySheetsBrowser({ origin, artifactDigest }) {
  const { chromium } = await import('playwright')
  const browserEnv = { ...process.env }
  delete browserEnv.CLOUDFLARE_API_TOKEN; delete browserEnv.CLOUDFLARE_ACCOUNT_ID
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], env: browserEnv })
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } }), base = new URL(origin).origin
    const errors = [], external = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) { external.push(url.origin); await route.abort(); return }
      await route.continue()
    })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
    await page.goto(new URL('/agentic-sheets/', base).href)
    await page.waitForFunction(expected => document.documentElement.dataset.artifactDigest === expected, artifactDigest)
    const manifest = await page.evaluate(async () => (await fetch('./artifact-manifest.json')).json())
    if (manifest.artifactDigest !== artifactDigest) throw new Error('Sheets browser manifest mismatch')
    await page.locator('#sample').click()
    const total = page.getByRole('gridcell', { name: /^D4,/ })
    await total.filter({ hasText: /^80$/ }).waitFor()
    await page.getByRole('gridcell', { name: /^B2,/ }).click()
    await page.locator('#cell-input').fill('4'); await page.locator('#commit').click()
    await total.filter({ hasText: /^130$/ }).waitFor()
    await page.waitForFunction(() => navigator.serviceWorker.controller)
    await context.setOffline(true); await page.reload()
    await total.filter({ hasText: /^130$/ }).waitFor()
    let panelTabs
    if (manifest.files.some(file => file.path === 'skills-commands.js')) {
      await page.getByRole('button', { name: 'Functions', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Workbook tools' })
      await dialog.getByRole('tab', { name: 'Functions', selected: true }).waitFor()
      await dialog.getByRole('tab', { name: 'Skills & Commands' }).click()
      await dialog.getByRole('tabpanel', { name: 'Skills & Commands' }).waitFor()
      panelTabs = await dialog.getByRole('tab').allTextContents()
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
    }
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    if (!fits || errors.length || external.length) throw new Error('Sheets browser smoke failed: ' + JSON.stringify({ fits, errors, external }))
    return { schema: 'agentic-graph/sheets-browser-proof/v1', origin: base, artifactDigest, viewport: [360, 800], sample: 80, edited: 130, offlineReload: 130, ...(panelTabs && { panelTabs }) }
  } finally { await browser.close() }
}
