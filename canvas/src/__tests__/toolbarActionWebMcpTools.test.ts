import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAgenticGraphAgentReadyToolContracts,
  AGENTIC_OS_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { buildToolbarActionWebMcpToolBuilders } from '@/features/agent-ready/toolbarActionWebMcpTools'
import {
  TOOLBAR_ACTION_BINDING_TOKEN,
  TOOLBAR_ACTION_COMMAND_TOKEN,
  TOOLBAR_ACTION_MCP_TOOL_NAME,
  TOOLBAR_ACTION_SEMANTIC_TOKEN,
  buildToolbarActionInvocation,
} from '@/lib/toolbar/toolbarActionInvocationContract.mjs'
import {
  executeToolbarActionControl,
  registerToolbarActionControlHandler,
} from '@/lib/toolbar/toolbarActionControlRuntime'

export async function testMainToolbarActionsUseSourceBackedWebMcpInvocation(): Promise<void> {
  const contracts = buildAgenticGraphAgentReadyToolContracts({ defaultWorkspaceId: 'kgws:test', includeBrowserOnlyTools: true })
  const toolId = AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalToolbarAction
  const contract = contracts.find(candidate => candidate.name === toolId)
  if (!contract || contract.webName !== TOOLBAR_ACTION_MCP_TOOL_NAME) {
    throw new Error('expected the shared agent-ready contract to expose the Main Toolbar WebMCP owner')
  }
  const ajv = new Ajv2020({ strict: false })
  const validateInput = ajv.compile(contract.inputSchema)
  const validateOutput = ajv.compile(contract.outputSchema)
  const invocation = buildToolbarActionInvocation('chat:open')
  if (!validateInput({ invocation }) || !validateInput({ actionId: 'settings:open' })) {
    throw new Error(`expected canonical Main Toolbar inputs to validate: ${JSON.stringify(validateInput.errors)}`)
  }
  if (validateInput({ actionId: 'toolbar:unknown' }) || validateInput({ invocation, actionId: 'chat:open' })) {
    throw new Error('expected unknown or ambiguous Main Toolbar input to fail schema validation')
  }

  const calls: Record<string, unknown>[] = []
  const expected = { ok: true }
  const tool = buildToolbarActionWebMcpToolBuilders(
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
  const delegated = await tool.execute({ invocation })
  if (tool.name !== TOOLBAR_ACTION_MCP_TOOL_NAME || delegated !== expected || calls.length !== 1) {
    throw new Error('expected Main Toolbar WebMCP to delegate exactly once to the canonical runtime')
  }

  const applied: string[] = []
  const unregister = registerToolbarActionControlHandler(actionId => {
    applied.push(actionId)
    return { status: 'applied', message: 'Opened Chat.' }
  })
  try {
    const result = await executeToolbarActionControl({ invocation })
    if (
      result.actionId !== 'chat:open'
      || result.status !== 'applied'
      || result.invocation !== invocation
      || result.mcpTool !== TOOLBAR_ACTION_MCP_TOOL_NAME
      || applied.join(',') !== 'chat:open'
      || !validateOutput(result)
    ) {
      throw new Error(`expected the canonical Main Toolbar owner to return an applied result, got ${JSON.stringify(result)}`)
    }
  } finally {
    unregister()
  }

  const source = [
    readFileSync(resolve(process.cwd(), 'src/components/Toolbar.tsx'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/features/history/HistoryUndoRedoControls.tsx'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/lib/toolbar/toolbarActionAffordance.ts'), 'utf8'),
  ].join('\n')
  for (const required of [
    "toolbarActionAffordance('settings:open')",
    "toolbarActionAffordance('workflow:runAll')",
    "toolbarActionAffordance('history:undo')",
    "toolbarActionAffordance('chat:open')",
    "'data-kg-selection-affordance': 'toolbar-action'",
    'registerToolbarActionControlHandler',
  ]) {
    if (!source.includes(required)) throw new Error(`expected Main Toolbar buttons to expose the shared semantic invocation owner: ${required}`)
  }

  const docsRoot = resolve(process.cwd(), '..', '..', 'agentic-canvas-os', 'docs')
  const sourceContracts = [
    ['DICTIONARY-COMMAND.md', TOOLBAR_ACTION_COMMAND_TOKEN, TOOLBAR_ACTION_MCP_TOOL_NAME],
    ['DICTIONARY-SEMANTIC.md', TOOLBAR_ACTION_SEMANTIC_TOKEN, 'visible and hit-testable'],
    ['DICTIONARY-BINDING.md', TOOLBAR_ACTION_BINDING_TOKEN, 'Main Toolbar'],
  ] as const
  for (const [fileName, token, marker] of sourceContracts) {
    const docsSource = readFileSync(resolve(docsRoot, fileName), 'utf8')
    if (!docsSource.includes(`  - "${token}"`) || !docsSource.includes(`| \`${token}\` |`) || !docsSource.includes(marker)) {
      throw new Error(`expected ${fileName} to own ${token} and its Main Toolbar runtime contract`)
    }
  }
}
