import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { canonicalJson } from 'agentic-os'
import { productionMirrorArtifactEntries } from './production-mirror-artifact-entries.mjs'
import { validateProductionRuntimeReadiness } from './production-runtime-readiness.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const writeJson = (file, value) => fs.writeFile(file, canonicalJson(value) + '\n', { flag: 'wx', mode: 0o600 })
const inputPath = () => {
  const file = process.env.AGENTIC_OS_BROWSER_PREFLIGHT_INPUT
  assert.ok(file && path.isAbsolute(file), 'absolute browser preflight input is required')
  return file
}

// Hash all bytes that the existing release owner transfers, not just a marker's claim.
export async function browserArtifactDigest(artifactRoot) {
  const records = new Map()
  const visit = async relative => {
    if (records.has(relative)) return
    const file = path.join(artifactRoot, relative), stat = await fs.lstat(file)
    assert.ok(!stat.isSymbolicLink(), 'browser artifact cannot contain symlinks')
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) await visit(path.posix.join(relative, name))
    } else {
      assert.ok(stat.isFile(), 'browser artifact entry must be a regular file')
      assert.ok(records.size < 25000, 'browser artifact file budget exceeded')
      records.set(relative, hash(await fs.readFile(file)))
    }
  }
  for (const relative of [...productionMirrorArtifactEntries,
    'content/singabldr/index.html', 'content/singabldr/manifest.webmanifest', 'content/singabldr/sw.js']) await visit(relative)
  return hash(canonicalJson([...records].sort(([a], [b]) => a.localeCompare(b))))
}

