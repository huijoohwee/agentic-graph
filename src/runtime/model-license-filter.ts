import type { Rejection } from '../bundle/bundle-types'

type WorkersAiModel = Readonly<{
  id: string
  providerId: string
  license: string
  path: 'workers-ai-free' | 'workers-ai-free-overflow'
  metered: true
  freeDailyNeuronLimit: number
}>

export type ModelDeclaration = WorkersAiModel

export function readModelDeclaration(catalogJson: string, modelId: string): ModelDeclaration | Rejection {
  const catalog = readCatalog(catalogJson)
  if ('kind' in catalog) return catalog
  return catalog.find((model) => model.id === modelId)
    ?? { kind: 'rejected', reason: 'model-unconfigured', details: { modelId } }
}

export function permittedModelSet(
  catalogJson: string,
  permittedLicensesJson: string,
): readonly WorkersAiModel[] | Rejection {
  const licenses = readPermittedLicenses(permittedLicensesJson)
  const catalog = readCatalog(catalogJson)
  if ('kind' in licenses || 'kind' in catalog) return configurationUnavailable()
  const allowed = new Set(licenses)
  return Object.freeze(catalog.filter(model => allowed.has(model.license)))
}

export function declaredLicenseIsPermitted(
  declaration: ModelDeclaration,
  permittedLicensesJson: string,
): boolean | Rejection {
  const licenses = readPermittedLicenses(permittedLicensesJson)
  return 'kind' in licenses ? licenses : licenses.includes(declaration.license)
}

function readPermittedLicenses(value: string): readonly string[] | Rejection {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isNonEmptyString)) {
      return configurationUnavailable()
    }
    return Object.freeze([...new Set(parsed)])
  } catch {
    return configurationUnavailable()
  }
}

function readCatalog(catalogJson: string): readonly ModelDeclaration[] | Rejection {
  try {
    const catalog: unknown = JSON.parse(catalogJson)
    if (!Array.isArray(catalog) || catalog.length === 0) return configurationUnavailable()
    const declarations: ModelDeclaration[] = []
    const identifiers = new Set<string>()
    for (const item of catalog) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return configurationUnavailable()
      const record = item as Record<string, unknown>
      if (!isNonEmptyString(record.id) || !isNonEmptyString(record.license) || identifiers.has(record.id)) {
        return configurationUnavailable()
      }
      identifiers.add(record.id)
      if (record.path === 'workers-ai-free' || record.path === 'workers-ai-free-overflow') {
        if (!isNonEmptyString(record.provider_id) || !isPositiveSafeInteger(record.free_daily_neuron_limit)) {
          return configurationUnavailable()
        }
        declarations.push(Object.freeze({
          id: record.id,
          providerId: record.provider_id,
          license: record.license,
          path: record.path,
          metered: true,
          freeDailyNeuronLimit: record.free_daily_neuron_limit,
        }))
        continue
      }
      return configurationUnavailable()
    }
    return Object.freeze(declarations)
  } catch {
    return configurationUnavailable()
  }
}

function configurationUnavailable(): Rejection {
  return { kind: 'rejected', reason: 'license-configuration-unavailable' }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
