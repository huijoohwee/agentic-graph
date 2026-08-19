import type { Rejection } from '../bundle/bundle-types'

type WorkersAiModel = Readonly<{
  id: string
  license: string
  path: 'workers-ai'
  metered: true
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}>

type ContainerModel = Readonly<{
  id: string
  license: string
  path: 'containers-ollama'
  metered: true
  estimatedUsdPerCall: number
}>

export type ModelDeclaration = WorkersAiModel | ContainerModel

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
  return Object.freeze(catalog.filter(
    (model): model is WorkersAiModel => model.path === 'workers-ai' && allowed.has(model.license),
  ))
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
      if (record.path === 'workers-ai') {
        if (!isPositiveFinite(record.input_usd_per_million) || !isPositiveFinite(record.output_usd_per_million)) {
          return configurationUnavailable()
        }
        declarations.push(Object.freeze({
          id: record.id,
          license: record.license,
          path: record.path,
          metered: true,
          inputUsdPerMillion: record.input_usd_per_million,
          outputUsdPerMillion: record.output_usd_per_million,
        }))
        continue
      }
      if (record.path === 'containers-ollama' && isPositiveFinite(record.estimated_usd_per_call)) {
        declarations.push(Object.freeze({
          id: record.id,
          license: record.license,
          path: record.path,
          metered: true,
          estimatedUsdPerCall: record.estimated_usd_per_call,
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

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