export async function inspectBrowserInput(input) {
  assert.deepEqual(Object.keys(input).sort(), ['artifactRoot', 'docsRoot', 'schema'])
  assert.equal(input.schema, 'agentic-graph/browser-preflight-input/v1')
  for (const key of ['artifactRoot', 'docsRoot']) {
    assert.ok(path.isAbsolute(input[key]), `${key} must be absolute`)
    assert.equal(await fs.realpath(input[key]), input[key], `${key} must be a real path`)
  }
  const docsRepository = path.dirname(input.docsRoot)
  const sourceRevision = git(root, 'rev-parse', 'HEAD')
  const marker = await readJson(path.join(input.artifactRoot, '.well-known/runtime-readiness.json'))
  await validateProductionRuntimeReadiness(marker, { sourceRevision,
    sourceTree: git(root, 'rev-parse', 'HEAD^{tree}'), agenticCanvasOsRevision: git(docsRepository, 'rev-parse', 'HEAD') })
  assert.equal(git(docsRepository, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'docs source must be clean')
  const configuration = { schema: 'agentic-graph/browser-preflight-configuration/v1',
    docsTree: git(docsRepository, 'rev-parse', 'HEAD^{tree}'),
    immutableManifestDigest: marker.immutableManifest.digest,
    runtimeProfile: await readJson(path.join(root, 'config/production-release-profile.json')),
    isolation: 'candidate-pages-and-native-storage-sqlite', network: 'denied' }
  return { schema: 'agentic-os/flight-check-context/v1', sourceRevision,
    artifactDigest: await browserArtifactDigest(input.artifactRoot), configurationDigest: hash(canonicalJson(configuration)) }
}

let isolatedDispatch = null
export async function verifyStaticAssetRevalidation(dispatch, url) {
  const first = await dispatch(new Request(url))
  assert.equal(first.status, 200, 'candidate script must load before cache revalidation')
  assert.match(first.headers.get('content-type') || '', /javascript/)
  const etag = first.headers.get('etag')
  assert.ok(etag, 'candidate script must provide a cache validator')
  await first.arrayBuffer()
  for (const method of ['GET', 'HEAD']) {
    const cached = await dispatch(new Request(url, { method, headers: { 'if-none-match': etag } }))
    assert.equal(cached.status, 304, 'candidate script cache revalidation must preserve 304')
    assert.equal(cached.headers.get('etag'), etag, 'cache response must preserve the validator')
    assert.equal(await cached.text(), '', 'cache response must have no body')
  }
}

export async function attachBrowserPreflightIsolation(context) {
  if (!isolatedDispatch) return
  await context.route('**/*', async route => {
    const request = route.request()
    try {
      const response = await isolatedDispatch(new Request(request.url(), { method: request.method(), headers: request.headers(),
        ...(['GET', 'HEAD'].includes(request.method()) ? {} : { body: request.postDataBuffer() }) }))
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    } catch (error) { console.error(`isolated browser request failed: ${new URL(request.url()).pathname}: ${error.message}`); await route.abort() }
  })
}

// This is an isolated behavior check. The real candidate Pages bundle and storage
// Worker execute; provider routing, credentials and activation are still verified live.
async function isolate(input) {
  const { createFixture } = await import('../canvas/src/__tests__/helpers/native-agentic-graph-storage-fixture.ts')
  const fixture = await createFixture(undefined, { workspaceId: 'kgws:canonical-docs', origin: 'https://airvio.co' })
  const actualFetch = globalThis.fetch
  // Module initialization must be isolated too: the compiled Pages module reads
  // its published catalog while it initializes the discovery endpoints.
  globalThis.fetch = async (request, init) => {
    const input = new Request(request, init), url = new URL(input.url)
    if (['airvio.co', 'storage.airvio.co'].includes(url.hostname) && url.pathname.startsWith('/api/storage/'))
      return fixture.request(url.pathname + url.search, { method: input.method, headers: input.headers })
    return new Response('External network denied by browser preflight', { status: 502 })
  }
  try {
    const docsRepository = path.dirname(input.docsRoot)
    const records = git(docsRepository, 'ls-tree', '-r', 'HEAD', '--', 'docs').split('\n')
    for (const record of records) {
      const match = /^100644 blob ([0-9a-f]{40})\t(docs\/.*\.(?:md|gltf|glb))$/.exec(record)
      if (!match) continue
      const bytes = await fs.readFile(path.join(docsRepository, match[2]))
      assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), match[1], 'docs bytes changed')
      const content = bytes.toString(match[2].endsWith('.glb') ? 'base64' : 'utf8')
      const canonicalPath = `agentic-canvas-os/${match[2]}`, id = `docs:${hash(canonicalPath).slice(0, 24)}`
      fixture.document(id, content)
      fixture.sql.prepare('update documents set canonical_path=?,content_hash=? where id=?').run(canonicalPath, hash(bytes), id)
      const identity = fixture.identity(id)
      const published = await fixture.publication(id, 'publish', { expectedRevision: identity.revision, expectedContentHash: identity.contentHash })
      assert.equal(published.status, 200, `isolated publication failed: ${canonicalPath}`)
    }
    const redirects = (await fs.readFile(path.join(input.artifactRoot, '_redirects'), 'utf8')).split('\n')
      .map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/))
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json',
      '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.md': 'text/markdown' }
    const asset = async request => {
      const url = new URL(request.url)
      let target = url.pathname
      for (const [from, to, status] of redirects) {
        const expression = new RegExp('^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '(.*)') + '$')
        const match = expression.exec(target)
        if (!match) continue
        const next = to.replace(':splat', match[1] || '')
        if (Number(status) >= 300) return new Response(null, { status: Number(status), headers: { location: new URL(next, url).href } })
        target = next; break
      }
      const file = path.resolve(input.artifactRoot, '.' + decodeURIComponent(target))
      assert.ok(file.startsWith(input.artifactRoot + path.sep), 'asset escapes candidate')
      try {
        const stat = await fs.stat(file)
        if (!stat.isFile()) throw new Error('not a file')
        const bytes = await fs.readFile(file), etag = `"${hash(bytes)}"`
        const headers = { etag, 'content-type': types[path.extname(file)] || 'application/octet-stream' }
        if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
        return new Response(request.method === 'HEAD' ? null : bytes, { headers })
      } catch {
        return new Response(await fs.readFile(path.join(input.artifactRoot, '404.html')), { status: 404, headers: { 'content-type': 'text/html' } })
      }
    }
    const pages = (await import(pathToFileURL(path.join(input.artifactRoot, '_worker.js')).href)).default
    const pending = []
    isolatedDispatch = async request => {
      const url = new URL(request.url)
      if (!['airvio.co', 'storage.airvio.co'].includes(url.hostname)) return new Response('External network denied by browser preflight', { status: 502 })
      if (url.pathname.startsWith('/api/storage/')) return fixture.request(url.pathname + url.search,
        { method: request.method, headers: request.headers, ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: await request.arrayBuffer() }) })
      assert.equal(url.hostname, 'airvio.co', 'unexpected storage route')
      return pages.fetch(request, { ASSETS: { fetch: asset } }, { waitUntil: promise => pending.push(promise), passThroughOnException() {} })
    }
    globalThis.fetch = (request, init) => isolatedDispatch(new Request(request, init))
    // Playwright routing disables browser HTTP caching. Explicitly exercise the
    // real Pages handler's conditional path before opening Home and its iframe.
    const shell = await fs.readFile(path.join(input.artifactRoot, 'content/agentic-graph/index.html'), 'utf8')
    const entry = /<script\b[^>]*\bsrc="([^"]+\/assets\/[^"?]+\.js)"/.exec(shell)?.[1]
    assert.ok(entry, 'candidate Graph shell must name its entry script')
    await verifyStaticAssetRevalidation(isolatedDispatch, new URL(entry, 'https://airvio.co/agentic-graph/').href)
    const marker = await readJson(path.join(input.artifactRoot, '.well-known/runtime-readiness.json'))
    Object.assign(process.env, { PRODUCTION_ORIGIN: 'https://airvio.co', PRODUCTION_MARKER_ORIGIN: 'https://airvio.co',
      RELEASE_SHA: marker.source.revision, PRODUCTION_IMMUTABLE_MANIFEST_DIGEST: marker.immutableManifest.digest, PRODUCTION_BROWSER_HEADLESS: 'true' })
    await import('./verify-production-fidelity.mjs')
    await Promise.all(pending)
    console.log(JSON.stringify({ schema: 'agentic-graph/browser-preflight/v1', isolated: true, productionReady: false, authorizesEffects: false, status: 'passed' }))
  } finally { globalThis.fetch = actualFetch; isolatedDispatch = null; await fixture.close() }
}

