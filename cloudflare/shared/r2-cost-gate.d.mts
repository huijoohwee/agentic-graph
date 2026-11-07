export type ProviderCostEvidenceVerifier = (
  request: Readonly<Record<string, unknown>>,
) => unknown | Promise<unknown>

export interface R2FreeQuotaLimits {
  classA: number
  classB: number
  uploadedBytesLifetime: number
  reservationsPerDay: number
}

export interface R2FreeQuotaVerifier {
  verify: (request: Readonly<Record<string, unknown>>, operation: { method: string; args: unknown[] }) => unknown | Promise<unknown>
  maxStreamBytes?: number
  release?: (scopeDigest: string, actualBytes: number) => Promise<boolean>
}

export interface ZeroCostR2BindingOptions {
  bindingName: string
  resourceName: string
  verifyProviderCostEvidence?: ProviderCostEvidenceVerifier | R2FreeQuotaVerifier
  database?: { prepare: (...args: unknown[]) => unknown }
  quotaLimits?: Partial<R2FreeQuotaLimits>
  maxStreamBytes?: number
  quotaLedger?: boolean
}

export type ZeroCostR2GateStatus = 'guarded' | 'quota-ledger' | 'blocked'

export function createZeroCostR2Binding<T>(
  bucket: T,
  options?: ZeroCostR2BindingOptions,
): T

export function withZeroCostR2Bindings<T extends object>(
  env: T,
  bindingResources: Record<string, string>,
): T

export function getZeroCostR2GateStatus(bucket: unknown): ZeroCostR2GateStatus | null
