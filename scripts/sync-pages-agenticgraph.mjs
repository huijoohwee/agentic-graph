import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { agentReadyHomepageLinkHeaderValue, buildAgentReadyStaticFiles } from '../cloudflare/pages/agenticgraph-agent-ready.mjs'
import { buildAgenticGraphRedirects } from './production-pages-routing.mjs'
import { buildProductionRuntimeReadiness, findRuntimeReadinessPathsNeedingUpdate, productionRuntimeReadinessHeaderLines } from './production-runtime-readiness-build.mjs'
import {
  XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
  XR_V2_MIRRORED_IGNORE_RELATIVE_PATH,
  XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS,
} from './xr-v2/production-publish-contract.mjs'
const checkMode = process.argv.includes('--check')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const agenticgraphRoot = path.resolve(__dirname, '..')
const githubRoot = path.resolve(agenticgraphRoot, '..')
const mirrorRoot = path.resolve(process.env.AGENTICGRAPH_PUBLISH_REPOSITORY_ROOT || path.resolve(githubRoot, 'huijoohwee'))
const distDir = path.resolve(agenticgraphRoot, 'canvas', 'dist')
const targetDir = path.resolve(mirrorRoot, 'content', 'agenticgraph')
const publicRouteDir = path.resolve(mirrorRoot, 'agenticgraph')
const liveCanvasHeroMarkdownSource = path.resolve(agenticgraphRoot, 'docs', 'documents', 'agenticgraph-live-canvas-hero.md')
const grphSharedRoot = path.resolve(agenticgraphRoot, 'grph-shared')
const redirectsPath = path.resolve(mirrorRoot, '_redirects')
const headersPath = path.resolve(mirrorRoot, '_headers')
const sourceRevision = String(process.env.AGENTICGRAPH_SOURCE_REVISION || execFileSync(
  'git', ['rev-parse', 'HEAD'], { cwd: agenticgraphRoot, encoding: 'utf8' },
)).trim()
if (!/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error('AgenticGraph source revision must be an exact lowercase 40-character SHA')
const agentReadyFunctionSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready.mjs'), agentReadyFunctionTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', '[[path]].js')
const webMcpHtmlInjectionSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'webmcp-html-injection.mjs'), webMcpHtmlInjectionTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'webmcp-html-injection.mjs')
const agentReadyFeatureSource = filename => path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'agent-ready', filename)
const agentReadyFeatureTarget = filename => path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'agent-ready', filename)
const xrSceneMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'three', 'xrSceneMcpContract.mjs')
const xrSceneMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'three', 'xrSceneMcpContract.mjs')
const xrAnimationMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'three', 'xrAnimationMcpContract.mjs')
const xrAnimationMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'three', 'xrAnimationMcpContract.mjs')
const motionControlMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'three', 'motionControlMcpContract.mjs')
const motionControlMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'three', 'motionControlMcpContract.mjs')
const gameModeMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'game-fps', 'gameModeMcpContract.mjs')
const gameModeMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'game-fps', 'gameModeMcpContract.mjs')
const flightSimMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'game-flight-sim', 'flightSimMcpContract.mjs')
const flightSimMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'game-flight-sim', 'flightSimMcpContract.mjs')
const citySimMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'game-city-sim', 'citySimMcpContract.mjs')
const citySimMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'game-city-sim', 'citySimMcpContract.mjs')
const immersiveMediaMcpContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'immersive-media', 'immersiveMediaMcpContract.mjs')
const immersiveMediaMcpContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'immersive-media', 'immersiveMediaMcpContract.mjs')
const richMediaTextMarkdownContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'rich-media', 'richMediaTextMarkdownContract.mjs')
const richMediaTextMarkdownContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'rich-media', 'richMediaTextMarkdownContract.mjs')
const groupPanelContractSource = path.resolve(agenticgraphRoot, 'canvas', 'src', 'features', 'group-panel', 'groupPanelContract.mjs')
const groupPanelContractTarget = path.resolve(mirrorRoot, 'canvas', 'src', 'features', 'group-panel', 'groupPanelContract.mjs')
const youtubeTranscriptFunctionSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'youtube-transcript.mjs')
const youtubeTranscriptFunctionTarget = path.resolve(mirrorRoot, 'functions', '__youtube_transcript.js')
const videoFrameFunctionSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'video-frame.mjs')
const videoFrameFunctionTarget = path.resolve(mirrorRoot, 'functions', '__video_frame.js')
const agentReadyDocRouteTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'doc', '[[path]].js')
const agentReadyDefaultDocRouteTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'doc-default', '[[path]].js')
const agentReadyShareRouteTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'share', '[[path]].js')
const agentReadySharedSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready-shared.mjs')
const agentReadyDiscoverySource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready-discovery.mjs')
const agentReadyCommerceSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready-commerce.mjs')
const agentReadyAppShellSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready-app-shell.mjs')
const agentReadySharedTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'agenticgraph-agent-ready-shared.mjs')
const agentReadyDiscoveryTarget = path.resolve(
  mirrorRoot,
  'functions',
  'agenticgraph',
  'agenticgraph-agent-ready-discovery.mjs',
)
const agentReadyCommerceTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'agenticgraph-agent-ready-commerce.mjs')
const agentReadyAppShellTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph', 'agenticgraph-agent-ready-app-shell.mjs')
const agentReadyCommerceX402RouteTarget = path.resolve(mirrorRoot, 'functions', 'api', 'payments', 'commerce', 'x402.js')
const agentReadyCommerceX402RouteBody = `import { buildAgenticGraphX402PaymentRequiredResponse } from "../../../agenticgraph/agenticgraph-agent-ready-commerce.mjs";\n\nexport async function onRequest(context) {\n  return buildAgenticGraphX402PaymentRequiredResponse(context.request, context.env || {});\n}\n`
const agentReadyRuntimeSharedEntries = [
  'dist/hash/signature.js',
  'dist/payments/agenticCommerceSsot.js',
]
const semanticKeyContractSource = path.resolve(agenticgraphRoot, 'contracts', 'semantic-key.js')
const semanticKeyContractTarget = path.resolve(mirrorRoot, 'contracts', 'semantic-key.js')
const videoFrameSharedProviderSource = path.resolve(agenticgraphRoot, 'grph-shared', 'dist', 'rich-media', 'providers.js')
const videoFrameSharedProviderTarget = path.resolve(mirrorRoot, 'grph-shared', 'dist', 'rich-media', 'providers.js')
const rootAgentReadySharedTarget = path.resolve(mirrorRoot, 'functions', 'agenticgraph-agent-ready-shared.mjs')
const rootAgentReadyFunctionSource = path.resolve(agenticgraphRoot, 'cloudflare', 'pages', 'root-agent-ready-index.mjs')
const rootAgentReadyFunctionTarget = path.resolve(mirrorRoot, 'functions', 'index.js')
const agentReadyToolContractSource = path.resolve(
  agenticgraphRoot,
  'canvas',
  'src',
  'features',
  'agent-ready',
  'agenticgraphAgentReadyToolContract.mjs',
)
const agentReadyToolContractTarget = path.resolve(
  mirrorRoot,
  'canvas',
  'src',
  'features',
  'agent-ready',
  'agenticgraphAgentReadyToolContract.mjs',
)
const agentReadyPromptContractSource = path.resolve(
  agenticgraphRoot,
  'canvas',
  'src',
  'features',
  'agent-ready',
  'agenticgraphAgentReadyPromptContract.mjs',
)
const agentReadyPromptContractTarget = path.resolve(
  mirrorRoot,
  'canvas',
  'src',
  'features',
  'agent-ready',
  'agenticgraphAgentReadyPromptContract.mjs',
)
const agentReadyResourceContractSource = path.resolve(
  agenticgraphRoot,
  'canvas',
  'src',
  'features',
  'agent-ready',
  'agenticgraphAgentReadyResourceContract.mjs',
)
const agentReadyResourceContractTarget = path.resolve(
  mirrorRoot,
  'canvas',
  'src',
  'features',
  'agent-ready',
  'agenticgraphAgentReadyResourceContract.mjs',
)
const mcpAppsReadyContractSource = agentReadyFeatureSource('mcpAppsReadyContract.mjs')
const mcpAppsReadyContractTarget = agentReadyFeatureTarget('mcpAppsReadyContract.mjs')
const vdeoxplnContractSource = agentReadyFeatureSource('agenticgraphVdeoxplnContract.mjs'), vdeoxplnContractTarget = agentReadyFeatureTarget('agenticgraphVdeoxplnContract.mjs')
const localMcpToolNamesSource = agentReadyFeatureSource('agenticgraphLocalMcpToolNames.mjs'), localMcpToolNamesTarget = agentReadyFeatureTarget('agenticgraphLocalMcpToolNames.mjs'), probeTreeContractSource = agentReadyFeatureSource('probeTreeContract.mjs'), probeTreeContractTarget = agentReadyFeatureTarget('probeTreeContract.mjs')
const vdeoxplnRoutingToolsSource = agentReadyFeatureSource('agenticgraphVdeoxplnRoutingTools.mjs'), vdeoxplnRoutingToolsTarget = agentReadyFeatureTarget('agenticgraphVdeoxplnRoutingTools.mjs')
const sharedDocumentStructureInspectionSource = agentReadyFeatureSource('sharedDocumentStructureInspection.mjs')
const sharedDocumentStructureInspectionTarget = agentReadyFeatureTarget('sharedDocumentStructureInspection.mjs')
const agentSurfaceInspectionSource = agentReadyFeatureSource('agentSurfaceInspection.mjs')
const agentSurfaceInspectionTarget = agentReadyFeatureTarget('agentSurfaceInspection.mjs')
const agentReadyBrowserRuntimeFilenames = [
  'browserFunctionSource.mjs',
  'publishedToolExecutors.mjs',
  'webMcpLifecycle.mjs',
  'webMcpLifecycleBrowserSource.mjs',
]
const storageEngineMcpContractSource = path.resolve(
  agenticgraphRoot,
  'canvas',
  'src',
  'lib',
  'storage',
  'agenticgraphStorageEngineMcpContract.mjs',
)
const storageEngineMcpContractTarget = path.resolve(
  mirrorRoot,
  'canvas',
  'src',
  'lib',
  'storage',
  'agenticgraphStorageEngineMcpContract.mjs',
)
const publishedDocShareTokenSource = path.resolve(
  agenticgraphRoot,
  'canvas',
  'src',
  'features',
  'canvas',
  'canvasDocShareToken.mjs',
)
const publishedDocShareTokenTarget = path.resolve(
  mirrorRoot,
  'canvas',
  'src',
  'features',
  'canvas',
  'canvasDocShareToken.mjs',
)
const agenticgraphStorageSyncContractSource = path.resolve(
  agenticgraphRoot,
  'canvas',
  'src',
  'lib',
  'storage',
  'agenticgraphStorageSyncContract.ts',
)
const agenticgraphStorageSyncContractTarget = path.resolve(
  mirrorRoot,
  'canvas',
  'src',
  'lib',
  'storage',
  'agenticgraphStorageSyncContract.ts',
)
const sharedD1Source = path.resolve(agenticgraphRoot, 'cloudflare', 'workers', 'shared', 'd1.ts')
const sharedD1Target = path.resolve(mirrorRoot, 'cloudflare', 'workers', 'shared', 'd1.ts')
const sharedPublishedDocSource = path.resolve(agenticgraphRoot, 'cloudflare', 'workers', 'shared', 'publishedDoc.ts')
const sharedPublishedDocTarget = path.resolve(mirrorRoot, 'cloudflare', 'workers', 'shared', 'publishedDoc.ts')
const importedServiceWorkerRootFiles = new Set(['agenticgraph-chat-stream-sw.js', 'agenticgraph-service-worker-revision.js']); const publicManagedRootFiles = new Set([
  'favicon.svg',
  'index.html',
  'agenticgraph-live-canvas-hero.md',
  'llms.txt',
  'manifest.webmanifest',
  'settings-flow.json',
  'sw.js',
  ...importedServiceWorkerRootFiles,
])
const xrV2PublishRuntimeRelativePathSet = new Set(XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS)
const obsoleteLegacyMirrorDir = path.resolve(mirrorRoot, '__' + 'repo_file')
const joinRel = (...parts) => parts.join('/')
const joinToken = (...parts) => parts.join('')
const joinKebab = (...parts) => parts.join('-')
const obsoleteGeneratedMirrorFiles = new Set([
  'index.html',
  ...XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
  joinRel('agenticgraph', '.well-known', 'runtime-readiness.json'),
  joinRel('canvas', 'src', 'features', 'agent-ready', joinToken('agenticgraph', 'Skill', 'Pack', 'Contract.mjs')),
  joinRel('canvas', 'src', 'features', 'chat', joinToken('agenticgraph', 'Skill', 'Pack', 'ChatArtifacts.ts')),
  joinRel('canvas', 'src', 'features', 'panels', 'views', joinToken('skill', 'Pack', 'McpApiDocs.ts')),
  joinRel('docs', 'documents', joinKebab('agenticgraph', 'skill', 'packs', 'prd', 'tad.md')),
  joinRel('scripts', joinKebab('check', 'skill', 'packs.mjs')),
])
const blockedRelativeRoots = new Set([
  'cesium',
  'demo',
  'examples',
  'vendor/mermaid',
])
const blockedRelativeFiles = new Set([
  '_headers',
  '_redirects',
  'unicorn-investors-test.json',
])
const preservedRelativeRoots = new Set([
  'imports',
])
const GENERATED_AGENT_HEADERS_START = '# BEGIN agenticgraph generated agent-ready headers'
const GENERATED_AGENT_HEADERS_END = '# END agenticgraph generated agent-ready headers'
const GENERATED_APP_SHELL_HEADERS_START = '# BEGIN agenticgraph generated app-shell cache headers'
const GENERATED_APP_SHELL_HEADERS_END = '# END agenticgraph generated app-shell cache headers'
const GENERATED_AGENT_HOMEPAGE_HEADERS_START = '# BEGIN agenticgraph generated homepage discovery headers'
const GENERATED_AGENT_HOMEPAGE_HEADERS_END = '# END agenticgraph generated homepage discovery headers'
const GENERATED_XR_RUNTIME_HEADERS_START = '# BEGIN agenticgraph generated XR runtime permissions headers'
const GENERATED_XR_RUNTIME_HEADERS_END = '# END agenticgraph generated XR runtime permissions headers'
const XR_RUNTIME_PERMISSIONS_POLICY = 'accelerometer=(self), autoplay=(self), camera=(self), clipboard-read=(), clipboard-write=(), display-capture=(self), geolocation=(), gyroscope=(self), magnetometer=(self), microphone=(self), payment=(), usb=(), xr-spatial-tracking=(self)'
const agentReadyDocRouteBody = `import { onRequest as onAgenticGraphAgentReadyRequest } from "../[[path]].js";

export async function onRequest(context) {
  return onAgenticGraphAgentReadyRequest(context);
}
`

