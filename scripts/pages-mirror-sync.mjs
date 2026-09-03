import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentReadyHomepageLinkHeaderValue, buildAgentReadyStaticFiles } from '../cloudflare/pages/agentic-graph-agent-ready.mjs'
import { buildPagesMirrorAgentReadyPlan } from './pages-mirror-agent-ready.mjs'
import { createPagesMirrorFileOperations } from './pages-mirror-file-operations.mjs'
import { buildAgentReadyHeaders } from './pages-mirror-headers.mjs'
import { createPagesMirrorLegacyCleanup } from './pages-mirror-legacy-cleanup.mjs'
import { buildAgenticGraphRedirects } from './production-pages-routing.mjs'
import {
  buildProductionRuntimeReadiness,
  findRuntimeReadinessPathsNeedingUpdate,
  productionRuntimeReadinessHeaderLines,
} from './production-runtime-readiness-build.mjs'
import { LEGACY_MIRROR_DIRECTORY_ROOTS, LEGACY_MIRROR_EXACT_PATHS } from './mirror-namespace-contract.mjs'
import {
  XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
  XR_V2_MIRRORED_IGNORE_RELATIVE_PATH,
  XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS,
} from './xr-v2/production-publish-contract.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const joinRelativePath = (...parts) => parts.join('/')
const joinToken = (...parts) => parts.join('')
const joinKebab = (...parts) => parts.join('-')
const summaryList = (label, entries, formatter = entry => entry) => {
  if (entries.length === 0) return
  console.error(`  ${label} (${entries.length}):`)
  for (const entry of entries.slice(0, 20)) console.error(`  - ${formatter(entry)}`)
  if (entries.length > 20) console.error(`  - ... ${entries.length - 20} more`)
}

