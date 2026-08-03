import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { buildWorkspaceLaunchWebMcpToolBuilders } from '@/features/agent-ready/workspaceLaunchWebMcpTools'
import {
  WORKSPACE_LAUNCH_BINDING_TOKEN,
  WORKSPACE_LAUNCH_COMMAND_TOKEN,
  WORKSPACE_LAUNCH_MCP_TOOL_NAME,
  WORKSPACE_LAUNCH_SEMANTIC_TOKEN,
  buildWorkspaceLaunchInvocation,
} from '@/lib/toolbar/workspaceLaunchInvocationContract.mjs'
import {
  executeWorkspaceLaunchControl,
  registerWorkspaceLaunchControlHandler,
} from '@/lib/toolbar/workspaceLaunchControlRuntime'

export async function testLaunchRowsUseSourceBackedWebMcpInvocation(): Promise<void> {
  const contracts = buildKnowgrphAgentReadyToolContracts({ defaultWorkspaceId: 'kgws:test', includeBrowserOnlyTools: true })
  const toolId = KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalWorkspaceLaunch
  const contract = contracts.find(candidate => candidate.name === toolId)
  if (!contract || contract.webName !== WORKSPACE_LAUNCH_MCP_TOOL_NAME) {
    throw new Error('expected the shared agent-ready contract to expose the Workspace Launch WebMCP owner')
  }
  const ajv = new Ajv2020({ strict: false })
  const validateInput = ajv.compile(contract.inputSchema)
  const validateOutput = ajv.compile(contract.outputSchema)
  const invocation = buildWorkspaceLaunchInvocation('importLocalFiles:choose')
  if (!validateInput({ invocation }) || !validateInput({ optionId: 'workflowManager:open' })) {
    throw new Error(`expected canonical Workspace Launch inputs to validate: ${JSON.stringify(validateInput.errors)}`)
  }
  if (validateInput({ optionId: 'launch:unknown' }) || validateInput({ invocation, optionId: 'importLocalFiles:choose' })) {
    throw new Error('expected unknown or ambiguous Workspace Launch input to fail schema validation')
  }

  const calls: Record<string, unknown>[] = []
  const expected = { ok: true }
  const tool = buildWorkspaceLaunchWebMcpToolBuilders(
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
  if (tool.name !== WORKSPACE_LAUNCH_MCP_TOOL_NAME || delegated !== expected || calls.length !== 1) {
    throw new Error('expected Workspace Launch WebMCP to delegate exactly once to the canonical runtime')
  }

  const applied: string[] = []
  const unregister = registerWorkspaceLaunchControlHandler(optionId => {
    applied.push(optionId)
    return { status: 'requested-user-input', message: 'Choose files.' }
  })
  try {
    const result = await executeWorkspaceLaunchControl({ invocation })
    if (
      result.optionId !== 'importLocalFiles:choose'
      || result.status !== 'requested-user-input'
      || result.invocation !== invocation
      || result.mcpTool !== WORKSPACE_LAUNCH_MCP_TOOL_NAME
      || applied.join(',') !== 'importLocalFiles:choose'
      || !validateOutput(result)
    ) {
      throw new Error(`expected the canonical Launch owner to return typed user-input status, got ${JSON.stringify(result)}`)
    }
  } finally {
    unregister()
  }

  const sourceRoot = resolve(process.cwd(), 'src/lib/toolbar')
  const source = [
    'LaunchDropdown.impl.tsx',
    'LaunchDropdownImportUrlItem.tsx',
    'LaunchDropdownExportMenu.tsx',
  ].map(fileName => readFileSync(resolve(sourceRoot, fileName), 'utf8')).join('\n')
  for (const required of [
    'WorkspaceLaunchRowValue',
    'registerWorkspaceLaunchControlHandler',
    'optionId="home:open"',
    'optionId="importUrl:configure"',
    'optionId="newMarkdown:create"',
    'optionId="save:current"',
    'optionId="export:configure"',
    'optionId="status:open"',
  ]) {
    if (!source.includes(required)) throw new Error(`expected Launch rows to expose the shared invocation owner: ${required}`)
  }

  const docsRoot = resolve(process.cwd(), '..', '..', 'agentic-canvas-os', 'docs')
  const sourceContracts = [
    ['DICTIONARY-COMMAND.md', WORKSPACE_LAUNCH_COMMAND_TOKEN, WORKSPACE_LAUNCH_MCP_TOOL_NAME],
    ['DICTIONARY-SEMANTIC.md', WORKSPACE_LAUNCH_SEMANTIC_TOKEN, 'visible and hit-testable'],
    ['DICTIONARY-BINDING.md', WORKSPACE_LAUNCH_BINDING_TOKEN, 'Launch, Canvas View, and Interaction'],
  ] as const
  for (const [fileName, token, marker] of sourceContracts) {
    const docsSource = readFileSync(resolve(docsRoot, fileName), 'utf8')
    if (!docsSource.includes(`  - "${token}"`) || !docsSource.includes(`| \`${token}\` |`) || !docsSource.includes(marker)) {
      throw new Error(`expected ${fileName} to own ${token} and its Launch runtime contract`)
    }
  }
}
