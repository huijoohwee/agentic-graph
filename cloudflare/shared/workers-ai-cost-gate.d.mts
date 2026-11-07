export type ProviderCostEvidenceVerifier = (
  request: Readonly<Record<string, unknown>>,
) => unknown | Promise<unknown>

export interface ZeroCostWorkersAiBindingOptions {
  bindingName: string
  verifyProviderCostEvidence?: ProviderCostEvidenceVerifier
}

export function createZeroCostWorkersAiBinding<T>(
  binding: T,
  options: ZeroCostWorkersAiBindingOptions,
): T
