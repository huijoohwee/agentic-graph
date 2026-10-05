import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { executeEvidence } from '../../src/features/evidence-analysis/tools/executeEvidence.mjs'

const { equal, deepEqual: same, ok, match, notEqual } = assert
const sourcePath = 'docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md'
const localPath = '/notes/agentic-graph-game-flight-sim-demo.md'
const role = (scope, name, type = 'button') => scope.getByRole(type, { name, exact: true })
const text = (scope, title) => scope.getByText(title, { exact: true })
const label = (scope, name) => scope.getByLabel(name, { exact: true })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const checked = value => { notEqual(value?.ok, false, JSON.stringify(value)); return value }
async function bounded(run, ms = 3000) {
  let timer
  try { return await Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Deadline')), ms) })]) }
  finally { clearTimeout(timer) }
}
async function storedSource(page) {
  return page.evaluate(async path => {
    const read = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const matches = []
    for (const { name } of await indexedDB.databases()) {
      if (!name?.includes('workspace-fs:indexeddb')) continue
      const db = await read(indexedDB.open(name))
      try {
        if (!db.objectStoreNames.contains('records')) continue
        const entries = await read(db.transaction('records', 'readonly').objectStore('records').getAll())
        matches.push(...entries.filter(item => item.collection === 'entries' && item.value?.path === path).map(item => item.value.text))
      } finally { db.close() }
    }
    return matches
  }, localPath)
}
async function press(button, page, retain = false) {
  await button.scrollIntoViewIfNeeded(); await button.focus(); await button.press('Enter')
  if (!retain) return
  const handle = await button.elementHandle()
  try { await page.waitForFunction(element => element?.isConnected && !element.disabled, handle) }
  finally { await handle?.dispose() }
  equal(await button.evaluate(element => document.activeElement === element), true)
}
async function detail(panel, title) {
  const summary = text(panel, title)
  const details = summary.locator('..')
  if (!await details.evaluate(element => element.open)) { await summary.focus(); await summary.press('Enter') }
  return JSON.parse(await details.locator('pre').innerText())
}
async function evidencePanel(page) {
  const close = role(page.locator('[aria-label="Markdown view controls"]'), 'Close')
  if (await close.isVisible()) await close.click()
  const recorded = role(page, 'Recorded flight evidence', 'region')
  await recorded.waitFor()
  const panel = role(recorded, 'Native evidence and analysis', 'region')
  await panel.waitFor()
  return panel
}
async function tableProof(panel, page, expected) {
  const table = role(panel, 'Original fact table', 'region')
  equal(await table.getAttribute('tabindex'), '0')
  equal(await table.locator('th[scope="col"]').count(), 5)
  equal(await table.locator('input,textarea,select,[contenteditable="true"]').count(), 0)
  await table.focus()
  const overflow = await table.evaluate(element => element.scrollWidth > element.clientWidth + 1)
  if (overflow) {
    for (let index = 0; index < 64; index++) await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => { const el = document.querySelector('[aria-label="Original fact table"]'); return el.scrollLeft >= el.scrollWidth - el.clientWidth - 2 }, undefined, { timeout: 3000 })
    for (let index = 0; index < 64; index++) await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => document.querySelector('[aria-label="Original fact table"]').scrollLeft <= 1, undefined, { timeout: 3000 })
  }
  await page.keyboard.press('Tab')
  match(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''), /^Inspect original source for /)
  await page.keyboard.press('Shift+Tab')
  equal(await table.evaluate(element => document.activeElement === element), true)
  const ids = []; let pages = 0
  for (;;) {
    const batch = await table.locator('tbody button').evaluateAll(items => items.map(item => item.getAttribute('aria-label').replace('Inspect original source for ', '')))
    ok(batch.length <= 50); ids.push(...batch); pages++
    const next = role(panel, 'Next facts')
    if (!await next.isEnabled()) break
    ok(pages < 100)
    await press(next, page)
  }
  same(ids, expected); equal(new Set(ids).size, ids.length)
  for (let index = 1; index < pages; index++) await press(role(panel, 'Previous facts'), page)
  equal(await role(panel, 'Previous facts').isEnabled(), false)
  return { pages, rows: ids.length, orderedUniqueIds: true, columnHeaders: 5, keyboardScroll: overflow ? 'both-ends' : 'not-needed', readOnly: true,
    fontSize: await table.locator('td').first().evaluate(element => getComputedStyle(element).fontSize) }
}

