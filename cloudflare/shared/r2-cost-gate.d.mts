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
}

export interface ZeroCostR2BindingOptions {
  bindingName: string
  resourceName: string
  verifyProviderCostEvidence?: ProviderCostEvidenceVerifier
  database?: { prepare: (...args: unknown[]) => unknown }
  quotaLimits?: Partial<R2FreeQuotaLimits>
  maxStreamBytes?: number
}

export type ZeroCostR2GateStatus = 'guarded' | 'blocked'

export function createZeroCostR2Binding<T>(
  bucket: T,
  options?: ZeroCostR2BindingOptions,
): T

export function withZeroCostR2Bindings<T extends object>(
  env: T,
  bindingResources: Record<string, string>,
): T

export function getZeroCostR2GateStatus(bucket: unknown): ZeroCostR2GateStatus | null
