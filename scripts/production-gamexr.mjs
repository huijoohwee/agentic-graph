import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const run = (cwd, command, args, env = {}) => execFileSync(command, args, {
  cwd, env: { ...process.env, ...env }, stdio: 'inherit', timeout: 300_000,
})
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const digest = entries => sha256([...entries].sort((a, b) => a.path.localeCompare(b.path))
  .map(entry => `${entry.path}\0${entry.bytes}\0${entry.sha256}`).join('\n'))
const safePath = value => typeof value === 'string' && value.length > 0
  && !value.includes('\\') && !value.includes('\0') && !value.startsWith('/')
  && value.split('/').every(part => part && part !== '.' && part !== '..')

export function validateGameXrPin(pin) {
  assert.deepEqual(Object.keys(pin).sort(), ['schema', 'repository', 'sourceRevision', 'artifactDigest',
    'integrationRunId', 'headersDigest', 'redirectsDigest'].sort())
  assert.equal(pin.schema, 'agentic-graph-production-gamexr/v1')
  assert.equal(pin.repository, 'huijoohwee/GameXR')
  assert.match(pin.sourceRevision, /^[0-9a-f]{40}$/)
  for (const key of ['artifactDigest', 'headersDigest', 'redirectsDigest']) assert.match(pin[key], /^[0-9a-f]{64}$/)
  assert.ok(Number.isSafeInteger(pin.integrationRunId) && pin.integrationRunId > 0)
  return pin
}

export async function verifyGameXrArtifact(directory, pin) {
  const entries = []
  const visit = async relative => {
    const full = path.join(directory, relative), stat = await fs.lstat(full)
    assert.ok(!stat.isSymbolicLink(), 'GameXR artifact cannot contain symlinks')
    if (stat.isDirectory()) for (const name of await fs.readdir(full)) await visit(relative ? `${relative}/${name}` : name)
    else {
      assert.ok(stat.isFile() && stat.size <= 16 * 1024 * 1024, 'GameXR artifact file budget/type')
      assert.ok(safePath(relative) && entries.length < 2000, 'GameXR artifact path/count budget')
      entries.push({ path: relative, bytes: stat.size, sha256: sha256(await fs.readFile(full)) })
    }
  }
  await visit('')
  assert.ok(entries.reduce((sum, entry) => sum + entry.bytes, 0) <= 64 * 1024 * 1024, 'GameXR artifact byte budget')
  const manifest = await json(path.join(directory, 'release-manifest.json'))
  assert.equal(manifest.schema, 'gamexr-release-artifact/v1')
  assert.equal(manifest.application, 'GameXR')
  assert.equal(manifest.basePath, '/gamexr/')
  assert.equal(manifest.candidateStatus, 'source-bound-clean')
  assert.equal(manifest.deploymentAuthorized, false)
  assert.equal(manifest.sourceRevision, pin.sourceRevision)
  assert.deepEqual(manifest.source, { versionControl: 'git', head: 'resolved', worktree: 'clean', statusDigest: sha256('') })
  assert.equal(manifest.artifactDigest, pin.artifactDigest)
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.every(entry => safePath(entry.path)))
  const actual = entries.filter(entry => entry.path !== 'release-manifest.json').sort((a, b) => a.path.localeCompare(b.path))
  assert.deepEqual(manifest.artifacts, actual, 'GameXR inventory must bind every artifact byte exactly once')
  assert.equal(digest(actual), pin.artifactDigest)
  return manifest
}

const scoped = line => /^\/(?:gamexr|GameXR|content\/gamexr)(?:\/|\s|$)/.test(line)
const headerBlocks = text => text.split(/(?=^\/)/m).filter(block => block.startsWith('/'))
  .map(block => block.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).join('\n'))
export function verifyGameXrFragments({ headers, redirects, mirrorHeaders, mirrorRedirects, pin }) {
  assert.equal(sha256(headers), pin.headersDigest, 'GameXR headers source pin')
  assert.equal(sha256(redirects), pin.redirectsDigest, 'GameXR redirects source pin')
  const expectedHeaders = headerBlocks(headers)
  assert.ok(expectedHeaders.length > 0 && expectedHeaders.every(scoped), 'GameXR header scope')
  assert.deepEqual(headerBlocks(mirrorHeaders).filter(scoped), expectedHeaders, 'Root owner GameXR header projection drifted')
  const lines = text => text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  const expectedRoutes = lines(redirects)
  assert.ok(expectedRoutes.length > 0 && expectedRoutes.every(scoped), 'GameXR route scope')
  assert.deepEqual(lines(mirrorRedirects).filter(scoped).sort(), expectedRoutes.sort(), 'Root owner GameXR redirect projection drifted')
}

