import fs from 'node:fs'
import path from 'node:path'
import {
  buildAgenticGraphVdeoxplnAgentSkillDefinitions,
  buildAgenticGraphVdeoxplnChatSystemPrompt,
  buildAgenticGraphVdeoxplnMarkdown,
  buildAgenticGraphVdeoxplnRegistry,
  buildAgenticGraphVdeoxplnRoutingPlan,
  AGENTIC_OS_VDEOXPLN_IDS,
  validateAgenticGraphVdeoxplnRegistry,
} from '@/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs'
import {
  buildAgentReadyOpenApiPaths,
} from '../../../cloudflare/pages/agentic-graph-agent-ready-discovery.mjs'
import {
  buildAgentReadyStaticFiles,
  onRequest,
} from '../../../cloudflare/pages/agentic-graph-agent-ready.mjs'
import {
  AGENTIC_OS_VDEOXPLN_DOC_ENTRIES,
} from '@/features/panels/views/vdeoxplnMcpApiDocs'
import {
  buildAgenticGraphLocalMcpToolDefinitions,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES,
} from '../../../mcp/local-tool-contract.js'

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function testAgenticGraphVdeoxplnRegistryProjectsToAgentSkillsMainPanelAndMcp() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const contractText = fs.readFileSync(path.resolve(process.cwd(), 'src', 'features', 'agent-ready', 'agentic-graph-vdeoxpln-contract.mjs'), 'utf8')
  if (contractText.includes('grph-shared') || !contractText.includes('from "../../../../contracts/semantic-key.js"')) {
    throw new Error('expected vdeoxpln semantic keys to retain the source-owned semantic-key contract')
  }
  const syncScriptText = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'sync-pages-agentic-graph.mjs'), 'utf8')
  if (!syncScriptText.includes("'dist/hash/signature.js'")) {
    throw new Error('expected Pages sync to publish the shared hash signature runtime')
  }
  const registry = buildAgenticGraphVdeoxplnRegistry()
  const validation = validateAgenticGraphVdeoxplnRegistry(registry)
  if (!validation.ok) {
    throw new Error(`expected vdeoxpln registry to validate, got ${JSON.stringify(validation.errors)}`)
  }
  const localMcp = registry.find(vdeoxpln => vdeoxpln.id === AGENTIC_OS_VDEOXPLN_IDS.localMcp)
  for (const token of ['/implementation.run', '#managed-implementation-run', '@work-item', '@implementation-run']) {
    if (!localMcp?.triggers.includes(token)) throw new Error(`expected local MCP vdeoxpln triggers to include ${token}`)
  }
  const applicationComposition = registry.find(vdeoxpln => vdeoxpln.id === AGENTIC_OS_VDEOXPLN_IDS.applicationComposition)
  for (const token of ['/application.compose', '#application-composition', '@application-manifest', '@component-catalog', '@integration-profile', '@runtime-proof']) {
    if (!applicationComposition?.triggers.includes(token)) throw new Error(`expected application composition triggers to include ${token}`)
  }
  for (const tool of [AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationPlan, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute]) {
    if (!applicationComposition?.tools.local.includes(tool)) throw new Error(`expected application composition to route ${tool}`)
  }
  const applicationPlan = buildAgenticGraphVdeoxplnRoutingPlan({ intentText: applicationComposition?.triggers.join(' '), requestedOutputs: ['immutable application-composition-plan/v1'] })
  if (applicationPlan.selectedVdeoxplnId !== AGENTIC_OS_VDEOXPLN_IDS.applicationComposition || applicationPlan.executionStages.some(stage => stage.id === 'floating-panel-chat' || stage.kind === 'ai-assisted')) {
    throw new Error(`expected application composition to use only its exact local MCP route, got ${JSON.stringify(applicationPlan.executionStages)}`)
  }

  const ids = registry.map(vdeoxpln => vdeoxpln.id)
  if (new Set(ids).size !== ids.length) {
    throw new Error(`expected unique vdeoxpln ids, got ${JSON.stringify(ids)}`)
  }
  if (JSON.stringify(ids) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right)))) {
    throw new Error(`expected stable sorted vdeoxpln ids, got ${JSON.stringify(ids)}`)
  }

  for (const vdeoxpln of registry) {
    if (!String(vdeoxpln.semanticKey || '').startsWith('kgvx_')) {
      throw new Error(`expected ${vdeoxpln.id} to expose a kgvx semantic key, got ${vdeoxpln.semanticKey}`)
    }
    for (const owner of vdeoxpln.owners) {
      const ownerPath = path.resolve(repoRoot, owner)
      if (!fs.existsSync(ownerPath)) {
        throw new Error(`expected ${vdeoxpln.id} owner to exist: ${owner}`)
      }
    }
    if (Array.isArray((vdeoxpln as { aliases?: unknown[] }).aliases) && (vdeoxpln as { aliases?: unknown[] }).aliases?.length) {
      throw new Error(`expected ${vdeoxpln.id} to avoid compatibility aliases`)
    }
  }

  const definitions = buildAgenticGraphVdeoxplnAgentSkillDefinitions(registry)
  const staticFiles = await buildAgentReadyStaticFiles()
  const expectedMarkdownStaticPaths = definitions
    .map(definition => definition.path.replace(/^\/+/, ''))
    .sort((left, right) => left.localeCompare(right))
  const actualMarkdownStaticPaths = Object.keys(staticFiles)
    .filter(key => key.startsWith('.well-known/agent-skills/') && key.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right))
  if (JSON.stringify(actualMarkdownStaticPaths) !== JSON.stringify(expectedMarkdownStaticPaths)) {
    throw new Error(`expected generated agent skill markdown paths to match registry paths, got ${JSON.stringify(actualMarkdownStaticPaths)}`)
  }
  const indexBody = staticFiles['.well-known/agent-skills/index.json']?.body
  if (!indexBody) {
    throw new Error('expected generated agent-skills index static file')
  }
  const index = JSON.parse(indexBody) as {
    skills?: Array<{
      name?: string
      url?: string
      sha256?: string
      vdeoxpln?: { id?: string; semanticKey?: string }
    }>
  }
  if (!Array.isArray(index.skills) || index.skills.length !== registry.length) {
    throw new Error(`expected one generated agent skill per vdeoxpln, got ${JSON.stringify(index.skills)}`)
  }

  const openApiPaths = buildAgentReadyOpenApiPaths({
    appBasePath: '/agentic-graph',
    appA2aAgentCardPath: '/agentic-graph/.well-known/agent-card.json',
    healthPath: '/agentic-graph/health',
  })
  const docEntriesById = new Map(
    AGENTIC_OS_VDEOXPLN_DOC_ENTRIES.map(entry => [entry.meta.key.replace(/^vdeoxpln\./, ''), entry]),
  )

  for (const definition of definitions) {
    const vdeoxpln = registry.find(candidate => candidate.id === definition.name)
    if (!vdeoxpln) {
      throw new Error(`expected definition ${definition.name} to map back to the registry`)
    }
    const staticPath = definition.path.replace(/^\/+/, '')
    const staticMarkdown = staticFiles[staticPath]?.body
    const expectedMarkdown = buildAgenticGraphVdeoxplnMarkdown(vdeoxpln)
    if (staticMarkdown !== expectedMarkdown) {
      throw new Error(`expected static markdown for ${vdeoxpln.id} to be generated from the registry`)
    }
    const indexSkill = index.skills.find(skill => skill.name === vdeoxpln.id)
    if (!indexSkill) {
      throw new Error(`expected agent-skills index to include ${vdeoxpln.id}`)
    }
    if (
      indexSkill.url !== `https://airvio.co/agentic-graph${definition.path}`
      || indexSkill.vdeoxpln?.id !== vdeoxpln.id
      || indexSkill.vdeoxpln?.semanticKey !== vdeoxpln.semanticKey
      || indexSkill.sha256 !== await sha256Hex(expectedMarkdown)
    ) {
      throw new Error(`expected agent-skills index entry to match ${vdeoxpln.id}, got ${JSON.stringify(indexSkill)}`)
    }
    if (!openApiPaths[`/agentic-graph${definition.path}`]?.get) {
      throw new Error(`expected OpenAPI to expose ${definition.path}`)
    }

    const response = await onRequest({
      request: new Request(`https://airvio.co/agentic-graph${definition.path}`, {
        method: 'GET',
        headers: { accept: 'text/markdown' },
      }),
      env: {},
      next: async () => new Response('unexpected next()'),
    } as never)
    const routedMarkdown = await response.text()
    if (!response.ok || routedMarkdown !== expectedMarkdown) {
      throw new Error(`expected route markdown for ${vdeoxpln.id} to match the registry, got ${response.status}`)
    }

    const docEntry = docEntriesById.get(vdeoxpln.id)
    if (!docEntry) {
      throw new Error(`expected MainPanel MCP docs to include ${vdeoxpln.id}`)
    }
    if (
      !String(docEntry.meta.read()).includes(`semanticKey=${vdeoxpln.semanticKey}`)
      || JSON.stringify(docEntry.details.modules) !== JSON.stringify(vdeoxpln.owners)
    ) {
      throw new Error(`expected MainPanel MCP doc entry to mirror ${vdeoxpln.id}`)
    }
  }

  const localToolNames = buildAgenticGraphLocalMcpToolDefinitions().map(tool => tool.name)
  if (!localToolNames.includes(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.vdeoxplnList)) {
    throw new Error('expected local MCP to expose agentic-graph.vdeoxpln.list')
  }
}

