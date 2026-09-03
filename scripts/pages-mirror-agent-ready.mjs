import fs from 'node:fs/promises'
import path from 'node:path'

const toPosixRel = (rootDir, absolutePath) => path.relative(rootDir, absolutePath)
  .split(path.sep)
  .filter(Boolean)
  .join('/')

const localJsImportSpecifiers = body => {
  const specifiers = []
  const importRegex = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["'](\.[^"']+\.js)["']|import\(\s*["'](\.[^"']+\.js)["']\s*\)/g
  for (const match of body.matchAll(importRegex)) specifiers.push(match[1] || match[2])
  return specifiers
}

const localModuleSpecifiers = source => [
  ...source.matchAll(/(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?['\"](\.{1,2}\/[^'\"]+)['\"]/g),
  ...source.matchAll(/\bimport\s*\(\s*['\"](\.{1,2}\/[^'\"]+)['\"]\s*\)/g),
].map(([, specifier]) => specifier)

const fileExists = async filePath => {
  try {
    return (await fs.stat(filePath)).isFile()
  } catch {
    return false
  }
}

const collectLocalModuleClosureCopies = async ({ agenticGraphRoot, mirrorRoot, entrySources }) => {
  const queue = [...entrySources]
  const visited = new Set(entrySources)
  const copies = []
  while (queue.length > 0) {
    const importer = queue.shift()
    const source = await fs.readFile(importer, 'utf8')
    for (const specifier of localModuleSpecifiers(source)) {
      const sourcePath = path.resolve(path.dirname(importer), specifier)
      const relativePath = path.relative(agenticGraphRoot, sourcePath)
      if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error(`Local module import escapes the agentic-graph source root: ${specifier}`)
      }
      if (!await fileExists(sourcePath)) {
        throw new Error(`Missing local module import ${specifier} from ${path.relative(agenticGraphRoot, importer)}`)
      }
      if (visited.has(sourcePath)) continue
      visited.add(sourcePath)
      queue.push(sourcePath)
      copies.push([sourcePath, path.resolve(mirrorRoot, relativePath)])
    }
  }
  return copies.sort(([left], [right]) => left.localeCompare(right))
}

const collectGrphSharedRuntimeCopies = async ({ grphSharedRoot, mirrorRoot, entryRelativePaths }) => {
  const seen = new Set()
  const queue = [...entryRelativePaths]
  while (queue.length > 0) {
    const relativePath = queue.shift()
    if (!relativePath || seen.has(relativePath)) continue
    if (!relativePath.startsWith('dist/') || !relativePath.endsWith('.js')) {
      throw new Error(`Shared runtime entry must be a dist JS file: ${relativePath}`)
    }
    seen.add(relativePath)
    const sourcePath = path.resolve(grphSharedRoot, relativePath)
    const sourceBody = await fs.readFile(sourcePath, 'utf8')
    for (const specifier of localJsImportSpecifiers(sourceBody)) {
      const dependencyPath = path.resolve(path.dirname(sourcePath), specifier)
      const dependencyRelativePath = toPosixRel(grphSharedRoot, dependencyPath)
      if (dependencyRelativePath.startsWith('../') || !dependencyRelativePath.startsWith('dist/') || !dependencyRelativePath.endsWith('.js')) {
        throw new Error(`Unsupported grph-shared runtime import ${specifier} from ${relativePath}`)
      }
      if (!seen.has(dependencyRelativePath)) queue.push(dependencyRelativePath)
    }
  }
  return [...seen]
    .sort((left, right) => left.localeCompare(right))
    .map(relativePath => [
      path.resolve(grphSharedRoot, relativePath),
      path.resolve(mirrorRoot, 'grph-shared', relativePath),
    ])
}

export const buildPagesMirrorAgentReadyPlan = async ({ agenticGraphRoot, mirrorRoot }) => {
  const source = (...parts) => path.resolve(agenticGraphRoot, ...parts)
  const target = (...parts) => path.resolve(mirrorRoot, ...parts)
  const agentReadyFeatureSource = filename => source('canvas', 'src', 'features', 'agent-ready', filename)
  const agentReadyFeatureTarget = filename => target('canvas', 'src', 'features', 'agent-ready', filename)
  const grphSharedRoot = source('grph-shared')

  const agentReadyFunctionSource = source('cloudflare', 'pages', 'agentic-graph-agent-ready.mjs')
  const agentReadyFunctionTarget = target('functions', 'agentic-graph', '[[path]].js')
  const webMcpHtmlInjectionSource = source('cloudflare', 'pages', 'webmcp-html-injection.mjs')
  const webMcpHtmlInjectionTarget = target('functions', 'agentic-graph', 'webmcp-html-injection.mjs')
  const youtubeTranscriptFunctionSource = source('cloudflare', 'pages', 'youtube-transcript.mjs')
  const youtubeTranscriptFunctionTarget = target('functions', '__youtube_transcript.js')
  const videoFrameFunctionSource = source('cloudflare', 'pages', 'video-frame.mjs')
  const videoFrameFunctionTarget = target('functions', '__video_frame.js')
  const videoFrameSharedProviderSource = source('grph-shared', 'dist', 'rich-media', 'providers.js')
  const videoFrameSharedProviderTarget = target('grph-shared', 'dist', 'rich-media', 'providers.js')

  const productionRuntimeFunctionEntries = [
    { label: 'agentic-os integration helper', source: source('cloudflare', 'pages', 'runtime-integration-hub.mjs'), target: target('functions', 'api', '_integrationHub.js') },
    { label: 'agentic-graph graph API Pages Function', source: source('cloudflare', 'pages', 'runtime-graph.mjs'), target: target('functions', 'api', 'graph.js'), targetIntegrationHubSpecifier: './_integrationHub.js' },
    { label: 'agentic-os chat proxy Pages Function', source: source('cloudflare', 'pages', 'runtime-chat-proxy.mjs'), target: target('functions', '__chat_proxy', '[[path]].js'), targetIntegrationHubSpecifier: '../api/_integrationHub.js' },
  ]

  const agentReadyDocRouteTarget = target('functions', 'agentic-graph', 'doc', '[[path]].js')
  const agentReadyDefaultDocRouteTarget = target('functions', 'agentic-graph', 'doc-default', '[[path]].js')
  const agentReadyShareRouteTarget = target('functions', 'agentic-graph', 'share', '[[path]].js')
  const agentReadyDocRouteBody = `import { onRequest as onAgenticGraphAgentReadyRequest } from "../[[path]].js";\n\nexport async function onRequest(context) {\n  return onAgenticGraphAgentReadyRequest(context);\n}\n`
  const agentReadySharedSource = source('cloudflare', 'pages', 'agentic-graph-agent-ready-shared.mjs')
  const agentReadySharedTarget = target('functions', 'agentic-graph', 'agentic-graph-agent-ready-shared.mjs')
  const agentReadyDiscoverySource = source('cloudflare', 'pages', 'agentic-graph-agent-ready-discovery.mjs')
  const agentReadyDiscoveryTarget = target('functions', 'agentic-graph', 'agentic-graph-agent-ready-discovery.mjs')
  const agentReadyCommerceSource = source('cloudflare', 'pages', 'agentic-graph-agent-ready-commerce.mjs')
  const agentReadyCommerceTarget = target('functions', 'agentic-graph', 'agentic-graph-agent-ready-commerce.mjs')
  const agentReadyAppShellSource = source('cloudflare', 'pages', 'agentic-graph-agent-ready-app-shell.mjs')
  const agentReadyAppShellTarget = target('functions', 'agentic-graph', 'agentic-graph-agent-ready-app-shell.mjs')
  const agentReadyCommerceX402RouteTarget = target('functions', 'api', 'payments', 'commerce', 'x402.js')
  const agentReadyCommerceX402RouteBody = `import { buildAgenticGraphX402PaymentRequiredResponse } from "../../../agentic-graph/agentic-graph-agent-ready-commerce.mjs";\n\nexport async function onRequest(context) {\n  return buildAgenticGraphX402PaymentRequiredResponse(context.request, context.env || {});\n}\n`
  const rootAgentReadySharedTarget = target('functions', 'agentic-graph-agent-ready-shared.mjs')
  const rootAgentReadyFunctionSource = source('cloudflare', 'pages', 'root-agent-ready-index.mjs')
  const rootAgentReadyFunctionTarget = target('functions', 'index.js')

  const agentReadyToolContractSource = agentReadyFeatureSource('agentic-graph-agent-ready-tool-contract.mjs')
  const agentReadyToolContractTarget = agentReadyFeatureTarget('agentic-graph-agent-ready-tool-contract.mjs')
  const agentReadyPromptContractSource = agentReadyFeatureSource('agentic-graph-agent-ready-prompt-contract.mjs')
  const agentReadyPromptContractTarget = agentReadyFeatureTarget('agentic-graph-agent-ready-prompt-contract.mjs')
  const agentReadyResourceContractSource = agentReadyFeatureSource('agentic-graph-agent-ready-resource-contract.mjs')
  const agentReadyResourceContractTarget = agentReadyFeatureTarget('agentic-graph-agent-ready-resource-contract.mjs')
  const mcpAppsReadyContractSource = agentReadyFeatureSource('mcpAppsReadyContract.mjs')
  const mcpAppsReadyContractTarget = agentReadyFeatureTarget('mcpAppsReadyContract.mjs')
  const vdeoxplnContractSource = agentReadyFeatureSource('agentic-graph-vdeoxpln-contract.mjs')
  const vdeoxplnContractTarget = agentReadyFeatureTarget('agentic-graph-vdeoxpln-contract.mjs')
  const localMcpToolNamesSource = agentReadyFeatureSource('agentic-graph-local-mcp-tool-names.mjs')
  const localMcpToolNamesTarget = agentReadyFeatureTarget('agentic-graph-local-mcp-tool-names.mjs')
  const probeTreeContractSource = agentReadyFeatureSource('probeTreeContract.mjs')
  const probeTreeContractTarget = agentReadyFeatureTarget('probeTreeContract.mjs')
  const vdeoxplnRoutingToolsSource = agentReadyFeatureSource('agentic-graph-vdeoxpln-routing-tools.mjs')
  const vdeoxplnRoutingToolsTarget = agentReadyFeatureTarget('agentic-graph-vdeoxpln-routing-tools.mjs')
  const sharedDocumentStructureInspectionSource = agentReadyFeatureSource('sharedDocumentStructureInspection.mjs')
  const sharedDocumentStructureInspectionTarget = agentReadyFeatureTarget('sharedDocumentStructureInspection.mjs')
  const agentSurfaceInspectionSource = agentReadyFeatureSource('agentSurfaceInspection.mjs')
  const agentSurfaceInspectionTarget = agentReadyFeatureTarget('agentSurfaceInspection.mjs')
  const publishedDocShareTokenSource = source('canvas', 'src', 'features', 'canvas', 'canvasDocShareToken.mjs')
  const publishedDocShareTokenTarget = target('canvas', 'src', 'features', 'canvas', 'canvasDocShareToken.mjs')
  const agenticGraphStorageSyncContractSource = source('canvas', 'src', 'lib', 'storage', 'agentic-graph-storage-sync-contract.ts')
  const agenticGraphStorageSyncContractTarget = target('canvas', 'src', 'lib', 'storage', 'agentic-graph-storage-sync-contract.ts')
  const sharedD1Source = source('cloudflare', 'workers', 'shared', 'd1.ts')
  const sharedD1Target = target('cloudflare', 'workers', 'shared', 'd1.ts')
  const sharedPublishedDocSource = source('cloudflare', 'workers', 'shared', 'publishedDoc.ts')
  const sharedPublishedDocTarget = target('cloudflare', 'workers', 'shared', 'publishedDoc.ts')

  const semanticKeyContractSource = source('contracts', 'semantic-key.js')
  const semanticKeyContractTarget = target('contracts', 'semantic-key.js')
  const runtimeSharedEntries = ['dist/hash/signature.js', 'dist/payments/agenticCommerceSsot.js']
  const namedFeatureCopies = [
    ['three', 'xrSceneMcpContract.mjs'], ['three', 'xrAnimationMcpContract.mjs'], ['three', 'motionControlMcpContract.mjs'],
    ['game-fps', 'gameModeMcpContract.mjs'], ['game-flight-sim', 'flightSimMcpContract.mjs'], ['game-city-sim', 'citySimMcpContract.mjs'],
    ['immersive-media', 'immersiveMediaMcpContract.mjs'], ['rich-media', 'richMediaTextMarkdownContract.mjs'], ['group-panel', 'groupPanelContract.mjs'],
    ['strybldr', 'cameraMcpContract.mjs'],
  ].map(([feature, filename]) => [source('canvas', 'src', 'features', feature, filename), target('canvas', 'src', 'features', feature, filename)])
  const browserRuntimeCopies = [
    'browserFunctionSource.mjs', 'publishedToolExecutors.mjs', 'webMcpLifecycle.mjs', 'webMcpLifecycleBrowserSource.mjs',
    'agentic-graph-agent-ready-output-schemas.mjs', 'mcpAppsContractText.mjs', 'mcpAppsOnboarding.mjs', 'motionControlAgentReadyContract.mjs',
    'gameModeAgentReadyContract.mjs', 'flightSimAgentReadyContract.mjs', 'immersiveMediaAgentReadyContract.mjs', 'citySimAgentReadyContract.mjs',
    'storageSyncAgentReadyContract.mjs', 'importUrlAgentReadyContract.mjs', 'probeTreeUserInputRelevance.mjs',
    'agentic-graph-vdeoxpln-registry-data.mjs', 'agentic-graph-application-composition-vdeoxpln.mjs',
  ].map(filename => [agentReadyFeatureSource(filename), agentReadyFeatureTarget(filename)])
  const agentReadyRuntimeCopies = [
    [agentReadyCommerceSource, agentReadyCommerceTarget], [agentReadyAppShellSource, agentReadyAppShellTarget],
    [webMcpHtmlInjectionSource, webMcpHtmlInjectionTarget], [semanticKeyContractSource, semanticKeyContractTarget],
    ...namedFeatureCopies,
    [source('canvas', 'src', 'lib', 'storage', 'agentic-graph-storage-engine-mcp-contract.mjs'), target('canvas', 'src', 'lib', 'storage', 'agentic-graph-storage-engine-mcp-contract.mjs')],
    ...browserRuntimeCopies,
    ...await collectLocalModuleClosureCopies({ agenticGraphRoot, mirrorRoot, entrySources: [agentReadyToolContractSource] }),
    ...await collectGrphSharedRuntimeCopies({ grphSharedRoot, mirrorRoot, entryRelativePaths: runtimeSharedEntries }),
  ]

  return {
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
  }
}
