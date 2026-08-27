import { getAgenticGraphRuntimeIdentity } from '@/features/runtime-identity/agenticgraphRuntimeIdentity'
import { getAgenticGraphRuntimeIdentityGateSnapshot } from '@/features/runtime-identity/runtimeIdentityAttestationStore'

type RuntimeIdentityToolContract = {
  webName: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
}

export const buildReadLocalRuntimeIdentityTool = (contract: RuntimeIdentityToolContract) => ({
  name: contract.webName,
  title: contract.title,
  description: contract.description,
  inputSchema: contract.inputSchema,
  annotations: contract.annotations,
  execute: async () => ({
    identity: getAgenticGraphRuntimeIdentity(),
    gate: getAgenticGraphRuntimeIdentityGateSnapshot(),
  }),
})
