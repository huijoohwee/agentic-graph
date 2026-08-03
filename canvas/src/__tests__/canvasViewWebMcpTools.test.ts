import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
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
  const contracts = buildKnowgrphAgentReadyToolContracts({
    defaultWorkspaceId: 'kgws:test',
    includeBrowserOnlyTools: true,
  })
  const toolId = KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalCanvasView
  const contract = contracts.find(candidate => candidate.name === toolId)
  if (!contract || contract.webName !== CANVAS_VIEW_MCP_TOOL_NAME) {
    throw new Error('expected the shared agent-ready contract to expose the Canvas View WebMCP owner')
  }
  const validateInput = new Ajv2020({ strict: false }).compile(contract.inputSchema)
  const invocation = buildCanvasViewInvocation('renderer:storyboard')
  if (!validateInput({ invocation }) || !validateInput({ optionId: 'renderer:storyboard' })) {
    throw new Error(`expected both canonical Canvas View inputs to validate: ${JSON.stringify(validateInput.errors)}`)
  }
  if (validateInput({ optionId: 'renderer:unknown' }) || validateInput({ invocation, optionId: 'renderer:storyboard' })) {
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

  const docsRoot = resolve(process.cwd(), '..', '..', 'agentic-canvas-os', 'docs')
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