const existsDir = async (dir) => {
  try {
    const stat = await fs.stat(dir)
    return stat.isDirectory()
  } catch {
    return false
  }
}

const toPosixRel = (rootDir, absolutePath) => path.relative(rootDir, absolutePath).split(path.sep).filter(Boolean).join('/')

const localJsImportSpecifiers = (body) => {
  const specifiers = []
  const importRegex = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["'](\.[^"']+\.js)["']|import\(\s*["'](\.[^"']+\.js)["']\s*\)/g
  for (const match of body.matchAll(importRegex)) {
    specifiers.push(match[1] || match[2])
  }
  return specifiers
}

const collectGrphSharedRuntimeCopies = async (entryRelativePaths) => {
  const seen = new Set()
  const queue = [...entryRelativePaths]
  while (queue.length > 0) {
    const rel = queue.shift()
    if (!rel || seen.has(rel)) continue
    if (!rel.startsWith('dist/') || !rel.endsWith('.js')) {
      throw new Error(`Shared runtime entry must be a dist JS file: ${rel}`)
    }
    seen.add(rel)
    const sourcePath = path.resolve(grphSharedRoot, rel)
    const sourceBody = await fs.readFile(sourcePath, 'utf8')
    for (const specifier of localJsImportSpecifiers(sourceBody)) {
      const dependencyPath = path.resolve(path.dirname(sourcePath), specifier)
      const dependencyRel = toPosixRel(grphSharedRoot, dependencyPath)
      if (dependencyRel.startsWith('../') || !dependencyRel.startsWith('dist/') || !dependencyRel.endsWith('.js')) {
        throw new Error(`Unsupported grph-shared runtime import ${specifier} from ${rel}`)
      }
      if (!seen.has(dependencyRel)) queue.push(dependencyRel)
    }
  }
  return [...seen]
    .sort((a, b) => a.localeCompare(b))
    .map(rel => [
      path.resolve(grphSharedRoot, rel),
      path.resolve(mirrorRoot, 'grph-shared', rel),
    ])
}

