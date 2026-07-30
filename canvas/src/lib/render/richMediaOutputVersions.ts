import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

export const RICH_MEDIA_OUTPUT_VERSIONS_PROPERTY = 'outputVersions'
export const RICH_MEDIA_SELECTED_OUTPUT_VERSION_PROPERTY = 'selectedOutputVersionId'
export const RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID = '__rich-media-edited-draft__'

export type RichMediaTextOutputVersion = {
  id: string
  createdAt: string
  output: string
  outputMimeType: string
  outputModel?: string
  outputPath?: string
}

const cleanString = (value: unknown): string => {
  const scalar = unwrapGraphCellValue(value)
  return typeof scalar === 'string' ? scalar.trim() : ''
}

const normalizeVersion = (value: unknown): RichMediaTextOutputVersion | null => {
  const scalar = unwrapGraphCellValue(value)
  if (!scalar || typeof scalar !== 'object' || Array.isArray(scalar)) return null
  const record = scalar as Record<string, unknown>
  const id = cleanString(record.id)
  const output = typeof unwrapGraphCellValue(record.output) === 'string'
    ? String(unwrapGraphCellValue(record.output))
    : ''
  if (!id || !output.trim()) return null
  const createdAt = cleanString(record.createdAt)
  const outputMimeType = cleanString(record.outputMimeType) || 'text/markdown; charset=utf-8'
  const outputModel = cleanString(record.outputModel)
  const outputPath = cleanString(record.outputPath)
  return {
    id,
    createdAt,
    output,
    outputMimeType,
    ...(outputModel ? { outputModel } : {}),
    ...(outputPath ? { outputPath } : {}),
  }
}

export function readRichMediaTextOutputVersions(
  properties: Record<string, unknown> | null | undefined,
): RichMediaTextOutputVersion[] {
  const raw = unwrapGraphCellValue(properties?.[RICH_MEDIA_OUTPUT_VERSIONS_PROPERTY])
  if (!Array.isArray(raw)) return []
  const versions: RichMediaTextOutputVersion[] = []
  const seenIds = new Set<string>()
  for (const value of raw) {
    const version = normalizeVersion(value)
    if (!version || seenIds.has(version.id)) continue
    seenIds.add(version.id)
    versions.push(version)
  }
  return versions
}

export function resolveRichMediaTextOutputVersionSelection(args: {
  properties: Record<string, unknown> | null | undefined
  fallbackOutput?: unknown
}): {
  versions: RichMediaTextOutputVersion[]
  selectedVersionId: string
  selectedOutput: string
} {
  const versions = readRichMediaTextOutputVersions(args.properties)
  const requestedId = cleanString(args.properties?.[RICH_MEDIA_SELECTED_OUTPUT_VERSION_PROPERTY])
  if (requestedId === RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID) {
    const fallbackOutput = typeof unwrapGraphCellValue(args.fallbackOutput) === 'string'
      ? String(unwrapGraphCellValue(args.fallbackOutput))
      : ''
    return {
      versions,
      selectedVersionId: RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID,
      selectedOutput: fallbackOutput,
    }
  }
  const selected = versions.find(version => version.id === requestedId) || versions.at(-1)
  const fallbackOutput = typeof unwrapGraphCellValue(args.fallbackOutput) === 'string'
    ? String(unwrapGraphCellValue(args.fallbackOutput))
    : ''
  return {
    versions,
    selectedVersionId: selected?.id || '',
    selectedOutput: selected?.output || fallbackOutput,
  }
}

const buildVersion = (args: {
  id: string
  createdAt: string
  output: string
  outputMimeType?: unknown
  outputModel?: unknown
  outputPath?: unknown
}): RichMediaTextOutputVersion => {
  const outputModel = cleanString(args.outputModel)
  const outputPath = cleanString(args.outputPath)
  return {
    id: args.id,
    createdAt: args.createdAt,
    output: args.output,
    outputMimeType: cleanString(args.outputMimeType) || 'text/markdown; charset=utf-8',
    ...(outputModel ? { outputModel } : {}),
    ...(outputPath ? { outputPath } : {}),
  }
}

export function buildRichMediaTextOutputBaselinePatch(
  properties: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const currentProperties = properties || {}
  if (readRichMediaTextOutputVersions(currentProperties).length > 0) return {}
  const existingOutput = typeof unwrapGraphCellValue(currentProperties.output) === 'string'
    ? String(unwrapGraphCellValue(currentProperties.output))
    : ''
  if (!existingOutput.trim()) return {}
  const createdAt = cleanString(currentProperties.lastRunAt) || new Date().toISOString()
  return {
    [RICH_MEDIA_OUTPUT_VERSIONS_PROPERTY]: [buildVersion({
      id: `baseline-${createdAt}`,
      createdAt,
      output: existingOutput,
      outputMimeType: currentProperties.outputMimeType,
      outputModel: currentProperties.outputModel,
      outputPath: currentProperties.outputPath,
    })],
  }
}

export function buildRichMediaTextOutputVersionPatch(args: {
  properties: Record<string, unknown> | null | undefined
  output: string
  outputMimeType?: unknown
  outputModel?: unknown
  outputPath?: unknown
  versionId?: string
  createdAt?: string
}): Record<string, unknown> {
  const properties = args.properties || {}
  const output = String(args.output || '')
  if (!output.trim()) return {}
  const createdAt = String(args.createdAt || '').trim() || new Date().toISOString()
  const versions = readRichMediaTextOutputVersions(properties)
  const existingOutput = typeof unwrapGraphCellValue(properties.output) === 'string'
    ? String(unwrapGraphCellValue(properties.output))
    : ''
  if (versions.length === 0 && existingOutput.trim()) {
    const baseline = readRichMediaTextOutputVersions({
      ...properties,
      ...buildRichMediaTextOutputBaselinePatch(properties),
    })
    versions.push(...baseline)
  }
  const versionId = String(args.versionId || '').trim() || `output-${createdAt}-${versions.length + 1}`
  const nextVersion = buildVersion({
    id: versionId,
    createdAt,
    output,
    outputMimeType: args.outputMimeType,
    outputModel: args.outputModel,
    outputPath: args.outputPath,
  })
  const existingIndex = versions.findIndex(version => version.id === versionId)
  if (existingIndex >= 0) versions[existingIndex] = nextVersion
  else versions.push(nextVersion)
  return {
    [RICH_MEDIA_OUTPUT_VERSIONS_PROPERTY]: versions,
    [RICH_MEDIA_SELECTED_OUTPUT_VERSION_PROPERTY]: versionId,
  }
}