export async function admitGameXr({ sourceRoot, mirrorRoot, pin }) {
  assert.equal(await fs.realpath(sourceRoot), sourceRoot)
  assert.equal(await fs.realpath(mirrorRoot), mirrorRoot)
  assert.notEqual(sourceRoot, mirrorRoot)
  const artifact = path.join(sourceRoot, 'dist/gamexr')
  const manifest = await verifyGameXrArtifact(artifact, pin)
  verifyGameXrFragments({ pin,
    headers: await fs.readFile(path.join(sourceRoot, 'deployment/cloudflare/headers.fragment'), 'utf8'),
    redirects: await fs.readFile(path.join(sourceRoot, 'deployment/cloudflare/redirects.fragment'), 'utf8'),
    mirrorHeaders: await fs.readFile(path.join(mirrorRoot, '_headers'), 'utf8'),
    mirrorRedirects: await fs.readFile(path.join(mirrorRoot, '_redirects'), 'utf8'),
  })
  const content = path.join(mirrorRoot, 'content'), target = path.join(content, 'gamexr')
  assert.equal(await fs.realpath(content), content, 'Mirror content must not be a symlink')
  const stat = await fs.lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
  assert.ok(!stat || (stat.isDirectory() && !stat.isSymbolicLink()), 'GameXR target must be a plain directory')
  // This generated subtree is the sole write set; all validation precedes replacement.
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(artifact, target, { recursive: true, errorOnExist: true, force: false })
  await verifyGameXrArtifact(target, pin)
  return { schema: 'agentic-graph-gamexr-admission/v1', sourceRevision: pin.sourceRevision,
    artifactDigest: manifest.artifactDigest, files: manifest.artifacts.length + 1, integrationRunId: pin.integrationRunId }
}

export function assertAnalyticsDisabled(project) {
  assert.ok(project && typeof project.build_config === 'object', 'Pages build configuration is required')
  assert.ok(!project.build_config.web_analytics_tag && !project.build_config.web_analytics_token,
    'Pages Web Analytics must be disabled before exact-byte GameXR deployment')
}

async function settings() {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_PAGES_PROJECT: project } = process.env
  assert.ok(account && token && project, 'Cloudflare owner credentials/project are required')
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  assert.ok(response.ok, `Pages configuration read failed: HTTP ${response.status}`)
  const payload = await response.json()
  assert.equal(payload.success, true)
  assertAnalyticsDisabled(payload.result)
  return { analyticsDisabled: true }
}