const isAllowedRelativePath = (rel) => {
  if (!rel) return true
  if (rel === XR_V2_MIRRORED_IGNORE_RELATIVE_PATH) return false
  if (blockedRelativeFiles.has(rel)) return false
  for (const blocked of blockedRelativeRoots) {
    if (rel === blocked || rel.startsWith(`${blocked}/`)) return false
  }
  return true
}

const isPreservedRelativePath = (rel) => {
  if (!rel) return false
  for (const preserved of preservedRelativeRoots) {
    if (rel === preserved || rel.startsWith(`${preserved}/`)) return true
  }
  return false
}

const isPublicManagedRelativePath = rel => Boolean(rel) && (rel.startsWith('assets/') || publicManagedRootFiles.has(rel))
const isBrowserRuntimeArtifactRelativePath = rel => isPublicManagedRelativePath(rel) || importedServiceWorkerRootFiles.has(rel) || xrV2PublishRuntimeRelativePathSet.has(rel) || /^workbox-[A-Za-z0-9_-]+\.js$/.test(rel)

const listFiles = async (rootDir) => {
  const out = []
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.resolve(dir, entry.name)
      const rel = toPosixRel(rootDir, abs)
      if (!isAllowedRelativePath(rel)) continue
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (entry.isFile()) out.push(rel)
    }
  }
  await walk(rootDir)
  out.sort((a, b) => a.localeCompare(b))
  return out
}

const listAllFiles = async (rootDir) => {
  const out = []
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.resolve(dir, entry.name)
      const rel = toPosixRel(rootDir, abs)
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (entry.isFile()) out.push(rel)
    }
  }
  await walk(rootDir)
  return out
}

const fileHash = async (filePath) => {
  const buf = await fs.readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

const textHash = (value) => createHash('sha256').update(value).digest('hex')

const readPublishContent = async (src, rel) => {
  const buf = await fs.readFile(src)
  return buf
}

const publishContentHash = async (src, rel) => {
  const buf = await readPublishContent(src, rel)
  return createHash('sha256').update(buf).digest('hex')
}

const fileNeedsUpdate = async (src, dest, rel) => {
  try {
    const [srcHash, dstHash] = await Promise.all([publishContentHash(src, rel), fileHash(dest)])
    return srcHash !== dstHash
  } catch {
    return true
  }
}

const plainFileNeedsUpdate = async (src, dest) => {
  try {
    const [srcHash, dstHash] = await Promise.all([fileHash(src), fileHash(dest)])
    return srcHash !== dstHash
  } catch {
    return true
  }
}
const textFileNeedsUpdate = async (body, dest) => {
  try {
    return textHash(body) !== await fileHash(dest)
  } catch {
    return true
  }
}
const copyIfChanged = async (src, dest, rel) => {
  const needsUpdate = await fileNeedsUpdate(src, dest, rel)
  if (!needsUpdate) return false
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, await readPublishContent(src, rel))
  return true
}