async function main() {
  const command = process.argv[2], file = inputPath()
  assert.ok(['prepare', 'check', 'isolate'].includes(command), 'expected prepare, check, or isolate')
  if (command === 'prepare') {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    const input = { schema: 'agentic-graph/browser-preflight-input/v1', artifactRoot: await fs.realpath(process.env.AGENTIC_OS_PUBLISH_REPOSITORY_ROOT),
      docsRoot: await fs.realpath(process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT) }
    const context = await inspectBrowserInput(input)
    await writeJson(file, input); await writeJson(path.join(path.dirname(file), 'context.json'), context)
    console.log(JSON.stringify(context)); return
  }
  const input = await readJson(file)
  const context = await readJson(process.env.AGENTIC_OS_FLIGHT_CONTEXT || path.join(path.dirname(file), 'context.json'))
  assert.deepEqual(await inspectBrowserInput(input), context, 'browser candidate/configuration changed')
  if (command === 'isolate') return isolate(input)
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), 'isolate'], { cwd: root, stdio: 'inherit',
    env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'canvas/tsconfig.json') } })
  const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) })
  assert.equal(result.signal, null, 'browser preflight interrupted'); assert.equal(result.code, 0, 'browser preflight failed')
  assert.deepEqual(await inspectBrowserInput(input), context, 'browser candidate/configuration changed during check')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1 })