export async function runAviationEvidenceOfflineProof({ browser, origin, root, output, revision, tree }) {
  const source = await readFile(join(root, sourcePath), 'utf8')
  const config = yaml.load(source.split('---', 3)[1]).evidence_workspace
  const observed = config.examples.find(item => item.id === 'observed-wsss-multitrack')
  const route = config.examples.find(item => item.id === 'synthetic-route')
  ok(observed && route)
  const bundle = await readFile(join(root, 'canvas/public', observed.paths[0]), 'utf8')
  const routeBundle = await readFile(join(root, 'canvas/public', route.paths[0]), 'utf8')
  const args = { bundle, profileId: config.profiles.record }
  const replay = atUtc => executeEvidence('aviation.replay', { ...args, entityId: observed.entityId, atUtc }).then(checked)
  const record = checked(await executeEvidence('aviation.inspect', args))
  const factId = record.facts.find(fact => fact.evidence_ref === '/facts/0').id
  const original = checked(await executeEvidence('aviation.source', { ...args, factId }))
  const pack = checked(await executeEvidence('aviation.export', args))
  const benchmark = checked(await executeEvidence('route.benchmark', { bundle: routeBundle, profileId: config.profiles.route, policyId: config.policies.route, entityId: route.entityId }))
  const moments = [...new Set(record.facts.map(fact => new Date(fact.observed_at).toISOString()))].sort()
  const nextUtc = moments.find(moment => Date.parse(moment) > Date.parse(observed.atUtc))
  ok(nextUtc); await mkdir(output, { recursive: true })
  const results = []
  for (const width of [1024, 390]) {
    const started = performance.now(), context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'reduce', acceptDownloads: true })
    let page, failed = false, offlineAt = null, openedAt = null, openCount = 0, remoteCount = 0, offlineRemoteCount = 0
    const errors = [], requests = [], remote = [], marks = []
    const mark = name => { marks.push({ name, elapsedMs: Math.round(performance.now() - started) }) }
    try {
      const external = url => /^https?:$/.test(url.protocol) && url.origin !== origin
      context.on('request', request => {
        const url = new URL(request.url())
        if (!external(url)) return
        remoteCount++; if (offlineAt !== null) offlineRemoteCount++
        if (remote.length < 32) remote.push({ path: (url.origin + url.pathname).slice(0, 240), offline: offlineAt !== null })
      })
      await context.route('**/*', route => external(new URL(route.request().url())) ? route.abort() : route.continue())
      page = await context.newPage(); page.setDefaultTimeout(30000)
      page.on('pageerror', error => { if (errors.length < 16) errors.push(error.message.slice(0, 400)) })
      page.on('request', request => {
        if (requests.length < 64 && offlineAt !== null) requests.push({ path: new URL(request.url()).pathname.slice(0, 240), navigation: request.isNavigationRequest() })
        if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).searchParams.has('studio-offline')) {
          openCount++; openedAt = performance.now(); mark('offline-open')
        }
      })
      page.on('dialog', dialog => { if (errors.length < 16) errors.push(`Dialog: ${dialog.message().slice(0, 240)}`); void dialog.dismiss() })
      await page.goto(origin + '/agentic-graph/?openEditorWorkspace=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await role(page, 'Source files', 'navigation').first().waitFor({ timeout: 60000 })
      mark('import-start')
      await role(page, 'Launch').click()
      const chooser = page.waitForEvent('filechooser')
      await text(page, 'Choose files').click()
      await (await chooser).setFiles({ name: localPath.split('/').at(-1), mimeType: 'text/markdown', buffer: Buffer.from(source) })
      let panel = await evidencePanel(page)
      await text(panel, config.title).waitFor()
      same(await bounded(() => storedSource(page)), [source])
      await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
      await text(panel, 'Offline Studio').click()
      await role(panel, 'Install offline Studio').click()
      const verified = panel.getByRole('status').filter({ hasText: /^Verified \d+ files/ })
      await verified.waitFor({ timeout: 190000 })
      const installation = await verified.innerText(); ok(installation.endsWith(revision.slice(0, 12)))
      mark('installed'); equal(openCount, 0)
      await context.setOffline(true); offlineAt = performance.now(); mark('disconnected')
      equal(await page.evaluate(() => navigator.onLine), false)
      await Promise.all([page.waitForURL(url => url.searchParams.get('studio-offline') === revision), role(panel, 'Open verified offline workspace').click()])
      equal(openCount, 1); ok(openedAt > offlineAt)
      await page.waitForFunction(() => document.readyState === 'complete' && !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
      same(await bounded(() => storedSource(page)), [source])
      panel = await evidencePanel(page)
      await text(panel, config.title).waitFor()
      equal(await text(page, 'Canvas source unavailable').count(), 0)
      await label(panel, 'Authored example').selectOption(observed.id)
      const load = role(panel, 'Load labelled example')
      await press(load, page, true)
      same(await detail(panel, 'Complete inspection record'), record)
      await text(panel, '3 entities · 185 facts · 3 sources').waitFor()
      await press(role(panel, `Inspect original source for ${factId}`), page, true)
      same(await detail(panel, 'Exact original source and reference'), original)
      const sourceMs = Math.round(performance.now() - started); ok(sourceMs <= 300000)
      await label(panel, 'Explicit UTC time').fill(observed.atUtc)
      await press(role(panel, 'Run read-only query'), page, true)
      same(await detail(panel, 'Complete typed result'), await replay(observed.atUtc))
      await press(role(panel, 'Next moment'), page, true)
      equal(await label(panel, 'Explicit UTC time').inputValue(), nextUtc)
      same(await detail(panel, 'Complete typed result'), await replay(nextUtc))
      const table = await tableProof(panel, page, record.facts.map(fact => fact.id))
      await press(role(panel, 'Prepare verifiable export'), page, true)
      const downloadReady = page.waitForEvent('download')
      await role(panel, 'Save evidence-pack.json', 'link').click()
      const download = await downloadReady, savedPath = join(output, `aviation-pack-${width}.json`)
      await download.saveAs(savedPath); const saved = await readFile(savedPath, 'utf8')
      await text(panel, 'Inspect or copy export JSON').click()
      equal(saved, await label(panel, 'Exact export JSON').inputValue()); equal(saved, pack.text)
      await press(role(panel, 'Remove record'), page)
      await label(panel, 'Import local JSON or matching evidence pack').setInputFiles(savedPath)
      await page.waitForFunction(() => document.querySelector('[data-kg-evidence-status]')?.textContent?.startsWith('Accepted result is bound'))
      same(await detail(panel, 'Complete inspection record'), record)
      const routeStart = performance.now()
      await role(panel, 'Route comparison').click()
      await label(panel, 'Authored example').selectOption(route.id)
      await press(load, page, true)
      const routes = await detail(panel, 'Complete typed result'); same(routes, benchmark)
      await press(role(panel, 'Run read-only query'), page, true)
      same(await detail(panel, 'Complete typed result'), routes)
      await role(panel, 'Limitations', 'heading').waitFor()
      const routeMs = Math.round(performance.now() - routeStart); ok(routeMs <= 120000)
      same(await bounded(() => storedSource(page)), [source])
      equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
      same(errors, []); equal(offlineRemoteCount, 0)
      equal(openCount, 1)
      await page.screenshot({ path: join(output, `aviation-first-offline-${width}.png`), fullPage: true })
      const result = { revision, tree, width, sourcePath, sourceSha256: hash(source), firstInstalledNavigationOffline: true,
        installation, sourceMs, routeMs, table, sourceReference: '/facts/0', utc: [observed.atUtc, nextUtc],
        pack: { file: savedPath, bytes: Buffer.byteLength(saved), sha256: hash(saved), executorParity: true, reimportParity: true },
        routeRepeatIdentical: true, keyboardFocusRetained: true, reducedMotion: true, nativeBrowserZoom: 'not-tested',
        pageErrors: errors, remoteCount, offlineRemoteCount, blockedRemoteRequests: remote, marks, productionAuthority: false }
      results.push(result); await writeFile(join(output, `aviation-first-offline-${width}.json`), JSON.stringify(result, null, 2) + '\n')
    } catch (error) {
      failed = true
      const failure = { revision, tree, width, sourcePath, sourceSha256: hash(source), error: String(error?.stack || error).slice(0, 2000), marks, errors, requests, remote, remoteCount, offlineRemoteCount, openCount, offlineAt, openedAt }
      try { failure.browser = await bounded(() => page.evaluate(() => ({ url: location.href, online: navigator.onLine, text: document.body.innerText.slice(0, 16000), worker: navigator.serviceWorker?.controller?.scriptURL }))) } catch { failure.browser = 'unavailable' }
      await writeFile(join(output, `aviation-first-offline-${width}-failure.json`), JSON.stringify(failure, null, 2) + '\n').catch(() => {})
      if (page) await bounded(() => page.screenshot({ path: join(output, `aviation-first-offline-${width}-failure.png`), fullPage: true })).catch(() => {})
      throw error
    } finally {
      try { await bounded(() => context.close(), 5000) } catch (error) { if (!failed) throw error }
    }
  }
  return results
}
