#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HASH = /^[0-9a-f]{64}$/u
const REVISION = /^[0-9a-f]{40}$/u
const PUBLIC_CONVERGENCE_MS = 90_000
const PUBLIC_RETRY_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000
const CLOUDFLARE_JSD_PARAMS = /window\.__CF\$cv\$params=\{r:'[0-9a-f]{16}',t:'[A-Za-z0-9+/=]+'\};/gu
const CLOUDFLARE_JSD_CANONICAL_SCRIPT = [
  `(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);`,
  `if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'',t:''};`,
  `var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';`,
  `document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}`,
  `if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;`,
  `a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';`,
  `a.style.visibility='hidden';document.body.appendChild(a);`,
  `if('loading'!==document.readyState)c();else if(window.addEventListener)`,
  `document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};`,
  `document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();`,
].join('')

class RouteObservationError extends Error {}

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export function normalizeCloudflarePublicHtml(body, origin) {
  const bytes = Buffer.from(body)
  let html = bytes.toString('utf8')
  const normalizations = []
  const webmcpBridge = `<script type="module" async fetchpriority="low" src="${new URL('/.webmcp/bridge.js', origin).href}" data-packs="c2pa,mcp-server-client"></script>`
  const bridgeStart = html.indexOf(webmcpBridge)
  if (bridgeStart >= 0 && html.indexOf(webmcpBridge, bridgeStart + webmcpBridge.length) < 0
    && bridgeStart < html.indexOf('<link rel="manifest"')) {
    html = `${html.slice(0, bridgeStart)}${html.slice(bridgeStart + webmcpBridge.length)}`
    normalizations.push('cloudflare-webmcp-bridge/v1')
  }

  const scriptStart = html.lastIndexOf('<script>')
  if (scriptStart < 0) return { body: Buffer.from(html), normalization: normalizations }
  const scriptEnd = html.indexOf('</script>', scriptStart)
  const suffixStart = scriptEnd + '</script>'.length
  if (scriptEnd < 0 || !/^\s*<\/body>\s*(?:<\/html>\s*)?$/iu.test(html.slice(suffixStart))) {
    return { body: Buffer.from(html), normalization: normalizations }
  }

  const script = html.slice(scriptStart + '<script>'.length, scriptEnd)
  const matches = [...script.matchAll(CLOUDFLARE_JSD_PARAMS)]
  if (matches.length !== 1 || script.replace(CLOUDFLARE_JSD_PARAMS, "window.__CF$cv$params={r:'',t:''};")
    !== CLOUDFLARE_JSD_CANONICAL_SCRIPT) {
    return { body: Buffer.from(html), normalization: normalizations }
  }

  normalizations.push('cloudflare-js-detection/v1')
  return {
    body: Buffer.from(`${html.slice(0, scriptStart)}${html.slice(suffixStart)}`),
    normalization: normalizations,
  }
}

const required = name => {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function normalizeOrigin(value, id) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash) throw new Error(`${id} must be an HTTPS origin`)
  return { id, origin: url.origin }
}

function loadArtifact(rootValue, sourceRevision) {
  const root = path.resolve(rootValue)
  const manifestBytes = fs.readFileSync(path.join(root, 'agentic-base-route.json'))
  const manifest = JSON.parse(manifestBytes)
  if (manifest.schema !== 'agentic-graph/base-demo-artifact/v1'
    || manifest.route !== '/agentic-base/'
    || manifest.sourceRepository !== 'https://github.com/huijoohwee/agentic-base'
    || manifest.sourceRevision !== sourceRevision
    || !Array.isArray(manifest.files)
    || !Number.isSafeInteger(manifest.totalBytes)
    || manifest.totalBytes < 1 || manifest.totalBytes >= 512_000
    || !HASH.test(String(manifest.artifactDigest || ''))) {
    throw new Error('Base route manifest does not match the pinned source or size budget')
  }

  const files = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))
  const seen = new Set()
  const contents = []
  let total = manifestBytes.length
  const artifact = createHash('sha256')
  for (const file of files) {
    if (typeof file.path !== 'string' || file.path.startsWith('/')
      || file.path.split('/').some(part => !part || part === '.' || part === '..')
      || seen.has(file.path) || !HASH.test(String(file.sha256 || ''))) {
      throw new Error('Unsafe Base route manifest entry')
    }
    const target = path.resolve(root, file.path)
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe Base route manifest path')
    const bytes = fs.readFileSync(target)
    if (digest(bytes) !== file.sha256) throw new Error(`Local Base asset digest drifted: ${file.path}`)
    seen.add(file.path)
    total += bytes.length
    artifact.update(`${file.path}\0`).update(bytes)
    contents.push([file.path, bytes])
  }
  if (total !== manifest.totalBytes || artifact.digest('hex') !== manifest.artifactDigest) {
    throw new Error('Local Base artifact digest drifted')
  }
  for (const requiredPath of ['index.html', 'app.mjs', 'styles.css', 'manifest.webmanifest', 'sw.js', 'src/index.mjs']) {
    if (!seen.has(requiredPath)) throw new Error(`Required Base asset missing: ${requiredPath}`)
  }
  contents.push(['agentic-base-route.json', manifestBytes])
  return { manifest, contents }
}