export const fetchGameXrBytes = async (url, fetchFn = fetch) => {
  let current = new URL(url), response
  for (let hop = 0; hop < 3; hop++) {
    response = await fetchFn(current.href, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    if (response.status === 200) break
    const allowed = current.pathname === '/gamexr/index.html' ? ['/gamexr/', '/content/gamexr/']
      : current.pathname === '/content/gamexr/' ? ['/gamexr/'] : []
    assert.ok([301, 308].includes(response.status) && allowed.length, `GameXR HTTP status: ${current.href}`)
    const target = new URL(response.headers.get('location'), current)
    assert.ok(target.origin === new URL(url).origin && !target.search && !target.hash && !target.username && !target.password
      && allowed.includes(target.pathname), 'GameXR shell redirect must stay canonical and same-origin')
    await response.body?.cancel()
    current = target
  }
  assert.equal(response.status, 200, `GameXR HTTP status: ${url}`)
  return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers }
}
export async function verifyGameXrLive(origin, pin) {
  const url = new URL(origin)
  assert.ok(url.origin === origin && !url.username && !url.password, 'GameXR target must be an origin')
  const { bytes } = await fetchGameXrBytes(`${origin}/gamexr/release-manifest.json`), manifest = JSON.parse(bytes)
  assert.equal(manifest.sourceRevision, pin.sourceRevision)
  assert.equal(manifest.artifactDigest, pin.artifactDigest)
  assert.equal(manifest.candidateStatus, 'source-bound-clean')
  assert.equal(manifest.deploymentAuthorized, false)
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length < 2000)
  const entries = []
  for (const entry of manifest.artifacts) {
    assert.ok(safePath(entry.path), 'GameXR live artifact path')
    const result = await fetchGameXrBytes(`${origin}/gamexr/${entry.path}`)
    assert.equal(result.bytes.length, entry.bytes, entry.path)
    assert.equal(sha256(result.bytes), entry.sha256, entry.path)
    const cache = result.headers.get('cache-control') || ''
    assert.ok(cache.includes('no-transform'), `GameXR transforms forbidden: ${entry.path}`)
    assert.ok(cache.includes(entry.path.startsWith('assets/') ? 'immutable' : 'no-store'), `GameXR caching: ${entry.path}`)
    const type = result.headers.get('content-type') || ''
    const mime = { '.html': /text\/html/, '.js': /(?:application|text)\/javascript/, '.css': /text\/css/,
      '.json': /application\/json/, '.webmanifest': /application\/(?:manifest\+json|json)/, '.svg': /image\/svg\+xml/, '.txt': /text\/plain/ }
    assert.match(type, mime[path.extname(entry.path)] || /./, entry.path)
    entries.push({ path: entry.path, bytes: result.bytes.length, sha256: sha256(result.bytes) })
  }
  assert.equal(digest(entries), pin.artifactDigest)
  const shell = await fetchGameXrBytes(`${origin}/gamexr/`)
  assert.equal(sha256(shell.bytes), entries.find(entry => entry.path === 'index.html')?.sha256)
  for (const [from, to] of [['/GameXR', '/gamexr/'], ['/GameXR/sw.js', '/gamexr/sw.js']]) {
    const response = await fetch(origin + from, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    assert.equal(response.status, 301)
    assert.equal(new URL(response.headers.get('location'), origin).href, origin + to)
    await response.body?.cancel()
  }
  return { origin, sourceRevision: pin.sourceRevision, artifactDigest: pin.artifactDigest, files: entries.length }
}

async function browserTransition(mode, pin) {
  const { chromium } = await import('playwright')
  const temp = path.resolve(process.env.RUNNER_TEMP || '')
  assert.ok(process.env.RUNNER_TEMP, 'A bounded release browser profile requires RUNNER_TEMP')
  const profile = path.join(temp, 'gamexr-returning-user'), evidence = path.join(temp, 'gamexr-before.json')
  const origin = 'https://airvio.co'
  const before = mode === 'prewarm' ? null : await json(evidence)
  const manifest = JSON.parse((await fetchGameXrBytes(`${origin}/gamexr/precache-manifest.json`)).bytes)
  const release = JSON.parse((await fetchGameXrBytes(`${origin}/gamexr/release-manifest.json`)).bytes)
  if (mode !== 'prewarm') {
    assert.equal(release.sourceRevision, pin.sourceRevision)
    assert.equal(release.artifactDigest, pin.artifactDigest)
    assert.equal(before.origin, origin)
  }
  const context = await chromium.launchPersistentContext(profile, { headless: true })
  try {
    const page = await context.newPage()
    await page.goto(`${origin}/gamexr/`)
    await page.waitForFunction(() => window.gameXR && document.querySelector('#app')?.getAttribute('aria-busy') === 'false')
    if (mode === 'prewarm') await page.evaluate(() => localStorage.setItem('gamexr-release-sentinel', 'preserve'))
    else assert.equal(await page.evaluate(() => localStorage.getItem('gamexr-release-sentinel')), 'preserve')
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; await registration.update(); registration.waiting?.postMessage('gamexr:skip-waiting') })
    await page.waitForFunction(async buildDigest => {
      const registration = await navigator.serviceWorker.getRegistration()
      registration?.waiting?.postMessage('gamexr:skip-waiting')
      const names = (await caches.keys()).filter(name => name.startsWith('gamexr-shell-'))
      if (!names.includes(`gamexr-shell-${buildDigest}`)) return false
      const marker = await (await caches.open(`gamexr-shell-${buildDigest}`)).match(new URL('.gamexr-cache-active', document.URL))
      return names.length === 1 && names[0] === `gamexr-shell-${buildDigest}` && marker
        && (await marker.json()).buildDigest === buildDigest && Boolean(navigator.serviceWorker.controller)
    }, manifest.buildDigest, { timeout: 90_000 })
    await page.reload()
    await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('aria-busy') === 'false')
    const cached = await page.evaluate(async manifest => {
      const cache = await caches.open(`gamexr-shell-${manifest.buildDigest}`)
      return Promise.all(manifest.entries.map(async entry => {
        const response = await cache.match(new URL(entry.path, document.URL))
        if (!response) return { path: entry.path, missing: true }
        const bytes = await response.arrayBuffer(), hash = await crypto.subtle.digest('SHA-256', bytes)
        return { path: entry.path, bytes: bytes.byteLength, sha256: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('') }
      }))
    }, manifest)
    assert.deepEqual(cached, manifest.entries.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))
    const result = { schema: 'agentic-graph-gamexr-browser-transition/v1', origin, sourceRevision: release.sourceRevision,
      artifactDigest: release.artifactDigest, buildDigest: manifest.buildDigest, previousBuildDigest: before?.buildDigest || null,
      cacheBytesVerified: true, sentinelPreserved: true }
    await fs.writeFile(mode === 'prewarm' ? evidence : path.join(temp, 'gamexr-transition.json'), JSON.stringify(result) + '\n')
    return result
  } finally { await context.close() }
}

