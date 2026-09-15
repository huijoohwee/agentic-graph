import { DURABLE_RUN_AGENT_READY_TOOL_IDS } from './durableRunAgentReadyContract.mjs'
import type { AgentReadyToolContract, WebMcpTool } from './webMcpRuntimeTypes'

type ExecuteRun = (operation: string, input: Record<string, unknown>) => Promise<unknown>
const executeRun: ExecuteRun = async (operation, input) => (
  (await import('./durableRunTransport')).invokeDurableRun(operation, input)
)

export function buildDurableRunWebMcpToolBuilders(
  findContract: (name: string) => AgentReadyToolContract,
  execute: ExecuteRun = executeRun,
): Record<string, () => WebMcpTool> {
  return Object.fromEntries(Object.values(DURABLE_RUN_AGENT_READY_TOOL_IDS).map((name: string) => {
    const contract = findContract(name)
    return [name, () => ({ ...contract, name: contract.webName,
      execute: (input?: Record<string, unknown>) => execute(name.slice('run.'.length), input ?? {}),
    })]
  }))
}