export const runPagesMirrorSync = async ({ checkMode = false } = {}) => {
  const agenticGraphRoot = path.resolve(__dirname, '..')
  const githubRoot = path.resolve(agenticGraphRoot, '..')
  const mirrorRoot = path.resolve(process.env.AGENTIC_OS_PUBLISH_REPOSITORY_ROOT || path.resolve(githubRoot, 'huijoohwee'))
  const distDir = path.resolve(agenticGraphRoot, 'canvas', 'dist')
  const targetDir = path.resolve(mirrorRoot, 'content', 'agentic-graph')
  const publicRouteDir = path.resolve(mirrorRoot, 'agentic-graph')
  const redirectsPath = path.resolve(mirrorRoot, '_redirects')
  const headersPath = path.resolve(mirrorRoot, '_headers')
  const sourceRevision = String(process.env.AGENTIC_OS_SOURCE_REVISION || execFileSync(
    'git', ['rev-parse', 'HEAD'], { cwd: agenticGraphRoot, encoding: 'utf8' },
  )).trim()
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error('agentic-graph source revision must be an exact lowercase 40-character SHA')

  const importedServiceWorkerRootFiles = new Set(['agentic-graph-chat-stream-sw.js', 'agentic-graph-service-worker-revision.js'])
  const publicManagedRootFiles = new Set([
    'favicon.svg', 'index.html', 'agentic-graph-live-canvas-hero.md', 'llms.txt', 'manifest.webmanifest',
    'settings-flow.json', 'sw.js', ...importedServiceWorkerRootFiles,
  ])
  const blockedRelativeRoots = new Set(['cesium', 'demo', 'examples', 'vendor/mermaid'])
  const blockedRelativeFiles = new Set(['_headers', '_redirects', 'unicorn-investors-test.json'])
  const preservedRelativeRoots = new Set(['imports'])
  const isAllowedRelativePath = relativePath => {
    if (!relativePath) return true
    if (relativePath === XR_V2_MIRRORED_IGNORE_RELATIVE_PATH || blockedRelativeFiles.has(relativePath)) return false
    return ![...blockedRelativeRoots].some(root => relativePath === root || relativePath.startsWith(`${root}/`))
  }
  const isPreservedRelativePath = relativePath => Boolean(relativePath)
    && [...preservedRelativeRoots].some(root => relativePath === root || relativePath.startsWith(`${root}/`))
  const isPublicManagedRelativePath = relativePath => Boolean(relativePath)
    && (relativePath.startsWith('assets/') || publicManagedRootFiles.has(relativePath))
  const xrV2RuntimePaths = new Set(XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS)
  const isBrowserRuntimeArtifactRelativePath = relativePath => isPublicManagedRelativePath(relativePath)
    || importedServiceWorkerRootFiles.has(relativePath)
    || xrV2RuntimePaths.has(relativePath)
    || /^workbox-[A-Za-z0-9_-]+\.js$/.test(relativePath)
  const {
    copyIfChanged, copyPlainFile, existsDir, fileNeedsUpdate, listAllFiles, listFiles, plainFileNeedsUpdate,
    productionRuntimeFunctionTargetBody, textFileNeedsUpdate, toPosixRel, writeTextFile,
  } = createPagesMirrorFileOperations({ isAllowedRelativePath })
  const {
    assertLegacyMirrorInventoryIsBounded, collectLegacyMirrorFilesToRemove, createLegacyImageMigrationPlan,
    removeEmptyDirs, resolveMirrorRelativePath,
  } = createPagesMirrorLegacyCleanup({ mirrorRoot })
  const plan = await buildPagesMirrorAgentReadyPlan({ agenticGraphRoot, mirrorRoot })
  const {
    agentReadyCommerceX402RouteBody, agentReadyCommerceX402RouteTarget, agentReadyDefaultDocRouteTarget,
    agentReadyDiscoverySource, agentReadyDiscoveryTarget, agentReadyDocRouteBody, agentReadyDocRouteTarget,
    agentReadyFunctionSource, agentReadyFunctionTarget, agentReadyPromptContractSource, agentReadyPromptContractTarget,
    agentReadyResourceContractSource, agentReadyResourceContractTarget, agentReadyRuntimeCopies, agentReadyShareRouteTarget,
    agentReadySharedSource, agentReadySharedTarget, agentReadyToolContractSource, agentReadyToolContractTarget,
    agentSurfaceInspectionSource, agentSurfaceInspectionTarget, agenticGraphStorageSyncContractSource,
    agenticGraphStorageSyncContractTarget, localMcpToolNamesSource, localMcpToolNamesTarget, mcpAppsReadyContractSource,
    mcpAppsReadyContractTarget, probeTreeContractSource, probeTreeContractTarget, productionRuntimeFunctionEntries,
    publishedDocShareTokenSource, publishedDocShareTokenTarget, rootAgentReadyFunctionSource, rootAgentReadyFunctionTarget,
    rootAgentReadySharedTarget, sharedD1Source, sharedD1Target, sharedDocumentStructureInspectionSource,
    sharedDocumentStructureInspectionTarget, sharedPublishedDocSource, sharedPublishedDocTarget, vdeoxplnContractSource,
    vdeoxplnContractTarget, vdeoxplnRoutingToolsSource, vdeoxplnRoutingToolsTarget, videoFrameFunctionSource,
    videoFrameFunctionTarget, videoFrameSharedProviderSource, videoFrameSharedProviderTarget, youtubeTranscriptFunctionSource,
    youtubeTranscriptFunctionTarget,
  } = plan
  const obsoleteGeneratedMirrorFiles = new Set([
    'index.html', ...XR_V2_LEGACY_MIRROR_RELATIVE_PATHS, ...LEGACY_MIRROR_EXACT_PATHS,
    joinRelativePath('agentic-graph', '.well-known', 'runtime-readiness.json'),
    joinRelativePath('canvas', 'src', 'features', 'agent-ready', joinToken('agentic-graph', 'Skill', 'Pack', 'Contract.mjs')),
    joinRelativePath('canvas', 'src', 'features', 'chat', joinToken('agentic-graph', 'Skill', 'Pack', 'ChatArtifacts.ts')),
    joinRelativePath('canvas', 'src', 'features', 'panels', 'views', joinToken('skill', 'Pack', 'McpApiDocs.ts')),
    joinRelativePath('docs', 'documents', joinKebab('agentic-graph', 'skill', 'packs', 'prd', 'tad.md')),
    joinRelativePath('scripts', joinKebab('check', 'skill', 'packs.mjs')),
  ])
  if (!await existsDir(distDir)) throw new Error(`Missing build output directory: ${distDir}`)

  const sourceFiles = await listFiles(distDir)
  const rootManagedSourceFiles = [{ rel: 'agentic-graph-live-canvas-hero.md', src: path.resolve(agenticGraphRoot, 'docs', 'documents', 'agentic-graph-live-canvas-hero.md') }]
  const publishRootManagedSourceFiles = [
    { rel: '404.html', src: path.resolve(agenticGraphRoot, 'cloudflare', 'pages', '404.html') },
    { rel: 'README.md', src: path.resolve(agenticGraphRoot, 'README.md') },
  ]
  await assertLegacyMirrorInventoryIsBounded()
  const legacyImageMigration = await createLegacyImageMigrationPlan()
  const legacyMirrorFilesToRemove = await collectLegacyMirrorFilesToRemove({ obsoleteGeneratedMirrorFiles })
  const runtimeReadiness = await buildProductionRuntimeReadiness({
    sourceRevision, agenticGraphRoot, mirrorRoot, contentRoot: targetDir,
    artifactEntries: [
      ...sourceFiles.filter(isBrowserRuntimeArtifactRelativePath)
        .map(relativePath => ({ relativePath, absolutePath: path.resolve(distDir, relativePath) })),
      ...rootManagedSourceFiles.map(entry => ({ relativePath: entry.rel, absolutePath: entry.src })),
      ...legacyImageMigration.runtimeEntries,
    ],
  })
  const { relativePath: runtimeReadinessRelativePath, body: runtimeReadinessBody } = runtimeReadiness
  const sourceSet = new Set([...sourceFiles, ...rootManagedSourceFiles.map(entry => entry.rel), runtimeReadinessRelativePath])
  const filesToCopy = []
  for (const relativePath of sourceFiles) {
    if (await fileNeedsUpdate(path.resolve(distDir, relativePath), path.resolve(targetDir, relativePath))) filesToCopy.push(relativePath)
  }
  const rootManagedFilesToCopy = []
  for (const entry of rootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(targetDir, entry.rel))) rootManagedFilesToCopy.push(entry)
  }
  const filesToRemove = []
  if (await existsDir(targetDir)) {
    for (const relativePath of await listAllFiles(targetDir)) {
      if (!isPreservedRelativePath(relativePath) && !sourceSet.has(relativePath)) filesToRemove.push(relativePath)
    }
  }
  const publicFilesToCopy = []
  for (const relativePath of sourceFiles) {
    if (isPublicManagedRelativePath(relativePath) && await fileNeedsUpdate(path.resolve(distDir, relativePath), path.resolve(publicRouteDir, relativePath))) publicFilesToCopy.push(relativePath)
  }
  const publicRootManagedFilesToCopy = []
  for (const entry of rootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(publicRouteDir, entry.rel))) publicRootManagedFilesToCopy.push(entry)
  }
  const publicFilesToRemove = []
  if (await existsDir(publicRouteDir)) {
    for (const relativePath of await listAllFiles(publicRouteDir)) {
      if (isPublicManagedRelativePath(relativePath) && !sourceSet.has(relativePath)) publicFilesToRemove.push(relativePath)
    }
  }
  const publishRootManagedFilesToCopy = []
  for (const entry of publishRootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(mirrorRoot, entry.rel))) publishRootManagedFilesToCopy.push(entry)
  }
  const rootFiles = [...new Set([...sourceFiles, ...rootManagedSourceFiles.map(entry => entry.rel)])]
    .filter(relativePath => !relativePath.includes('/') && relativePath !== 'index.html' && !relativePath.startsWith('_'))
    .sort((left, right) => left.localeCompare(right))
  const existingRedirects = await fs.readFile(redirectsPath, 'utf8')
  const nextRedirects = buildAgenticGraphRedirects({ existing: existingRedirects, rootFiles, redirectsPath })
  const redirectsNeedUpdate = nextRedirects !== existingRedirects
  const plainCopyEntries = [
    ['agent-ready Pages Function', agentReadyFunctionSource, agentReadyFunctionTarget],
    ['YouTube transcript Pages Function', youtubeTranscriptFunctionSource, youtubeTranscriptFunctionTarget],
    ['video frame Pages Function', videoFrameFunctionSource, videoFrameFunctionTarget],
    ['video frame shared provider', videoFrameSharedProviderSource, videoFrameSharedProviderTarget],
    ['agent-ready shared helper', agentReadySharedSource, agentReadySharedTarget],
    ['agent-ready discovery helper', agentReadyDiscoverySource, agentReadyDiscoveryTarget],
    ['root agent-ready shared helper', agentReadySharedSource, rootAgentReadySharedTarget],
    ['root markdown negotiation Pages Function', rootAgentReadyFunctionSource, rootAgentReadyFunctionTarget],
    ['agent-ready tool contract', agentReadyToolContractSource, agentReadyToolContractTarget],
    ['agent-ready prompt contract', agentReadyPromptContractSource, agentReadyPromptContractTarget],
    ['agent-ready resource contract', agentReadyResourceContractSource, agentReadyResourceContractTarget],
    ['MCP Apps-ready contract', mcpAppsReadyContractSource, mcpAppsReadyContractTarget],
    ['vdeoxpln contract', vdeoxplnContractSource, vdeoxplnContractTarget],
    ['local MCP tool names', localMcpToolNamesSource, localMcpToolNamesTarget],
    ['probe-tree contract', probeTreeContractSource, probeTreeContractTarget],
    ['vdeoxpln routing helper', vdeoxplnRoutingToolsSource, vdeoxplnRoutingToolsTarget],
    ['shared document inspection helper', sharedDocumentStructureInspectionSource, sharedDocumentStructureInspectionTarget],
    ['agent surface inspection helper', agentSurfaceInspectionSource, agentSurfaceInspectionTarget],
    ['published doc share token helper', publishedDocShareTokenSource, publishedDocShareTokenTarget],
    ['storage sync contract helper', agenticGraphStorageSyncContractSource, agenticGraphStorageSyncContractTarget],
    ['shared D1 helper', sharedD1Source, sharedD1Target],
    ['shared published-doc helper', sharedPublishedDocSource, sharedPublishedDocTarget],
  ]
  const plainCopyUpdates = []
  for (const [label, source, target] of plainCopyEntries) {
    if (await plainFileNeedsUpdate(source, target)) plainCopyUpdates.push({ label, source, target })
  }
  const productionRuntimeFunctionUpdates = []
  for (const entry of productionRuntimeFunctionEntries) {
    const body = await productionRuntimeFunctionTargetBody(entry)
    if (await textFileNeedsUpdate(body, entry.target)) productionRuntimeFunctionUpdates.push({ entry, body })
  }
  const agentReadyRuntimeFilesToCopy = []
  for (const [source, target] of agentReadyRuntimeCopies) {
    if (await plainFileNeedsUpdate(source, target)) agentReadyRuntimeFilesToCopy.push([source, target])
  }
  const agentReadyRouteWrites = [agentReadyDocRouteTarget, agentReadyDefaultDocRouteTarget, agentReadyShareRouteTarget]
  const agentReadyRouteUpdates = []
  for (const target of agentReadyRouteWrites) {
    if (await textFileNeedsUpdate(agentReadyDocRouteBody, target)) agentReadyRouteUpdates.push(target)
  }
  const agentReadyArtifacts = await buildAgentReadyStaticFiles()
  const agentReadyStaticFilesToWrite = []
  for (const [relativePath, artifact] of Object.entries(agentReadyArtifacts)) {
    if (await textFileNeedsUpdate(artifact.body, path.resolve(mirrorRoot, relativePath))) agentReadyStaticFilesToWrite.push(relativePath)
  }
  const existingHeaders = await fs.readFile(headersPath, 'utf8')
  const nextHeaders = buildAgentReadyHeaders({
    existing: existingHeaders, artifacts: agentReadyArtifacts, agentReadyHomepageLinkHeaderValue,
    productionRuntimeReadinessHeaderLines,
  })
  const headersNeedUpdate = nextHeaders !== existingHeaders
  const runtimeReadinessPathsNeedingUpdate = await findRuntimeReadinessPathsNeedingUpdate(runtimeReadiness)
  const hasDrift = [
    filesToCopy, rootManagedFilesToCopy, filesToRemove, publicFilesToCopy, publicRootManagedFilesToCopy,
    publicFilesToRemove, publishRootManagedFilesToCopy, plainCopyUpdates, productionRuntimeFunctionUpdates,
    agentReadyRuntimeFilesToCopy, agentReadyRouteUpdates, agentReadyStaticFilesToWrite, legacyMirrorFilesToRemove,
    legacyImageMigration.legacyImageFiles, runtimeReadinessPathsNeedingUpdate,
  ].some(entries => entries.length > 0) || redirectsNeedUpdate || headersNeedUpdate

  if (checkMode) {
    if (!hasDrift) {
      console.log('[agentic-graph] publish sync is up to date')
      return
    }
    console.error('[agentic-graph] publish sync drift detected')
    summaryList('content files needing sync', filesToCopy)
    summaryList('root-managed source files needing sync', rootManagedFilesToCopy, entry => entry.rel)
    summaryList('stale content files needing removal', filesToRemove)
    summaryList('public route files needing sync', publicFilesToCopy)
    summaryList('public root-managed source files needing sync', publicRootManagedFilesToCopy, entry => entry.rel)
    summaryList('stale public route files needing removal', publicFilesToRemove)
    summaryList('publish-root files needing sync', publishRootManagedFilesToCopy, entry => entry.rel)
    if (redirectsNeedUpdate) console.error('  - `huijoohwee/_redirects` generated agentic-graph block is out of sync')
    summaryList('source-owned production runtime functions needing sync', productionRuntimeFunctionUpdates, ({ entry }) => entry.label)
    summaryList('agent-ready runtime files needing sync', agentReadyRuntimeFilesToCopy, ([, target]) => toPosixRel(githubRoot, target))
    summaryList('agent-ready owned files needing sync', plainCopyUpdates, entry => entry.label)
    summaryList('agent-ready route Functions needing sync', agentReadyRouteUpdates, target => toPosixRel(mirrorRoot, target))
    summaryList('root agent-ready static files needing sync', agentReadyStaticFilesToWrite)
    summaryList('bounded legacy mirror files needing removal', legacyMirrorFilesToRemove)
    if (legacyImageMigration.legacyImageFiles.length > 0) {
      const copies = legacyImageMigration.entries.filter(entry => entry.needsCopy).length
      summaryList(`legacy image payloads needing byte-preserving migration (copies=${copies})`, legacyImageMigration.entries, entry => `${entry.sourceRelativePath} -> ${entry.destinationRelativePath}`)
    }
    if (headersNeedUpdate) console.error('  - `huijoohwee/_headers` generated agent-ready block is out of sync')
    summaryList('runtime-readiness files needing sync', runtimeReadinessPathsNeedingUpdate, target => toPosixRel(mirrorRoot, target))
    console.error('  fix: run `npm run pages:build-sync`')
    process.exitCode = 1
    return
  }

  for (const runtimeReadinessPath of runtimeReadinessPathsNeedingUpdate) await writeTextFile(runtimeReadinessPath, runtimeReadinessBody)
  await fs.mkdir(targetDir, { recursive: true })
  let copiedCount = 0
  for (const relativePath of sourceFiles) {
    if (await copyIfChanged(path.resolve(distDir, relativePath), path.resolve(targetDir, relativePath))) copiedCount += 1
  }
  for (const entry of rootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(targetDir, entry.rel))) {
      await copyPlainFile(entry.src, path.resolve(targetDir, entry.rel))
      copiedCount += 1
    }
  }
  for (const relativePath of filesToRemove) await fs.rm(path.resolve(targetDir, relativePath), { force: true })
  await removeEmptyDirs(targetDir)
  await fs.mkdir(publicRouteDir, { recursive: true })
  let copiedPublicCount = 0
  for (const relativePath of sourceFiles) {
    if (isPublicManagedRelativePath(relativePath) && await copyIfChanged(path.resolve(distDir, relativePath), path.resolve(publicRouteDir, relativePath))) copiedPublicCount += 1
  }
  for (const entry of rootManagedSourceFiles) {
    if (await plainFileNeedsUpdate(entry.src, path.resolve(publicRouteDir, entry.rel))) {
      await copyPlainFile(entry.src, path.resolve(publicRouteDir, entry.rel))
      copiedPublicCount += 1
    }
  }
  for (const relativePath of publicFilesToRemove) await fs.rm(path.resolve(publicRouteDir, relativePath), { force: true })
  await removeEmptyDirs(publicRouteDir)
  if (redirectsNeedUpdate) await fs.writeFile(redirectsPath, nextRedirects, 'utf8')
  for (const entry of publishRootManagedFilesToCopy) await copyPlainFile(entry.src, path.resolve(mirrorRoot, entry.rel))
  for (const { source, target } of plainCopyUpdates) await copyPlainFile(source, target)
  for (const { entry, body } of productionRuntimeFunctionUpdates) await writeTextFile(entry.target, body)
  for (const target of agentReadyRouteUpdates) await writeTextFile(target, agentReadyDocRouteBody)
  for (const [source, target] of agentReadyRuntimeFilesToCopy) await copyPlainFile(source, target)
  await writeTextFile(agentReadyCommerceX402RouteTarget, agentReadyCommerceX402RouteBody)
  for (const relativePath of agentReadyStaticFilesToWrite) await writeTextFile(path.resolve(mirrorRoot, relativePath), agentReadyArtifacts[relativePath].body)
  let legacyImagePayloadsCopied = 0
  for (const entry of legacyImageMigration.entries) {
    if (!entry.needsCopy) continue
    await copyPlainFile(entry.sourcePath, entry.destinationPath)
    legacyImagePayloadsCopied += 1
  }
  for (const relativePath of legacyMirrorFilesToRemove) await fs.rm(resolveMirrorRelativePath(relativePath), { force: true })
  for (const relativePath of legacyImageMigration.legacyImageFiles) await fs.rm(resolveMirrorRelativePath(relativePath), { force: true })
  for (const relativeRoot of [...LEGACY_MIRROR_DIRECTORY_ROOTS, 'content/knowgrph', 'docs_/agenticgraph', 'image/agenticgraph', 'image/knowgrph']) {
    await removeEmptyDirs(resolveMirrorRelativePath(relativeRoot))
  }
  if (headersNeedUpdate) await fs.writeFile(headersPath, nextHeaders, 'utf8')
  console.log(
    `[agentic-graph] synced ${distDir} -> ${targetDir} (copied=${copiedCount}, removed=${filesToRemove.length}, publicCopied=${copiedPublicCount}, publicRemoved=${publicFilesToRemove.length}, publishRootCopied=${publishRootManagedFilesToCopy.length}, redirectsUpdated=${redirectsNeedUpdate ? 'yes' : 'no'}, headersUpdated=${headersNeedUpdate ? 'yes' : 'no'}, plainFilesUpdated=${plainCopyUpdates.length}, runtimeFunctionsUpdated=${productionRuntimeFunctionUpdates.length}, agentReadyRuntimeUpdated=${agentReadyRuntimeFilesToCopy.length}, agentReadyRoutesUpdated=${agentReadyRouteUpdates.length}, agentReadyStaticUpdated=${agentReadyStaticFilesToWrite.length}, legacyMirrorFilesRemoved=${legacyMirrorFilesToRemove.length}, legacyImagePayloadsCopied=${legacyImagePayloadsCopied}, legacyImagePayloadsRemoved=${legacyImageMigration.legacyImageFiles.length})`,
  )
}
