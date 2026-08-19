import type { Rejection } from '../bundle/bundle-types'

export type ModelDeclaration = Readonly<{
  id: string
  license: string
  path: 'workers-ai' | 'containers-ollama'
  metered: true
}>

export function readModelDeclaration(catalogJson: string, modelId: string): ModelDeclaration | Rejection {
  const catalog = readCatalog(catalogJson)
  if ('kind' in catalog) return catalog
  return catalog.find((model) => model.id === modelId)
    ?? { kind: 'rejected', reason: 'model-unconfigured', details: { modelId } }
}

export function permittedModelSet(catalogJson: string, permittedLicensesJson: string): readonly ModelDeclaration[] | Rejection {
  try {
    const permitted: unknown = JSON.parse(permittedLicensesJson)
    const catalog = readCatalog(catalogJson)
    if ('kind' in catalog || !Array.isArray(permitted) || !permitted.every((item) => typeof item === 'string')) {
      return { kind: 'rejected', reason: 'license-configuration-unavailable' }
    }
    const allowed = new Set(permitted)
    return Object.freeze(catalog.filter((model) => allowed.has(model.license)))
  } catch {
    return { kind: 'rejected', reason: 'license-configuration-unavailable' }
  }
}

function readCatalog(catalogJson: string): readonly ModelDeclaration[] | Rejection {
  try {
    const catalog: unknown = JSON.parse(catalogJson)
    if (!Array.isArray(catalog)) return { kind: 'rejected', reason: 'license-configuration-unavailable' }
    const declarations: ModelDeclaration[] = []
    for (const item of catalog) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return { kind: 'rejected', reason: 'license-configuration-unavailable' }
      const record = item as Record<string, unknown>
      const path = record.path ?? 'workers-ai'
      if (typeof record.id !== 'string' || typeof record.license !== 'string' || (path !== 'workers-ai' && path !== 'containers-ollama')) {
        return { kind: 'rejected', reason: 'license-configuration-unavailable' }
      }
      declarations.push(Object.freeze({ id: record.id, license: record.license, path, metered: true }))
    }
    return Object.freeze(declarations)
  } catch {
    return { kind: 'rejected', reason: 'license-configuration-unavailable' }
  }
}
