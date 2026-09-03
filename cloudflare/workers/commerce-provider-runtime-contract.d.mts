export type CommerceProviderRuntimeSpec = Readonly<{
  id: 'discovery' | 'checkout' | 'marketplace'
  contract: string
  storageRevision: string
  checks: readonly string[]
  capabilities: Readonly<Record<string, unknown>>
}>

export const COMMERCE_PROVIDER_RUNTIME_SPECS: Readonly<Record<
  CommerceProviderRuntimeSpec['id'],
  CommerceProviderRuntimeSpec
>>
