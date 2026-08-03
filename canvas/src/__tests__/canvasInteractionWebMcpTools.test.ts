import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { buildCanvasInteractionWebMcpToolBuilders } from '@/features/agent-ready/canvasInteractionWebMcpTools'
import {
  CANVAS_INTERACTION_BINDING_TOKEN,
  CANVAS_INTERACTION_COMMAND_TOKEN,
  CANVAS_INTERACTION_MCP_TOOL_NAME,
  CANVAS_INTERACTION_SEMANTIC_TOKEN,
  buildCanvasInteractionInvocation,
} from '@/lib/canvas/canvasInteractionInvocationContract.mjs'
import {
  executeCanvasInteractionControl,
  registerCanvasInteractionControlHandler,
} from '@/lib/canvas/canvasInteractionControlRuntime'

export async function testInteractionRowsUseSourceBackedWebMcpInvocation(): Promise<void> {
  const contracts = buildKnowgrphAgentReadyToolContracts({
    defaultWorkspaceId: 'kgws:test',
    includeBrowserOnlyTools: true,
  })
  const toolId = KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalCanvasInteraction
  const contract = contracts.find(candidate => candidate.name === toolId)
  if (!contract || contract.webName !== CANVAS_INTERACTION_MCP_TOOL_NAME) {
    throw new Error('expected the shared agent-ready contract to expose the Canvas Interaction WebMCP owner')
  }
  if (contract.annotations?.idempotentHint !== true || contract.annotations?.readOnlyHint !== false) {
    throw new Error('expected explicit Canvas Interaction targets to be idempotent local mutations')
  }
  const ajv = new Ajv2020({ strict: false })
  const validateInput = ajv.compile(contract.inputSchema)
  const validateOutput = ajv.compile(contract.outputSchema)
  const invocation = buildCanvasInteractionInvocation('runMode:auto')
  if (!validateInput({ invocation }) || !validateInput({ optionId: 'runMode:auto' })) {
    throw new Error(`expected both canonical Canvas Interaction inputs to validate: ${JSON.stringify(validateInput.errors)}`)
  }
  if (validateInput({ optionId: 'runMode:toggle' }) || validateInput({ invocation, optionId: 'runMode:auto' })) {
    throw new Error('expected unknown or ambiguous Canvas Interaction control input to fail schema validation')
  }

  const calls: Record<string, unknown>[] = []
  const expected = { ok: true }
  const tool = buildCanvasInteractionWebMcpToolBuilders(
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
  if (tool.name !== CANVAS_INTERACTION_MCP_TOOL_NAME || result !== expected || calls.length !== 1) {
    throw new Error('expected Canvas Interaction WebMCP to delegate exactly once to the canonical runtime')
  }

  const applied: string[] = []
  const unregister = registerCanvasInteractionControlHandler(optionId => applied.push(optionId))
  try {
    const runtimeResult = executeCanvasInteractionControl({ invocation })
    if (
      runtimeResult.optionId !== 'runMode:auto'
      || runtimeResult.invocation !== invocation
      || runtimeResult.mcpTool !== CANVAS_INTERACTION_MCP_TOOL_NAME
      || applied.join(',') !== 'runMode:auto'
      || !validateOutput(runtimeResult)
    ) {
      throw new Error(`expected the canonical Interaction owner to apply the invocation, got ${JSON.stringify(runtimeResult)}`)
    }
    for (const invalidInput of [{}, { invocation, optionId: 'runMode:auto' }]) {
      let rejected = false
      try {
        executeCanvasInteractionControl(invalidInput)
      } catch {
        rejected = true
      }
      if (!rejected) throw new Error('expected the Canvas Interaction runtime to reject ambiguous or empty input')
    }
  } finally {
    unregister()
  }

  const interactionSource = readFileSync(resolve(process.cwd(), 'src/components/toolbar/InteractionModeSelect.tsx'), 'utf8')
  for (const required of [
    'SelectableRowValue',
    'buildCanvasInteractionInvocation',
    'CANVAS_INTERACTION_MCP_TOOL_NAME',
    'registerCanvasInteractionControlHandler',
    "'viewLock:on'",
    "'selectMode:multi'",
    "'canvasInteraction:interactive'",
    "'runMode:auto'",
  ]) {
    if (!interactionSource.includes(required)) {
      throw new Error(`expected Interaction rows to reuse the canonical invocation owner: ${required}`)
    }
  }

  const docsRoot = resolve(process.cwd(), '..', '..', 'agentic-canvas-os', 'docs')
  const sourceContracts = [
    ['DICTIONARY-COMMAND.md', CANVAS_INTERACTION_COMMAND_TOKEN, CANVAS_INTERACTION_MCP_TOOL_NAME],
    ['DICTIONARY-SEMANTIC.md', CANVAS_INTERACTION_SEMANTIC_TOKEN, 'semantic, visible, and hit-testable'],
    ['DICTIONARY-BINDING.md', CANVAS_INTERACTION_BINDING_TOKEN, 'active browser-local Canvas control surface'],
  ] as const
  for (const [fileName, token, marker] of sourceContracts) {
    const source = readFileSync(resolve(docsRoot, fileName), 'utf8')
    if (!source.includes(`  - "${token}"`) || !source.includes(`| \`${token}\` |`) || !source.includes(marker)) {
      throw new Error(`expected ${fileName} to own ${token} and its runtime contract`)
    }
  }
}
