import { resolvePinnedAgenticDocsRoot } from '@/tests/lib/repoTestData'
import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAgenticGraphAgentReadyToolContracts,
  AGENTIC_OS_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { buildCanvasViewWebMcpToolBuilders } from '@/features/agent-ready/canvasViewWebMcpTools'
import {
  CANVAS_VIEW_BINDING_TOKEN,
  CANVAS_VIEW_COMMAND_TOKEN,
  CANVAS_VIEW_MCP_TOOL_NAME,
  CANVAS_VIEW_SEMANTIC_TOKEN,
  buildCanvasViewInvocation,
} from '@/lib/canvas/canvasViewInvocationContract.mjs'
import {
  executeCanvasViewControl,
  registerCanvasViewControlHandler,
} from '@/lib/canvas/canvasViewControlRuntime'

export async function testCanvasViewRowsUseSourceBackedWebMcpInvocation(): Promise<void> {
  const contracts = buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: 'kgws:test',
    includeBrowserOnlyTools: true,
  })
  const toolId = AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalCanvasView
  const contract = contracts.find(candidate => candidate.name === toolId)
  if (!contract || contract.webName !== CANVAS_VIEW_MCP_TOOL_NAME) {
    throw new Error('expected the shared agent-ready contract to expose the Canvas View WebMCP owner')
  }
  const validateInput = new Ajv2020({ strict: false }).compile(contract.inputSchema)
  const invocation = buildCanvasViewInvocation('renderer:storyboard')
  if (!validateInput({ invocation }) || !validateInput({ optionId: 'renderer:storyboard' })) {
    throw new Error(`expected both canonical Canvas View inputs to validate: ${JSON.stringify(validateInput.errors)}`)
  }
  if (validateInput({ optionId: 'renderer:unknown' }) || validateInput({ optionId: 'agent-run:timing' }) || validateInput({ invocation, optionId: 'renderer:storyboard' })) {
    throw new Error('expected unknown or ambiguous Canvas View control input to fail schema validation')
  }

  const calls: Record<string, unknown>[] = []
  const expected = { ok: true }
  const tool = buildCanvasViewWebMcpToolBuilders(
    name => {
      const found = contracts.find(candidate => candidate.name === name)
      if (!found) throw new Error(`missing test contract ${name}`)
      return found
    },
    input => {
      calls.push(input)
      return expected
    },
  )[toolId]()
  const result = await tool.execute({ invocation })
  if (tool.name !== CANVAS_VIEW_MCP_TOOL_NAME || result !== expected || calls.length !== 1) {
    throw new Error('expected Canvas View WebMCP to delegate exactly once to the canonical runtime')
  }

  const applied: string[] = []
  const unregister = registerCanvasViewControlHandler(optionId => applied.push(optionId))
  try {
    let rejected = false
    try { executeCanvasViewControl({ invocation: '/canvas.view.set #canvas-view @canvas-view option=agent-run:timing' }) } catch { rejected = true }
    if (!rejected || applied.length) throw new Error('The removed Timing view must not execute through Chat or MCP')
    for (const optionId of ['renderer:dashboard', 'agent-run:tree']) {
      executeCanvasViewControl({ invocation: buildCanvasViewInvocation(optionId) })
    }
    if (applied.join(',') !== 'renderer:dashboard,agent-run:tree') throw Error('Dashboard and Mission views must share the native invocation owner')
    applied.length = 0
    const runtimeResult = executeCanvasViewControl({ invocation })
    if (
      runtimeResult.optionId !== 'renderer:storyboard'
      || runtimeResult.invocation !== invocation
      || runtimeResult.mcpTool !== CANVAS_VIEW_MCP_TOOL_NAME
      || applied.join(',') !== 'renderer:storyboard'
    ) {
      throw new Error(`expected the canonical Canvas View owner to apply the invocation, got ${JSON.stringify(runtimeResult)}`)
    }
  } finally {
    unregister()
  }

  const docsRoot = await resolvePinnedAgenticDocsRoot()
  const sourceContracts = [
    ['DICTIONARY-COMMAND.md', CANVAS_VIEW_COMMAND_TOKEN, CANVAS_VIEW_MCP_TOOL_NAME],
    ['DICTIONARY-SEMANTIC.md', CANVAS_VIEW_SEMANTIC_TOKEN, 'Semantic Canvas View Mode'],
    ['DICTIONARY-BINDING.md', CANVAS_VIEW_BINDING_TOKEN, 'Canvas View Mode control surface'],
  ] as const
  for (const [fileName, token, marker] of sourceContracts) {
    const source = readFileSync(resolve(docsRoot, fileName), 'utf8')
    if (!source.includes(`  - "${token}"`) || !source.includes(`| \`${token}\` |`) || !source.includes(marker)) {
      throw new Error(`expected ${fileName} to own ${token} and its runtime contract`)
    }
  }
}

export async function testDesignInspectionParity(): Promise<void> {
  const assert = (await import('node:assert/strict')).default
  const { buildDesignContext } = await import('@/features/design/designContext')
  const { inspectLocalCanvasTopology } = await import('@/features/agent-ready/localCanvasTopologyInspection')
  const graphData = { type: 'Graph' as const, nodes: [{ id: 'design-card', properties: { fill: '#ffffff' } }], edges: [] }
  const markdown = '---\ndesign:\n  intent: Readable local review\n---'
  const context = buildDesignContext({ active: true, graphData, graphRevision: 1,
    markdown, documentName: 'design.md', theme: 'dark' })
  const inspection = inspectLocalCanvasTopology({ graphData, graphDataRevision: 1,
    markdownDocumentText: markdown, markdownDocumentName: 'design.md', canvasRenderMode: '2d',
    canvas2dRenderer: 'design', theme: 'dark' })
  assert.deepEqual(inspection.design, context)
  assert.equal(inspectLocalCanvasTopology({ graphData, graphDataRevision: 1,
    canvasRenderMode: '2d', canvas2dRenderer: 'd3' }).design.status, 'inactive')
  const contracts = buildAgenticGraphAgentReadyToolContracts({ defaultWorkspaceId: 'kgws:test', includeBrowserOnlyTools: true })
  const inspectContract = contracts.find(c => c.name === AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology)!
  assert.equal(new Ajv2020({ strict: false }).compile(inspectContract.outputSchema!)(inspection), true)
  const viewContract = contracts.find(c => c.name === AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalCanvasView)!
  let option = ''
  const cleanup = registerCanvasViewControlHandler(next => { option = next })
  try {
    const builders = buildCanvasViewWebMcpToolBuilders(() => viewContract)
    const tool = builders[AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalCanvasView]()
    await tool.execute({ invocation: buildCanvasViewInvocation('renderer:design') })
    assert.equal(option, 'renderer:design')
    await tool.execute({ optionId: 'renderer:design' })
    assert.equal(option, 'renderer:design')
    await assert.rejects(() => tool.execute({ invocation: '/design' }))
  } finally { cleanup() }
}
