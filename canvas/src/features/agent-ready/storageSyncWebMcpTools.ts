import {
  controlLocalFileSync,
  controlLocalGitRepository,
  inspectLocalFileSync,
  inspectLocalGitRepository,
} from '@/lib/storage/agentic-graph-storage-browser-runtime'
import { STORAGE_SYNC_AGENT_READY_TOOL_IDS } from './storageSyncAgentReadyContract.mjs'

type StorageSyncWebMcpContract = Readonly<{
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}>

type StorageSyncWebMcpTool = StorageSyncWebMcpContract & Readonly<{
  name: string
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}>

const buildTool = (
  contract: StorageSyncWebMcpContract,
  execute: StorageSyncWebMcpTool['execute'],
): StorageSyncWebMcpTool => ({
  ...contract,
  name: contract.webName,
  execute,
})

export function buildStorageSyncWebMcpToolBuilders(
  findContract: (name: string) => StorageSyncWebMcpContract,
): Record<string, () => StorageSyncWebMcpTool> {
  const inspectGit = findContract(STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalGitRepository)
  const controlGit = findContract(STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalGitRepository)
  const inspectFileSync = findContract(STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalFileSync)
  const controlFileSync = findContract(STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalFileSync)
  return {
    [STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalGitRepository]: () =>
      buildTool(inspectGit, async () => inspectLocalGitRepository()),
    [STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalGitRepository]: () =>
      buildTool(controlGit, async input => controlLocalGitRepository(input || {})),
    [STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalFileSync]: () =>
      buildTool(inspectFileSync, async () => inspectLocalFileSync()),
    [STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalFileSync]: () =>
      buildTool(controlFileSync, async input => controlLocalFileSync(input || {})),
  }
}