export function testAgenticGraphVdeoxplnRoutingKeepsCanonicalAgenticOsClean() {
  const routeOnlyPlan = buildAgenticGraphVdeoxplnRoutingPlan({
    routePath: '/agentic-graph/.well-known/agent-skills/agentic-graph-chat-to-canvas.md',
    filePath: 'docs/demo.md',
  })
  if (routeOnlyPlan.status !== 'declined' || !String(routeOnlyPlan.reason || '').includes('ignored')) {
    throw new Error(`expected route-only skill routing to decline, got ${JSON.stringify(routeOnlyPlan)}`)
  }

  const chatPlan = buildAgenticGraphVdeoxplnRoutingPlan({
    intentText: 'Generate a graph from the selected source evidence and apply the validated AGENTIC_OS markdown to the canvas.',
    chatStorageTarget: 'chatAgenticGraph',
    contentTypes: ['workspace document markdown', 'source evidence'],
    requestedOutputs: ['validated AGENTIC_OS Markdown', 'workspace artifact', 'GraphData', 'canvas topology snapshot'],
    stateSignals: ['source files', 'FloatingPanel Chat', 'AGENTIC_OS validation', 'Canvas apply'],
    sourceFileCount: 2,
    hasGraphData: true,
    hasSelection: true,
    hasWorkspaceDocument: true,
  })
  if (chatPlan.status !== 'selected' || chatPlan.selectedVdeoxplnId !== AGENTIC_OS_VDEOXPLN_IDS.chatToCanvas) {
    throw new Error(`expected chat-to-canvas routing plan, got ${JSON.stringify(chatPlan)}`)
  }
  if (!String(chatPlan.semanticRunKey || '').startsWith('kgvx_')) {
    throw new Error(`expected chat-to-canvas plan to expose semantic run key, got ${chatPlan.semanticRunKey}`)
  }
  const stageIds = new Set((chatPlan.executionStages || []).map((stage: { id?: string }) => stage.id))
  for (const required of ['source-backed-artifact', 'source-files', 'floating-panel-chat', 'agentic-os-validation', 'canvas-apply']) {
    if (!stageIds.has(required)) throw new Error(`expected chat-to-canvas plan to include ${required}`)
  }
  const prompt = buildAgenticGraphVdeoxplnChatSystemPrompt(chatPlan)
  if (
    !prompt.includes('FloatingPanel Chat harness')
    || !prompt.includes('Do not infer vdeoxpln selection from route names')
    || !prompt.includes(chatPlan.semanticRunKey)
  ) {
    throw new Error(`expected chat system prompt to carry routing guardrails, got ${prompt}`)
  }

  const requestOwner = fs.readFileSync(path.resolve(process.cwd(), 'src/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest.ts'), 'utf8')
  if (!requestOwner.includes('buildAgenticGraphVdeoxplnRoutingPlan') || !requestOwner.includes('buildAgenticGraphVdeoxplnChatSystemPrompt')) {
    throw new Error('expected FloatingPanel Chat request owner to inject the selected vdeoxpln contract prompt')
  }
  const finalizeOwner = fs.readFileSync(path.resolve(process.cwd(), 'src/features/chat/floatingPanelChat/useFinalizeAssistantSuccess.ts'), 'utf8')
  if (finalizeOwner.includes('RunManifest') || finalizeOwner.includes('agentic-graph-vdeoxpln-chat-artifacts')) {
    throw new Error('expected FloatingPanel Chat finalization to keep canonical AGENTIC_OS files free of auxiliary run manifests')
  }
  const artifactOwnerPath = path.resolve(process.cwd(), 'src/features/chat/agentic-graph-vdeoxpln-chat-artifacts.ts')
  if (fs.existsSync(artifactOwnerPath)) {
    throw new Error('expected obsolete vdeoxpln chat artifact helper to be removed')
  }
  const contractOwner = fs.readFileSync(path.resolve(process.cwd(), 'src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs'), 'utf8')
  for (const stale of ['agentic-graph-vdeoxpln-chat-artifacts', 'buildAgenticGraphVdeoxplnRunManifestMarkdown', 'agentic-graph-vdeoxpln-run/v1']) {
    if (contractOwner.includes(stale)) throw new Error(`expected vdeoxpln contract to avoid stale canonical manifest owner ${stale}`)
  }
}
