import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { createWebMcpToolExposure, WEB_MCP_CORE_TOOL_IDS, WEB_MCP_TOOL_SCOPES,
  WEB_MCP_SCOPE_TOOL_NAME, WEB_MCP_EXPOSURE_BUDGET, measureWebMcpExposure } from '@/features/agent-ready/webMcpToolExposure.mjs'
import { getAgenticGraphWebMcpToolRegistry, installAgenticGraphWebMcpRuntime,
  resetAgenticGraphWebMcpRuntimeForTests } from '@/features/agent-ready/webMcpRuntime'
import { activateAgentRunWorkspace, closeAgentRunInspection, readAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import type { WebMcpTool } from '@/features/agent-ready/webMcpRuntimeTypes'

export function assertWebMcpScopedTools(tools: Array<{ name: string }>) {
  const exposure = createWebMcpToolExposure(getAgenticGraphWebMcpToolRegistry(), () => {})
  const expected = exposure.get(document.documentElement.dataset.kgWebmcpScope)
  if (JSON.stringify(tools) !== JSON.stringify(expected)) throw Error('browser descriptors must match the selected bounded projection')
  if (document.documentElement.dataset.kgWebmcpTools !== tools.map(tool => tool.name).join(',')) throw Error('diagnostics must describe exposed tools')
}
export async function testWebMcpExposureBudgetsAndValidation() {
  const contracts = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true })
  const coverage = [...WEB_MCP_CORE_TOOL_IDS, ...Object.values(WEB_MCP_TOOL_SCOPES).flat()]
  if (new Set(coverage).size !== coverage.length
    || [...coverage].sort().join('|') !== contracts.map(tool => tool.name).sort().join('|')) throw Error('scopes must partition every shared tool exactly once')
  const registry = getAgenticGraphWebMcpToolRegistry()
  let selected = ''
  const exposure = createWebMcpToolExposure(registry, scope => { selected = scope; return { scope } })
  for (const scope of Object.keys(WEB_MCP_TOOL_SCOPES)) {
    const tools: WebMcpTool[] = exposure.get(scope)
    const size = measureWebMcpExposure(tools)
    if (size.tools > WEB_MCP_EXPOSURE_BUDGET.tools || size.bytes > WEB_MCP_EXPOSURE_BUDGET.bytes) throw Error(`${scope} exceeded budget`)
    if (tools !== exposure.get(scope)) throw Error('unchanged exposure must reuse descriptor identities')
    for (const tool of tools.filter(tool => tool.name !== WEB_MCP_SCOPE_TOOL_NAME)) {
      const original = registry.get(tool.name)!
      if (tool.execute !== original.execute || tool.inputSchema !== original.inputSchema
        || tool.outputSchema || tool._meta || tool.securitySchemes) throw Error('projection must retain validation and omit server-only metadata')
    }
  }
  const selector = exposure.get('graph').find(tool => tool.name === WEB_MCP_SCOPE_TOOL_NAME)!
  for (const invalid of [{ scope: 'unknown' }, { scope: 'xr', extra: true }, {}, null, ['xr']]) {
    let rejected = false
    try { await selector.execute(invalid) } catch { rejected = true }
    if (!rejected || selected) throw Error('invalid selection must have no effect')
  }
  await selector.execute({ scope: 'mission' })
  if (selected !== 'mission') throw Error('selector must expose the requested scope')
  const oversized = createWebMcpToolExposure({ get: name => ({ ...registry.get(name), description: 'x'.repeat(32768) }) }, () => {})
  let rejected = false
  try { oversized.get('graph') } catch { rejected = true }
  if (!rejected) throw Error('oversized catalog must fail before registration')
  rejected = false
  try { await registry.execute('agentic-graph.control_local_canvas_view', { unexpected: true }) } catch { rejected = true }
  if (!rejected) throw Error('scoping must preserve full input validation before lazy executor loading')
}
export async function testWebMcpActiveWorkspaceScopes() {
  const { restore } = initJsdomHarness()
  const previous = useGraphStore.getState()
  try {
    resetAgenticGraphWebMcpRuntimeForTests(); closeAgentRunInspection()
    useGraphStore.setState({ workspaceViewMode: 'canvas', canvasRenderMode: '2d', floatingPanelOpen: false })
    const nav = window.navigator as Navigator & { modelContext?: { tools: WebMcpTool[] } }
    Reflect.deleteProperty(nav, 'modelContext'); Reflect.deleteProperty(document, 'modelContext')
    installAgenticGraphWebMcpRuntime()
    const context = nav.modelContext!
    if (document.documentElement.dataset.kgWebmcpScope !== 'graph') throw Error('canvas should expose graph tools')
    await context.tools.find(tool => tool.name === WEB_MCP_SCOPE_TOOL_NAME)!.execute({ scope: 'storage' })
    useGraphStore.setState({ markdownDocumentName: 'unrelated-update' })
    if (String(document.documentElement.dataset.kgWebmcpScope) !== 'storage') throw Error('unrelated updates must not restart discovery')
    activateAgentRunWorkspace('tree', 'editor', '/.workspace/previous/agent-mission.md')
    if (readAgentRunWorkspace()?.source !== '/.workspace/previous/agent-mission.md') throw Error('explicit source selection must remain available')
    activateAgentRunWorkspace('tree')
    if (readAgentRunWorkspace()?.source !== undefined) throw Error('fresh invocation must resolve the current mission manifest')
    if (String(document.documentElement.dataset.kgWebmcpScope) !== 'mission'
      || !context.tools.some(tool => tool.name === 'agentic-graph.run.trace')
      || context.tools.some(tool => tool.name === 'agentic-graph.control_local_file_sync')) throw Error('mission must replace inactive tools')
    const names = context.tools.map(tool => tool.name).join(',')
    installAgenticGraphWebMcpRuntime()
    if (nav.modelContext !== context || context.tools.map(tool => tool.name).join(',') !== names) throw Error('resume must reuse context')
    closeAgentRunInspection()
    if (String(document.documentElement.dataset.kgWebmcpScope) !== 'graph') throw Error('closing mission must restore graph discovery')
  } finally {
    resetAgenticGraphWebMcpRuntimeForTests(); closeAgentRunInspection(); useGraphStore.setState(previous); restore()
  }
}