const copyPlainFile = async (src, dest) => fs.mkdir(path.dirname(dest), { recursive: true }).then(() => fs.copyFile(src, dest))
const writeTextFile = async (dest, body) => fs.mkdir(path.dirname(dest), { recursive: true }).then(() => fs.writeFile(dest, body, 'utf8'))
const fileExists = async (filePath) => {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

const localModuleSpecifiers = source => [
  ...source.matchAll(/(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?['\"](\.{1,2}\/[^'\"]+)['\"]/g),
  ...source.matchAll(/\bimport\s*\(\s*['\"](\.{1,2}\/[^'\"]+)['\"]\s*\)/g),
].map(([, specifier]) => specifier)

const collectLocalModuleClosureCopies = async entrySources => {
  const queue = [...entrySources]
  const visited = new Set(entrySources)
  const copies = []
  while (queue.length > 0) {
    const importer = queue.shift()
    const source = await fs.readFile(importer, 'utf8')
    for (const specifier of localModuleSpecifiers(source)) {
      const sourcePath = path.resolve(path.dirname(importer), specifier)
      const relativePath = path.relative(agenticgraphRoot, sourcePath)
      if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error(`Local module import escapes the AgenticGraph source root: ${specifier}`)
      }
      if (!await fileExists(sourcePath)) {
        throw new Error(`Missing local module import ${specifier} from ${path.relative(agenticgraphRoot, importer)}`)
      }
      if (visited.has(sourcePath)) continue
      visited.add(sourcePath)
      queue.push(sourcePath)
      copies.push([sourcePath, path.resolve(mirrorRoot, relativePath)])
    }
  }
  return copies.sort(([left], [right]) => left.localeCompare(right))
}

const agentReadyRuntimeCopies = [
  [agentReadyCommerceSource, agentReadyCommerceTarget], [agentReadyAppShellSource, agentReadyAppShellTarget], [webMcpHtmlInjectionSource, webMcpHtmlInjectionTarget], [semanticKeyContractSource, semanticKeyContractTarget],
  [xrSceneMcpContractSource, xrSceneMcpContractTarget], [xrAnimationMcpContractSource, xrAnimationMcpContractTarget], [motionControlMcpContractSource, motionControlMcpContractTarget], [gameModeMcpContractSource, gameModeMcpContractTarget], [flightSimMcpContractSource, flightSimMcpContractTarget], [immersiveMediaMcpContractSource, immersiveMediaMcpContractTarget], [citySimMcpContractSource, citySimMcpContractTarget], [path.resolve(agenticgraphRoot, 'canvas/src/features/strybldr/cameraMcpContract.mjs'), path.resolve(mirrorRoot, 'canvas/src/features/strybldr/cameraMcpContract.mjs')],
  [richMediaTextMarkdownContractSource, richMediaTextMarkdownContractTarget],
  [groupPanelContractSource, groupPanelContractTarget],
  [storageEngineMcpContractSource, storageEngineMcpContractTarget],
  ...agentReadyBrowserRuntimeFilenames.map(filename => [agentReadyFeatureSource(filename), agentReadyFeatureTarget(filename)]),
  ...['agenticgraphAgentReadyOutputSchemas.mjs', 'mcpAppsContractText.mjs', 'mcpAppsOnboarding.mjs', 'motionControlAgentReadyContract.mjs', 'gameModeAgentReadyContract.mjs', 'flightSimAgentReadyContract.mjs', 'immersiveMediaAgentReadyContract.mjs', 'citySimAgentReadyContract.mjs', 'storageSyncAgentReadyContract.mjs', 'importUrlAgentReadyContract.mjs', 'probeTreeUserInputRelevance.mjs', 'agenticgraphVdeoxplnRegistryData.mjs', 'agenticgraphApplicationCompositionVdeoxpln.mjs'].map(filename => [agentReadyFeatureSource(filename), agentReadyFeatureTarget(filename)]),
  ...(await collectLocalModuleClosureCopies([agentReadyToolContractSource])),
  ...(await collectGrphSharedRuntimeCopies(agentReadyRuntimeSharedEntries)),
]
const removeEmptyDirs = async (rootDir) => {
  const walk = async (dir) => {
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      await walk(path.resolve(dir, entry.name))
    }
    if (dir === rootDir) return
    const after = await fs.readdir(dir).catch(() => [])
    if (after.length === 0) {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
  await walk(rootDir)
}

const buildAgentReadyHeaders = (existing, artifacts) => {
  const staticArtifactHeaderLines = [
    GENERATED_AGENT_HEADERS_START,
    ...Object.entries(artifacts).flatMap(([rel, artifact]) => [
      `/${rel}`,
      `  Content-Type: ${artifact.contentType}`,
      '  Cache-Control: public, max-age=3600',
    ]),
    GENERATED_AGENT_HEADERS_END,
  ]
  const staticArtifactBlock = staticArtifactHeaderLines.join('\n')
  const staticArtifactBlockRegex = new RegExp(
    `${GENERATED_AGENT_HEADERS_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${GENERATED_AGENT_HEADERS_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  )
  const appShellHeaderLines = [
    GENERATED_APP_SHELL_HEADERS_START,
    ...productionRuntimeReadinessHeaderLines,
    '/content/agenticgraph/index.html',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/content/agenticgraph/manifest.webmanifest',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    '/content/agenticgraph/sw.js',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    ...['/content/agenticgraph/agenticgraph-chat-stream-sw.js', '/agenticgraph/agenticgraph-chat-stream-sw.js', '/content/agenticgraph/agenticgraph-service-worker-revision.js', '/agenticgraph/agenticgraph-service-worker-revision.js'].flatMap(route => [route, '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0']),
    '/agenticgraph',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/agenticgraph/',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/agenticgraph/index.html',
    '  Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0',
    '/agenticgraph/manifest.webmanifest',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    '/agenticgraph/sw.js',
    '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
    GENERATED_APP_SHELL_HEADERS_END,
  ]
  const appShellHeaderBlock = appShellHeaderLines.join('\n')
  const appShellHeaderBlockRegex = new RegExp(
    `${GENERATED_APP_SHELL_HEADERS_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${GENERATED_APP_SHELL_HEADERS_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  )
  const homepageHeaderLines = [
    GENERATED_AGENT_HOMEPAGE_HEADERS_START,
    '/',
    `  Link: ${agentReadyHomepageLinkHeaderValue}`,
    GENERATED_AGENT_HOMEPAGE_HEADERS_END,
  ]
  const homepageHeaderBlock = homepageHeaderLines.join('\n')
  const homepageHeaderBlockRegex = new RegExp(
    `${GENERATED_AGENT_HOMEPAGE_HEADERS_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${GENERATED_AGENT_HOMEPAGE_HEADERS_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  )
  const xrRuntimeHeaderLines = [
    GENERATED_XR_RUNTIME_HEADERS_START,
    ...['/agenticgraph/*', '/content/agenticgraph/*'].flatMap(route => [
      route,
      '  ! Permissions-Policy',
      `  Permissions-Policy: ${XR_RUNTIME_PERMISSIONS_POLICY}`,
    ]),
    GENERATED_XR_RUNTIME_HEADERS_END,
  ]
  const xrRuntimeHeaderBlock = xrRuntimeHeaderLines.join('\n')
  const xrRuntimeHeaderBlockRegex = new RegExp(
    `${GENERATED_XR_RUNTIME_HEADERS_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${GENERATED_XR_RUNTIME_HEADERS_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  )
  let next = existing.replace(
    /^\/content\/agenticgraph\/index\.html\n  Cache-Control: .*?\n(?:\n)?^\/agenticgraph\n  Cache-Control: .*?\n(?:\n)?^\/agenticgraph\/\n  Cache-Control: .*?\n(?:\n)?^\/agenticgraph\/index\.html\n  Cache-Control: .*?\n(?:\n)?/gm,
    '',
  ).replace(
    /^\/content\/agenticgraph\/manifest\.webmanifest\n  Cache-Control: .*?\n(?:\n)?^\/content\/agenticgraph\/sw\.js\n  Cache-Control: .*?\n(?:\n)?^\/agenticgraph\/manifest\.webmanifest\n  Cache-Control: .*?\n(?:\n)?^\/agenticgraph\/sw\.js\n  Cache-Control: .*?\n(?:\n)?/gm,
    '',
  )
  if (staticArtifactBlockRegex.test(next)) {
    next = next.replace(staticArtifactBlockRegex, staticArtifactBlock)
  } else {
    const trimmed = next.endsWith('\n') ? next.trimEnd() : next
    next = `${trimmed}\n\n${staticArtifactBlock}\n`
  }
  if (appShellHeaderBlockRegex.test(next)) {
    next = next.replace(appShellHeaderBlockRegex, appShellHeaderBlock)
  } else {
    const trimmed = next.endsWith('\n') ? next.trimEnd() : next
    next = `${trimmed}\n\n${appShellHeaderBlock}\n`
  }
  if (xrRuntimeHeaderBlockRegex.test(next)) {
    next = next.replace(xrRuntimeHeaderBlockRegex, xrRuntimeHeaderBlock)
  } else {
    const trimmed = next.endsWith('\n') ? next.trimEnd() : next
    next = `${trimmed}\n\n${xrRuntimeHeaderBlock}\n`
  }
  if (homepageHeaderBlockRegex.test(next)) {
    return next.replace(homepageHeaderBlockRegex, homepageHeaderBlock)
  }
  const trimmed = next.endsWith('\n') ? next.trimEnd() : next
  return `${trimmed}\n\n${homepageHeaderBlock}\n`
}

if (!(await existsDir(distDir))) {
  throw new Error(`Missing build output directory: ${distDir}`)
}

const sourceFiles = await listFiles(distDir)
const rootManagedSourceFiles = [{ rel: 'agenticgraph-live-canvas-hero.md', src: liveCanvasHeroMarkdownSource }]
const publishRootManagedSourceFiles = [{
  rel: '404.html',
  src: path.resolve(agenticgraphRoot, 'cloudflare', 'pages', '404.html'),
}]
const runtimeReadiness = await buildProductionRuntimeReadiness({
  sourceRevision, agenticgraphRoot, mirrorRoot, contentRoot: targetDir,
  artifactEntries: [
  ...sourceFiles
    .filter(isBrowserRuntimeArtifactRelativePath)
    .map(relativePath => ({ relativePath, absolutePath: path.resolve(distDir, relativePath) })),
  ...rootManagedSourceFiles.map(entry => ({ relativePath: entry.rel, absolutePath: entry.src })),
  ],
})
const { relativePath: runtimeReadinessRelativePath, paths: runtimeReadinessPaths, body: runtimeReadinessBody } = runtimeReadiness
const sourceSet = new Set([
  ...sourceFiles,
  ...rootManagedSourceFiles.map(entry => entry.rel),
  runtimeReadinessRelativePath,
])
const filesToCopy = []
for (const rel of sourceFiles) {
  const src = path.resolve(distDir, rel)
  const dst = path.resolve(targetDir, rel)
  if (await fileNeedsUpdate(src, dst, rel)) filesToCopy.push(rel)
}
const rootManagedFilesToCopy = []
for (const entry of rootManagedSourceFiles) {
  const dst = path.resolve(targetDir, entry.rel)
  if (await plainFileNeedsUpdate(entry.src, dst)) rootManagedFilesToCopy.push(entry)
}

const filesToRemove = []
if (await existsDir(targetDir)) {
  const targetFiles = await listAllFiles(targetDir)
  for (const rel of targetFiles) {
    if (isPreservedRelativePath(rel)) continue
    if (sourceSet.has(rel)) continue
    filesToRemove.push(rel)
  }
}

const publicFilesToCopy = []
for (const rel of sourceFiles) {
  if (!isPublicManagedRelativePath(rel)) continue
  const src = path.resolve(distDir, rel)
  const dst = path.resolve(publicRouteDir, rel)
  if (await fileNeedsUpdate(src, dst, rel)) publicFilesToCopy.push(rel)
}
const publicRootManagedFilesToCopy = []
for (const entry of rootManagedSourceFiles) {
  const dst = path.resolve(publicRouteDir, entry.rel)
  if (await plainFileNeedsUpdate(entry.src, dst)) publicRootManagedFilesToCopy.push(entry)
}
const publicFilesToRemove = []
if (await existsDir(publicRouteDir)) {
  const publicFiles = await listAllFiles(publicRouteDir)
  for (const rel of publicFiles) {
    if (!isPublicManagedRelativePath(rel)) continue
    if (sourceSet.has(rel)) continue
    publicFilesToRemove.push(rel)
  }
}
const publishRootManagedFilesToCopy = []
for (const entry of publishRootManagedSourceFiles) {
  const dst = path.resolve(mirrorRoot, entry.rel)
  if (await plainFileNeedsUpdate(entry.src, dst)) publishRootManagedFilesToCopy.push(entry)
}
const rootFiles = [...new Set([
  ...sourceFiles,
  ...rootManagedSourceFiles.map(entry => entry.rel),
])]
  .filter(rel => !rel.includes('/') && rel !== 'index.html' && !rel.startsWith('_'))
  .sort((a, b) => a.localeCompare(b))
const existingRedirects = await fs.readFile(redirectsPath, 'utf8')
const nextRedirects = buildAgenticGraphRedirects({ existing: existingRedirects, rootFiles, redirectsPath })
const redirectsNeedUpdate = nextRedirects !== existingRedirects
const agentReadyFunctionNeedsUpdate = await plainFileNeedsUpdate(agentReadyFunctionSource, agentReadyFunctionTarget)
const youtubeTranscriptFunctionNeedsUpdate = await plainFileNeedsUpdate(youtubeTranscriptFunctionSource, youtubeTranscriptFunctionTarget)
const videoFrameFunctionNeedsUpdate = await plainFileNeedsUpdate(videoFrameFunctionSource, videoFrameFunctionTarget)
const videoFrameSharedProviderNeedsUpdate = await plainFileNeedsUpdate(videoFrameSharedProviderSource, videoFrameSharedProviderTarget)
const agentReadyRuntimeFilesToCopy = []
for (const [src, dst] of agentReadyRuntimeCopies) {
  if (await plainFileNeedsUpdate(src, dst)) agentReadyRuntimeFilesToCopy.push([src, dst])
}
const agentReadyDocRouteNeedsUpdate = await textFileNeedsUpdate(agentReadyDocRouteBody, agentReadyDocRouteTarget)
const agentReadyDefaultDocRouteNeedsUpdate = await textFileNeedsUpdate(agentReadyDocRouteBody, agentReadyDefaultDocRouteTarget)
const agentReadyShareRouteNeedsUpdate = await textFileNeedsUpdate(agentReadyDocRouteBody, agentReadyShareRouteTarget)
const agentReadySharedNeedsUpdate = await plainFileNeedsUpdate(agentReadySharedSource, agentReadySharedTarget)
const agentReadyDiscoveryNeedsUpdate = await plainFileNeedsUpdate(agentReadyDiscoverySource, agentReadyDiscoveryTarget)
const rootAgentReadySharedNeedsUpdate = await plainFileNeedsUpdate(agentReadySharedSource, rootAgentReadySharedTarget)
const rootAgentReadyFunctionNeedsUpdate = await plainFileNeedsUpdate(rootAgentReadyFunctionSource, rootAgentReadyFunctionTarget)
const agentReadyToolContractNeedsUpdate = await plainFileNeedsUpdate(agentReadyToolContractSource, agentReadyToolContractTarget)
const agentReadyPromptContractNeedsUpdate = await plainFileNeedsUpdate(agentReadyPromptContractSource, agentReadyPromptContractTarget)
const agentReadyResourceContractNeedsUpdate = await plainFileNeedsUpdate(agentReadyResourceContractSource, agentReadyResourceContractTarget)
const mcpAppsReadyContractNeedsUpdate = await plainFileNeedsUpdate(mcpAppsReadyContractSource, mcpAppsReadyContractTarget)
const vdeoxplnContractNeedsUpdate = await plainFileNeedsUpdate(vdeoxplnContractSource, vdeoxplnContractTarget), localMcpToolNamesNeedsUpdate = await plainFileNeedsUpdate(localMcpToolNamesSource, localMcpToolNamesTarget), probeTreeContractNeedsUpdate = await plainFileNeedsUpdate(probeTreeContractSource, probeTreeContractTarget), vdeoxplnRoutingToolsNeedsUpdate = await plainFileNeedsUpdate(vdeoxplnRoutingToolsSource, vdeoxplnRoutingToolsTarget)
const sharedDocumentStructureInspectionNeedsUpdate = await plainFileNeedsUpdate(sharedDocumentStructureInspectionSource, sharedDocumentStructureInspectionTarget)
const agentSurfaceInspectionNeedsUpdate = await plainFileNeedsUpdate(agentSurfaceInspectionSource, agentSurfaceInspectionTarget)
const publishedDocShareTokenNeedsUpdate = await plainFileNeedsUpdate(publishedDocShareTokenSource, publishedDocShareTokenTarget)
const agenticgraphStorageSyncContractNeedsUpdate = await plainFileNeedsUpdate(agenticgraphStorageSyncContractSource, agenticgraphStorageSyncContractTarget)
const sharedD1NeedsUpdate = await plainFileNeedsUpdate(sharedD1Source, sharedD1Target)
const sharedPublishedDocNeedsUpdate = await plainFileNeedsUpdate(sharedPublishedDocSource, sharedPublishedDocTarget)
const agentReadyArtifacts = await buildAgentReadyStaticFiles()
const agentReadyStaticFilesToWrite = []
for (const [rel, artifact] of Object.entries(agentReadyArtifacts)) {
  const dst = path.resolve(mirrorRoot, rel)
  if (await textFileNeedsUpdate(artifact.body, dst)) agentReadyStaticFilesToWrite.push(rel)
}
const obsoleteGeneratedMirrorFilesToRemove = []
for (const rel of obsoleteGeneratedMirrorFiles) {
  const dst = path.resolve(mirrorRoot, rel)
  if (await fileExists(dst)) obsoleteGeneratedMirrorFilesToRemove.push(rel)
}
const existingHeaders = await fs.readFile(headersPath, 'utf8')
const nextHeaders = buildAgentReadyHeaders(existingHeaders, agentReadyArtifacts)
const headersNeedUpdate = nextHeaders !== existingHeaders
const runtimeReadinessPathsNeedingUpdate = await findRuntimeReadinessPathsNeedingUpdate(runtimeReadiness)
const runtimeReadinessNeedsUpdate = runtimeReadinessPathsNeedingUpdate.length > 0

if (checkMode) {
  const hasDrift = (
    filesToCopy.length > 0 ||
    rootManagedFilesToCopy.length > 0 ||
    filesToRemove.length > 0 ||
    publicFilesToCopy.length > 0 ||
    publicRootManagedFilesToCopy.length > 0 ||
    publicFilesToRemove.length > 0 ||
    publishRootManagedFilesToCopy.length > 0 ||
    redirectsNeedUpdate ||
    agentReadyFunctionNeedsUpdate ||
    youtubeTranscriptFunctionNeedsUpdate ||
    videoFrameFunctionNeedsUpdate ||
    videoFrameSharedProviderNeedsUpdate ||
    agentReadyRuntimeFilesToCopy.length > 0 ||
    agentReadyDocRouteNeedsUpdate ||
    agentReadyDefaultDocRouteNeedsUpdate ||
    agentReadyShareRouteNeedsUpdate ||
    agentReadySharedNeedsUpdate ||
    agentReadyDiscoveryNeedsUpdate ||
    rootAgentReadySharedNeedsUpdate ||
    rootAgentReadyFunctionNeedsUpdate ||
    agentReadyToolContractNeedsUpdate ||
    agentReadyPromptContractNeedsUpdate ||
    agentReadyResourceContractNeedsUpdate ||
    mcpAppsReadyContractNeedsUpdate ||
    vdeoxplnContractNeedsUpdate || localMcpToolNamesNeedsUpdate || probeTreeContractNeedsUpdate || vdeoxplnRoutingToolsNeedsUpdate ||
    sharedDocumentStructureInspectionNeedsUpdate ||
    agentSurfaceInspectionNeedsUpdate ||
    publishedDocShareTokenNeedsUpdate ||
    agenticgraphStorageSyncContractNeedsUpdate ||
    sharedD1NeedsUpdate ||
    sharedPublishedDocNeedsUpdate ||
    agentReadyStaticFilesToWrite.length > 0 ||
    obsoleteGeneratedMirrorFilesToRemove.length > 0 ||
    headersNeedUpdate ||
    runtimeReadinessNeedsUpdate ||
    await existsDir(obsoleteLegacyMirrorDir)
  )
  if (hasDrift) {
    console.error('[agenticgraph] publish sync drift detected')
    if (filesToCopy.length > 0) {
      console.error(`  content files needing sync (${filesToCopy.length}):`)
      for (const rel of filesToCopy.slice(0, 20)) console.error(`  - ${rel}`)
      if (filesToCopy.length > 20) console.error(`  - ... ${filesToCopy.length - 20} more`)
    }
    if (rootManagedFilesToCopy.length > 0) {
      console.error(`  root-managed source files needing sync (${rootManagedFilesToCopy.length}):`)
      for (const entry of rootManagedFilesToCopy.slice(0, 20)) console.error(`  - ${entry.rel}`)
    }
    if (filesToRemove.length > 0) {
      console.error(`  stale content files needing removal (${filesToRemove.length}):`)
      for (const rel of filesToRemove.slice(0, 20)) console.error(`  - ${rel}`)
      if (filesToRemove.length > 20) console.error(`  - ... ${filesToRemove.length - 20} more`)
    }
    if (publicFilesToCopy.length > 0) {
      console.error(`  public route files needing sync (${publicFilesToCopy.length}):`)
      for (const rel of publicFilesToCopy.slice(0, 20)) console.error(`  - ${rel}`)
      if (publicFilesToCopy.length > 20) console.error(`  - ... ${publicFilesToCopy.length - 20} more`)
    }
    if (publicRootManagedFilesToCopy.length > 0) {
      console.error(`  public root-managed source files needing sync (${publicRootManagedFilesToCopy.length}):`)
      for (const entry of publicRootManagedFilesToCopy.slice(0, 20)) console.error(`  - ${entry.rel}`)
    }
    if (publicFilesToRemove.length > 0) {
      console.error(`  stale public route files needing removal (${publicFilesToRemove.length}):`)
      for (const rel of publicFilesToRemove.slice(0, 20)) console.error(`  - ${rel}`)
      if (publicFilesToRemove.length > 20) console.error(`  - ... ${publicFilesToRemove.length - 20} more`)
    }
    if (publishRootManagedFilesToCopy.length > 0) {
      console.error(`  publish-root files needing sync (${publishRootManagedFilesToCopy.length}):`)
      for (const entry of publishRootManagedFilesToCopy) console.error(`  - ${entry.rel}`)
    }
    if (redirectsNeedUpdate) console.error('  - `huijoohwee/_redirects` generated agenticgraph block is out of sync')
    if (agentReadyFunctionNeedsUpdate) console.error('  - AgenticGraph agent-ready Pages Function is out of sync')
    if (youtubeTranscriptFunctionNeedsUpdate) console.error('  - YouTube transcript Pages Function is out of sync')
    if (videoFrameFunctionNeedsUpdate) console.error('  - Video frame Pages Function is out of sync')
    if (videoFrameSharedProviderNeedsUpdate) console.error('  - Video frame shared provider helper is out of sync')
    if (agentReadyRuntimeFilesToCopy.length > 0) {
      console.error(`  - AgenticGraph agent-ready runtime files needing sync (${agentReadyRuntimeFilesToCopy.length}):`)
      for (const [, dst] of agentReadyRuntimeFilesToCopy.slice(0, 20)) console.error(`  - ${toPosixRel(githubRoot, dst)}`)
      if (agentReadyRuntimeFilesToCopy.length > 20) console.error(`  - ... ${agentReadyRuntimeFilesToCopy.length - 20} more`)
    }
    if (agentReadyDocRouteNeedsUpdate) console.error('  - AgenticGraph shared-doc Pages Function is out of sync')
    if (agentReadyDefaultDocRouteNeedsUpdate) console.error('  - AgenticGraph default shared-doc Pages Function is out of sync')
    if (agentReadyShareRouteNeedsUpdate) console.error('  - AgenticGraph opaque share Pages Function is out of sync')
    if (agentReadySharedNeedsUpdate) console.error('  - AgenticGraph agent-ready shared markdown helper is out of sync')
    if (agentReadyDiscoveryNeedsUpdate) console.error('  - AgenticGraph agent-ready discovery helper is out of sync')
    if (rootAgentReadySharedNeedsUpdate) console.error('  - Root agent-ready shared markdown helper is out of sync')
    if (rootAgentReadyFunctionNeedsUpdate) console.error('  - Root markdown negotiation Pages Function is out of sync')
    if (agentReadyToolContractNeedsUpdate) console.error('  - AgenticGraph agent-ready shared tool contract is out of sync')
    if (agentReadyPromptContractNeedsUpdate) console.error('  - AgenticGraph agent-ready shared prompt contract is out of sync')
    if (agentReadyResourceContractNeedsUpdate) console.error('  - AgenticGraph agent-ready shared resource contract is out of sync')
    if (mcpAppsReadyContractNeedsUpdate) console.error('  - AgenticGraph MCP Apps-ready shared contract is out of sync')
    if (vdeoxplnContractNeedsUpdate) console.error('  - AgenticGraph vdeoxpln contract helper is out of sync'); if (localMcpToolNamesNeedsUpdate) console.error('  - AgenticGraph local MCP tool names helper is out of sync'); if (probeTreeContractNeedsUpdate) console.error('  - AgenticGraph probe-tree contract helper is out of sync'); if (vdeoxplnRoutingToolsNeedsUpdate) console.error('  - AgenticGraph vdeoxpln routing helper is out of sync')
    if (sharedDocumentStructureInspectionNeedsUpdate) console.error('  - AgenticGraph shared document structure inspection helper is out of sync')
    if (agentSurfaceInspectionNeedsUpdate) console.error('  - AgenticGraph agent surface inspection helper is out of sync')
    if (publishedDocShareTokenNeedsUpdate) console.error('  - AgenticGraph published doc share token helper is out of sync')
    if (agenticgraphStorageSyncContractNeedsUpdate) console.error('  - AgenticGraph storage sync contract helper is out of sync')
    if (sharedD1NeedsUpdate) console.error('  - Shared D1 helper is out of sync')
    if (sharedPublishedDocNeedsUpdate) console.error('  - Shared published doc helper is out of sync')
    if (agentReadyStaticFilesToWrite.length > 0) {
      console.error(`  - root agent-ready static files needing sync (${agentReadyStaticFilesToWrite.length}):`)
      for (const rel of agentReadyStaticFilesToWrite.slice(0, 20)) console.error(`  - ${rel}`)
    }
    if (obsoleteGeneratedMirrorFilesToRemove.length > 0) {
      console.error(`  - obsolete generated mirror files needing removal (${obsoleteGeneratedMirrorFilesToRemove.length}):`)
      for (const rel of obsoleteGeneratedMirrorFilesToRemove.slice(0, 20)) console.error(`  - ${rel}`)
    }
    if (headersNeedUpdate) console.error('  - `huijoohwee/_headers` generated agent-ready block is out of sync')
    for (const runtimeReadinessPath of runtimeReadinessPathsNeedingUpdate) {
      console.error(`  - \`${toPosixRel(mirrorRoot, runtimeReadinessPath)}\` is out of sync`)
    }
    if (await existsDir(obsoleteLegacyMirrorDir)) {
      console.error('  - obsolete legacy publish directory still exists')
    }
    console.error('  fix: run `npm run pages:build-sync`')
    process.exitCode = 1
  } else {
    console.log('[agenticgraph] publish sync is up to date')
  }
} else {
  for (const runtimeReadinessPath of runtimeReadinessPathsNeedingUpdate) await writeTextFile(runtimeReadinessPath, runtimeReadinessBody)
  await fs.mkdir(targetDir, { recursive: true })
  let copiedCount = 0
  for (const rel of sourceFiles) {
    const src = path.resolve(distDir, rel)
    const dst = path.resolve(targetDir, rel)
    const copied = await copyIfChanged(src, dst, rel)
    if (copied) copiedCount += 1
  }
  for (const entry of rootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(targetDir, entry.rel))) {
      await copyPlainFile(entry.src, path.resolve(targetDir, entry.rel))
      copiedCount += 1
    }
  }

  if (await existsDir(targetDir)) {
    for (const rel of filesToRemove) {
      await fs.rm(path.resolve(targetDir, rel), { force: true })
    }
    await removeEmptyDirs(targetDir)
  }

  await fs.mkdir(publicRouteDir, { recursive: true })
  let copiedPublicCount = 0
  for (const rel of sourceFiles) {
    if (!isPublicManagedRelativePath(rel)) continue
    const src = path.resolve(distDir, rel)
    const dst = path.resolve(publicRouteDir, rel)
    const copied = await copyIfChanged(src, dst, rel)
    if (copied) copiedPublicCount += 1
  }
  for (const entry of rootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(publicRouteDir, entry.rel))) {
      await copyPlainFile(entry.src, path.resolve(publicRouteDir, entry.rel))
      copiedPublicCount += 1
    }
  }
  if (await existsDir(publicRouteDir)) {
    for (const rel of publicFilesToRemove) {
      await fs.rm(path.resolve(publicRouteDir, rel), { force: true })
    }
    await removeEmptyDirs(publicRouteDir)
  }
  if (redirectsNeedUpdate) {
    await fs.writeFile(redirectsPath, nextRedirects, 'utf8')
  }
  let publishRootCopiedCount = 0
  for (const entry of publishRootManagedFilesToCopy) {
    await copyPlainFile(entry.src, path.resolve(mirrorRoot, entry.rel))
    publishRootCopiedCount += 1
  }
  if (agentReadyFunctionNeedsUpdate) {
    await copyPlainFile(agentReadyFunctionSource, agentReadyFunctionTarget)
  }
  if (youtubeTranscriptFunctionNeedsUpdate) {
    await copyPlainFile(youtubeTranscriptFunctionSource, youtubeTranscriptFunctionTarget)
  }
  if (videoFrameFunctionNeedsUpdate) {
    await copyPlainFile(videoFrameFunctionSource, videoFrameFunctionTarget)
  }
  if (agentReadyDocRouteNeedsUpdate) {
    await writeTextFile(agentReadyDocRouteTarget, agentReadyDocRouteBody)
  }
  if (agentReadyDefaultDocRouteNeedsUpdate) {
    await writeTextFile(agentReadyDefaultDocRouteTarget, agentReadyDocRouteBody)
  }
  if (agentReadyShareRouteNeedsUpdate) {
    await writeTextFile(agentReadyShareRouteTarget, agentReadyDocRouteBody)
  }
  if (agentReadySharedNeedsUpdate) {
    await copyPlainFile(agentReadySharedSource, agentReadySharedTarget)
  }
  if (agentReadyDiscoveryNeedsUpdate) {
    await copyPlainFile(agentReadyDiscoverySource, agentReadyDiscoveryTarget)
  }
  let agentReadyRuntimeUpdated = 0
  for (const [src, dst] of agentReadyRuntimeFilesToCopy) {
    await copyPlainFile(src, dst)
    agentReadyRuntimeUpdated += 1
  }
  if (videoFrameSharedProviderNeedsUpdate) {
    await copyPlainFile(videoFrameSharedProviderSource, videoFrameSharedProviderTarget)
  }
  await writeTextFile(agentReadyCommerceX402RouteTarget, agentReadyCommerceX402RouteBody)
  if (rootAgentReadySharedNeedsUpdate) {
    await copyPlainFile(agentReadySharedSource, rootAgentReadySharedTarget)
  }
  if (rootAgentReadyFunctionNeedsUpdate) {
    await copyPlainFile(rootAgentReadyFunctionSource, rootAgentReadyFunctionTarget)
  }
  if (agentReadyToolContractNeedsUpdate) {
    await copyPlainFile(agentReadyToolContractSource, agentReadyToolContractTarget)
  }
  if (agentReadyPromptContractNeedsUpdate) {
    await copyPlainFile(agentReadyPromptContractSource, agentReadyPromptContractTarget)
  }
  if (agentReadyResourceContractNeedsUpdate) {
    await copyPlainFile(agentReadyResourceContractSource, agentReadyResourceContractTarget)
  }
  if (mcpAppsReadyContractNeedsUpdate) {
    await copyPlainFile(mcpAppsReadyContractSource, mcpAppsReadyContractTarget)
  }
  if (vdeoxplnContractNeedsUpdate) await copyPlainFile(vdeoxplnContractSource, vdeoxplnContractTarget)
  if (localMcpToolNamesNeedsUpdate) await copyPlainFile(localMcpToolNamesSource, localMcpToolNamesTarget)
  if (probeTreeContractNeedsUpdate) await copyPlainFile(probeTreeContractSource, probeTreeContractTarget)
  if (vdeoxplnRoutingToolsNeedsUpdate) await copyPlainFile(vdeoxplnRoutingToolsSource, vdeoxplnRoutingToolsTarget)
  if (sharedDocumentStructureInspectionNeedsUpdate) {
    await copyPlainFile(sharedDocumentStructureInspectionSource, sharedDocumentStructureInspectionTarget)
  }
  if (agentSurfaceInspectionNeedsUpdate) {
    await copyPlainFile(agentSurfaceInspectionSource, agentSurfaceInspectionTarget)
  }
  if (publishedDocShareTokenNeedsUpdate) {
    await copyPlainFile(publishedDocShareTokenSource, publishedDocShareTokenTarget)
  }
  if (agenticgraphStorageSyncContractNeedsUpdate) {
    await copyPlainFile(agenticgraphStorageSyncContractSource, agenticgraphStorageSyncContractTarget)
  }
  if (sharedD1NeedsUpdate) {
    await copyPlainFile(sharedD1Source, sharedD1Target)
  }
  if (sharedPublishedDocNeedsUpdate) {
    await copyPlainFile(sharedPublishedDocSource, sharedPublishedDocTarget)
  }
  let agentReadyStaticUpdated = 0
  for (const rel of agentReadyStaticFilesToWrite) {
    const artifact = agentReadyArtifacts[rel]
    const dst = path.resolve(mirrorRoot, rel)
    await writeTextFile(dst, artifact.body)
    agentReadyStaticUpdated += 1
  }
  let obsoleteGeneratedMirrorFilesRemoved = 0
  for (const rel of obsoleteGeneratedMirrorFilesToRemove) {
    await fs.rm(path.resolve(mirrorRoot, rel), { force: true })
    obsoleteGeneratedMirrorFilesRemoved += 1
  }
  if (headersNeedUpdate) {
    await fs.writeFile(headersPath, nextHeaders, 'utf8')
  }

  console.log(
    `[agenticgraph] synced ${distDir} -> ${targetDir} (copied=${copiedCount}, removed=${filesToRemove.length}, publicCopied=${copiedPublicCount}, publicRemoved=${publicFilesToRemove.length}, publishRootCopied=${publishRootCopiedCount}, redirectsUpdated=${redirectsNeedUpdate ? 'yes' : 'no'}, headersUpdated=${headersNeedUpdate ? 'yes' : 'no'}, agentReadyFunctionUpdated=${agentReadyFunctionNeedsUpdate ? 'yes' : 'no'}, youtubeTranscriptFunctionUpdated=${youtubeTranscriptFunctionNeedsUpdate ? 'yes' : 'no'}, videoFrameFunctionUpdated=${videoFrameFunctionNeedsUpdate ? 'yes' : 'no'}, videoFrameSharedProviderUpdated=${videoFrameSharedProviderNeedsUpdate ? 'yes' : 'no'}, agentReadyRuntimeUpdated=${agentReadyRuntimeUpdated}, agentReadyDocRouteUpdated=${agentReadyDocRouteNeedsUpdate ? 'yes' : 'no'}, agentReadyDefaultDocRouteUpdated=${agentReadyDefaultDocRouteNeedsUpdate ? 'yes' : 'no'}, agentReadyShareRouteUpdated=${agentReadyShareRouteNeedsUpdate ? 'yes' : 'no'}, agentReadySharedUpdated=${agentReadySharedNeedsUpdate ? 'yes' : 'no'}, agentReadyDiscoveryUpdated=${agentReadyDiscoveryNeedsUpdate ? 'yes' : 'no'}, rootAgentReadySharedUpdated=${rootAgentReadySharedNeedsUpdate ? 'yes' : 'no'}, rootAgentReadyFunctionUpdated=${rootAgentReadyFunctionNeedsUpdate ? 'yes' : 'no'}, agentReadyToolContractUpdated=${agentReadyToolContractNeedsUpdate ? 'yes' : 'no'}, agentReadyPromptContractUpdated=${agentReadyPromptContractNeedsUpdate ? 'yes' : 'no'}, agentReadyResourceContractUpdated=${agentReadyResourceContractNeedsUpdate ? 'yes' : 'no'}, mcpAppsReadyContractUpdated=${mcpAppsReadyContractNeedsUpdate ? 'yes' : 'no'}, vdeoxplnContractUpdated=${vdeoxplnContractNeedsUpdate ? 'yes' : 'no'}, localMcpToolNamesUpdated=${localMcpToolNamesNeedsUpdate ? 'yes' : 'no'}, probeTreeContractUpdated=${probeTreeContractNeedsUpdate ? 'yes' : 'no'}, vdeoxplnRoutingToolsUpdated=${vdeoxplnRoutingToolsNeedsUpdate ? 'yes' : 'no'}, sharedDocumentStructureInspectionUpdated=${sharedDocumentStructureInspectionNeedsUpdate ? 'yes' : 'no'}, agentSurfaceInspectionUpdated=${agentSurfaceInspectionNeedsUpdate ? 'yes' : 'no'}, publishedDocShareTokenUpdated=${publishedDocShareTokenNeedsUpdate ? 'yes' : 'no'}, agenticgraphStorageSyncContractUpdated=${agenticgraphStorageSyncContractNeedsUpdate ? 'yes' : 'no'}, sharedD1Updated=${sharedD1NeedsUpdate ? 'yes' : 'no'}, sharedPublishedDocUpdated=${sharedPublishedDocNeedsUpdate ? 'yes' : 'no'}, agentReadyStaticUpdated=${agentReadyStaticUpdated}, obsoleteGeneratedMirrorFilesRemoved=${obsoleteGeneratedMirrorFilesRemoved})`,
  )
}