async function sourceCheck(source, pin) {
  assert.equal(git(source, 'rev-parse', 'HEAD'), pin.sourceRevision)
  assert.equal(git(source, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'GameXR source must be clean')
}
async function install(source) {
  run(source, 'npm', ['ci', '--ignore-scripts'])
  run(source, 'npx', ['playwright', 'install', '--with-deps', 'webkit'])
}
async function browserCheck(source, origin, pin) {
  run(source, 'npx', ['playwright', 'test', 'production-runtime.spec.ts'], {
    GAME_XR_E2E_URL: `${origin}/gamexr/`, GAME_XR_EXPECTED_SOURCE_REVISION: pin.sourceRevision,
    GAME_XR_EXPECTED_ARTIFACT_DIGEST: pin.artifactDigest,
  })
}
async function main(command) {
  const pin = validateGameXrPin(await json(path.join(root, 'config/production-gamexr.json')))
  if (command === 'resolve') { console.log(`revision=${pin.sourceRevision}`); return }
  if (command === 'settings') return settings()
  if (command === 'prewarm' || command === 'transition') return browserTransition(command, pin)
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE || '')
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Artifact admission runs only in the protected release workflow')
  assert.ok(process.env.GITHUB_WORKSPACE)
  const source = path.join(workspace, 'GameXR')
  await sourceCheck(source, pin)
  await install(source)
  if (command === 'prepare') {
    const ci = JSON.parse(execFileSync('gh', ['api', `repos/${pin.repository}/actions/runs/${pin.integrationRunId}`], { encoding: 'utf8' }))
    assert.equal(ci.head_sha, pin.sourceRevision); assert.equal(ci.head_branch, 'main')
    assert.equal(ci.event, 'push'); assert.equal(ci.conclusion, 'success')
    assert.equal(ci.path, '.github/workflows/integration.yml')
    run(source, 'npm', ['run', 'check:candidate'])
    await sourceCheck(source, pin)
    await verifyGameXrArtifact(path.join(source, 'dist/gamexr'), pin)
    const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4192', '--strictPort'], { cwd: source, stdio: 'ignore', detached: true })
    try {
      let ready = false
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await fetch('http://127.0.0.1:4192/gamexr/').then(r => r.ok).catch(() => false)
        if (!ready) await new Promise(resolve => setTimeout(resolve, 200))
      }
      assert.ok(ready, 'GameXR candidate preview must start')
      await browserCheck(source, 'http://127.0.0.1:4192', pin)
    } finally { if (server.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error } } }
    return admitGameXr({ sourceRoot: source, mirrorRoot: path.join(workspace, 'huijoohwee'), pin })
  }
  assert.equal(command, 'live')
  const results = []
  for (const origin of [process.env.GAMEXR_IMMUTABLE_ORIGIN, 'https://airvio.co']) {
    results.push(await verifyGameXrLive(origin, pin))
    await browserCheck(source, origin, pin)
  }
  results.push(await browserTransition('transition', pin))
  await fs.writeFile(path.join(process.env.RUNNER_TEMP, 'gamexr-live.json'), JSON.stringify(results) + '\n')
  return results
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main(process.argv[2])
  if (result) console.log(JSON.stringify(result))
}
