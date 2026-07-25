import type { FlowDetails } from './types'

export type FlowDetailsLoadResult = {
  status: 'ready' | 'unavailable'
  details: Record<string, FlowDetails>
  error?: string
}

type FlowDetailsModule = { default?: unknown }
type FlowDetailsImporter = () => Promise<FlowDetailsModule>

function normalizeDetails(value: unknown): Record<string, FlowDetails> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Responsibility details projection is not an object')
  }
  return value as Record<string, FlowDetails>
}

export function createFlowDetailsLoader(importer: FlowDetailsImporter) {
  let pending: Promise<FlowDetailsLoadResult> | null = null

  return function loadFlowDetails(): Promise<FlowDetailsLoadResult> {
    pending ??= importer()
      .then(module => ({
        status: 'ready' as const,
        details: normalizeDetails(module.default),
      }))
      .catch(error => {
        pending = null
        return {
          status: 'unavailable' as const,
          details: {},
          error: error instanceof Error ? error.message : String(error),
        }
      })
    return pending
  }
}
