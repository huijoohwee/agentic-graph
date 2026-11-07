import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_AGENTIC_BASE_DEMO_BYTES = 500 * 1024
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const pinPath = path.join(scriptDirectory, 'agentic-base-demo-source.json')

const git = (root, args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(label + ' must contain exactly one ' + JSON.stringify(before))
  return source.replace(before, after)
}

async function listModules(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name
    const absolute = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Base source modules cannot contain symlinks: ' + relative)
    if (entry.isDirectory()) files.push(...await listModules(absolute, relative))
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(relative)
  }
  return files
}

export function resolveAgenticBaseDemoSourceRoot(graphRoot) {
  const configured = String(process.env.AGENTIC_BASE_DEMO_SOURCE_ROOT || '').trim()
  if (configured) return path.resolve(configured)
  const commonDirectory = git(graphRoot, ['rev-parse', '--git-common-dir'])
  const graphRepository = path.dirname(path.resolve(graphRoot, commonDirectory))
  return path.resolve(graphRepository, '..', 'agentic-base')
}

export async function createAgenticBaseDemoArtifact({
  graphRoot = path.resolve(scriptDirectory, '..'),
  sourceRoot = resolveAgenticBaseDemoSourceRoot(graphRoot),
  sourcePin = null,
} = {}) {
  const pin = sourcePin || JSON.parse(await fs.readFile(pinPath, 'utf8'))
  if (pin.schema !== 'agentic-graph/base-demo-source/v1'
    || pin.repository !== 'https://github.com/huijoohwee/agentic-base'
    || !/^[0-9a-f]{40}$/.test(String(pin.revision || ''))) {
    throw new Error('Base demo source pin is invalid')
  }

  const root = path.resolve(sourceRoot)
  const sourceRevision = git(root, ['rev-parse', 'HEAD'])
  if (sourceRevision !== pin.revision) {
    throw new Error('Base demo source revision mismatch: expected ' + pin.revision + ', observed ' + sourceRevision)
  }
  if (git(root, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Base demo source checkout must be clean')
  }

  const modulePaths = await listModules(path.join(root, 'src'))
  if (!modulePaths.includes('index.mjs')) throw new Error('Base source is missing src/index.mjs')
  const outputs = new Map()
  const add = (relativePath, body) => {
    if (outputs.has(relativePath)) throw new Error('Duplicate Base demo artifact path: ' + relativePath)
    outputs.set(relativePath, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'))
  }
  const readText = async relativePath => fs.readFile(path.join(root, relativePath), 'utf8')

  let html = await readText('demo/index.html')
  html = replaceOnce(html, '/demo/manifest.webmanifest', './manifest.webmanifest', 'demo/index.html')
  html = replaceOnce(html, '/demo/styles.css?v=5', './styles.css?v=5', 'demo/index.html')
  html = replaceOnce(html, '/demo/app.mjs?v=5', './app.mjs?v=5', 'demo/index.html')
  html = replaceOnce(
    html,
    '    <title>agentic-base local demo</title>',
    '    <meta name="agentic-base-source-revision" content="' + sourceRevision + '">' + '\n'
      + '    <title>agentic-base local demo</title>',
    'demo/index.html',
  )

  let app = await readText('demo/app.mjs')
  app = replaceOnce(app, "'../src/index.mjs'", "'./src/index.mjs'", 'demo/app.mjs')
  app = replaceOnce(app, "register('/sw.js')", "register('./sw.js')", 'demo/app.mjs')

  const manifest = JSON.parse(await readText('demo/manifest.webmanifest'))
  if (manifest.start_url !== '/demo/' || manifest.scope !== '/demo/') {
    throw new Error('Base demo manifest path contract changed')
  }
  manifest.start_url = './'
  manifest.scope = './'

  let serviceWorker = await readText('sw.js')
  serviceWorker = replaceOnce(
    serviceWorker,
    "const CACHE = 'agentic-base-app-v5';",
    "const CACHE = 'agentic-base-route-" + sourceRevision + "';",
    'sw.js',
  )
  const assetBlock = /const ASSETS = \[[\s\S]*?\];/u
  if (!assetBlock.test(serviceWorker)) throw new Error('Base service worker asset list contract changed')
  const assets = [
    './',
    './index.html',
    './app.mjs?v=5',
    './styles.css?v=5',
    './manifest.webmanifest',
    ...modulePaths.map(relativePath => './src/' + relativePath),
  ]
  const nextAssetBlock = 'const ASSETS = [\n'
    + assets.map(asset => '  ' + JSON.stringify(asset)).join(',\n')
    + '\n];'
  serviceWorker = serviceWorker.replace(assetBlock, nextAssetBlock)

  add('index.html', html)
  add('app.mjs', app)
  add('styles.css', await fs.readFile(path.join(root, 'demo/styles.css')))
  add('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n')
  add('sw.js', serviceWorker)
  add('LICENSE', await fs.readFile(path.join(root, 'LICENSE')))
  for (const relativePath of modulePaths) {
    add('src/' + relativePath, await fs.readFile(path.join(root, 'src', relativePath)))
  }

  for (const [relativePath, body] of outputs) {
    if (relativePath.endsWith('.html') || relativePath.endsWith('.mjs')
      || relativePath.endsWith('.webmanifest') || relativePath.endsWith('.css')
      || relativePath === 'sw.js') {
      const text = body.toString('utf8')
      if (/(?:^|["'])\/(?:demo|src)(?:\/|["'?#])|(?:^|["'])\/sw\.js(?:["'?#]|$)/u.test(text)) {
        throw new Error('Base demo artifact contains an origin-root path: ' + relativePath)
      }
    }
  }

  const fileEntries = [...outputs].sort(([left], [right]) => left.localeCompare(right))
  const artifactHash = createHash('sha256')
  for (const [relativePath, body] of fileEntries) {
    artifactHash.update(relativePath + '\0')
    artifactHash.update(body)
  }
  const artifactDigest = artifactHash.digest('hex')
  const manifestFiles = fileEntries.map(([relativePath, body]) => ({
    path: relativePath,
    sha256: digest(body),
  }))
  let totalBytes = fileEntries.reduce((sum, [, body]) => sum + body.byteLength, 0)
  let routeManifestBody = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    routeManifestBody = JSON.stringify({
      schema: 'agentic-graph/base-demo-artifact/v1',
      route: '/agentic-base/',
      sourceRepository: pin.repository,
      sourceRevision,
      artifactDigest,
      totalBytes,
      files: manifestFiles,
    }, null, 2) + '\n'
    const nextTotal = fileEntries.reduce((sum, [, body]) => sum + body.byteLength, 0)
      + Buffer.byteLength(routeManifestBody)
    if (nextTotal === totalBytes) break
    totalBytes = nextTotal
    if (attempt === 2) throw new Error('Base demo artifact size accounting did not stabilize')
  }
  if (totalBytes >= MAX_AGENTIC_BASE_DEMO_BYTES) {
    throw new Error('Base demo artifact exceeds the 500 KiB route budget: ' + totalBytes)
  }
  add('agentic-base-route.json', routeManifestBody)
  return { files: outputs, sourceRevision, artifactDigest, totalBytes }
}