async function fetchObservation(target, pathname, deadline) {
  const remaining = deadline === null ? REQUEST_TIMEOUT_MS : deadline - Date.now()
  if (remaining <= 0) throw new RouteObservationError('public convergence deadline expired')
  let response
  try {
    response = await fetch(`${target.origin}${pathname}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
    })
  } catch (error) {
    throw new RouteObservationError(`${target.id} request failed at ${pathname}: ${error.message}`)
  }
  let body
  try {
    body = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    throw new RouteObservationError(`${target.id} response failed at ${pathname}: ${error.message}`)
  }
  return { response, body, bodyDigest: digest(body) }
}

async function verifyOrigin(target, contents, sourceRevision, deadline = null) {
  const redirect = await fetchObservation(target, '/agentic-base', deadline)
  const locationHeader = String(redirect.response.headers.get('location') || '')
  let location
  try { location = new URL(locationHeader, target.origin) } catch {
    throw new RouteObservationError(`${target.id} /agentic-base returned an invalid redirect`)
  }
  if (redirect.response.status !== 301 || location.origin !== target.origin
    || location.pathname !== '/agentic-base/' || location.search || location.hash) {
    throw new RouteObservationError(`${target.id} /agentic-base did not redirect to its slash route (HTTP ${redirect.response.status})`)
  }

  const routes = []
  for (const [relative, expected] of contents) {
    const pathname = relative === 'index.html' ? '/agentic-base/' : `/agentic-base/${relative}`
    const observed = await fetchObservation(target, pathname, deadline)
    const normalized = target.id === 'public' && relative === 'index.html'
      ? normalizeCloudflarePublicHtml(observed.body, target.origin)
      : { body: observed.body, normalization: [] }
    const canonicalBodyDigest = digest(normalized.body)
    if (observed.response.status !== 200 || canonicalBodyDigest !== digest(expected)) {
      throw new RouteObservationError(
        `${target.id} Base asset drifted: ${relative} (HTTP ${observed.response.status}; raw SHA-256 ${observed.bodyDigest}; canonical SHA-256 ${canonicalBodyDigest})`,
      )
    }
    if (relative === 'index.html'
      && (!normalized.body.includes(Buffer.from('agentic-base-source-revision'))
        || !normalized.body.includes(Buffer.from(sourceRevision)))) {
      throw new RouteObservationError(`${target.id} app shell does not identify the pinned Base revision`)
    }
    routes.push({
      path: pathname,
      status: observed.response.status,
      bodyDigest: observed.bodyDigest,
      canonicalBodyDigest,
      normalization: normalized.normalization.length > 0 ? normalized.normalization : null,
      byteLength: observed.body.length,
    })
  }
  return { id: target.id, origin: target.origin, redirectStatus: redirect.response.status, routes }
}

async function verifyPublicWithBoundedRetry(target, contents, sourceRevision) {
  const deadline = Date.now() + PUBLIC_CONVERGENCE_MS
  let attempt = 0
  let lastError
  while (Date.now() < deadline) {
    attempt += 1
    try {
      const verified = await verifyOrigin(target, contents, sourceRevision, deadline)
      process.stderr.write(`Public Agentic Base route converged after ${attempt} check(s).\n`)
      return verified
    } catch (error) {
      if (!(error instanceof RouteObservationError)) throw error
      lastError = error
      process.stderr.write(`Public Agentic Base route check ${attempt} is still converging: ${error.message}\n`)
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await new Promise(resolve => setTimeout(resolve, Math.min(PUBLIC_RETRY_MS, remaining)))
    }
  }
  throw new Error(`Public Agentic Base route did not converge within ${PUBLIC_CONVERGENCE_MS} ms after ${attempt} check(s): ${lastError?.message || 'deadline expired'}`)
}

async function main() {
  const sourceRevision = required('BASE_SOURCE_SHA')
  const releaseRevision = required('RELEASE_SHA')
  const candidateDigest = required('CANDIDATE_DIGEST')
  const lifecycleCandidateDigest = required('LIFECYCLE_CANDIDATE_DIGEST')
  const deploymentId = required('DEPLOYMENT_ID')
  const previousDeploymentId = required('PREVIOUS_DEPLOYMENT_ID')
  const evidencePath = required('BASE_ROUTE_EVIDENCE')
  if (!REVISION.test(sourceRevision) || !REVISION.test(releaseRevision)
    || !HASH.test(candidateDigest) || !HASH.test(lifecycleCandidateDigest)
    || deploymentId === previousDeploymentId) throw new Error('Invalid Base route release identity')

  const { manifest, contents } = loadArtifact(required('BASE_ROUTE_ARTIFACT_ROOT'), sourceRevision)
  const targets = [
    normalizeOrigin(required('BASE_ROUTE_CANDIDATE_ORIGIN'), 'immutable'),
    normalizeOrigin(required('BASE_ROUTE_STABLE_ORIGIN'), 'stable-pages'),
    normalizeOrigin(required('BASE_ROUTE_PUBLIC_ORIGIN'), 'public'),
  ]
  if (new Set(targets.map(target => target.origin)).size !== targets.length) {
    throw new Error('Base route origins must be distinct')
  }

  const verified = []
  for (const target of targets.slice(0, 2)) verified.push(await verifyOrigin(target, contents, sourceRevision))
  verified.push(await verifyPublicWithBoundedRetry(targets[2], contents, sourceRevision))

  const receipt = {
    schema: 'agentic-graph-agentic-base-route-promotion/v1',
    status: 'verified',
    scope: 'agentic-base-route',
    route: '/agentic-base/',
    sourceRevision: releaseRevision,
    baseSourceRevision: sourceRevision,
    artifactDigest: manifest.artifactDigest,
    deploymentId,
    previousDeploymentId,
    candidateDigest,
    lifecycleCandidateDigest,
    origins: verified,
    verifiedAt: new Date().toISOString(),
  }
  fs.writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}
