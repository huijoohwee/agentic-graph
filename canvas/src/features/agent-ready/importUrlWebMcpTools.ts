import {
  NativeImportUrlMutationError,
  executeStructuredImportUrl,
} from '@/features/chat/nativeImportUrlInvocation'
import { IMPORT_URL_AGENT_READY_TOOL_IDS } from './importUrlAgentReadyContract.mjs'

type ImportUrlWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
}>

type ExecuteStructuredImportUrl = (input: Record<string, unknown>) => Promise<unknown>

export function buildImportUrlWebMcpToolBuilders(
  findContract: (name: string) => ImportUrlWebMcpContract,
  executeImportUrl: ExecuteStructuredImportUrl = executeStructuredImportUrl,
) {
  const contract = findContract(IMPORT_URL_AGENT_READY_TOOL_IDS.controlLocalImportUrl)
  return {
    [IMPORT_URL_AGENT_READY_TOOL_IDS.controlLocalImportUrl]: () => ({
      ...contract,
      name: contract.webName,
      execute: async (input?: Record<string, unknown>) => {
        try {
          return await executeImportUrl(input || {})
        } catch (error) {
          if (error instanceof NativeImportUrlMutationError) return error.failure
          throw error
        }
      },
    }),
  }
}
