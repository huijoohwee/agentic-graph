import type { GraphNode } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { readImageDerivedInlineInvocationTokens } from '@/features/image-to-threejs/imageToThreeJsContract'

export const PROCEDURAL_ASSET_OUTPUT_PANEL = 'proceduralAssetOutputPanel'
export const PROCEDURAL_ASSET_OUTPUT_ANCHOR = 'proceduralAssetOutputAnchorNodeId'
export type ProceduralAssetRunInput = { intent: string; seed: number; recipe?: unknown }
const text = (value: unknown): string => {
  const scalar = unwrapGraphCellValue(value)
  if (Array.isArray(scalar)) return scalar.map(text).filter(Boolean).join('\n')
  return typeof scalar === 'string' ? scalar.trim() : ''
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function isProceduralAssetOutputPanel(properties: unknown): boolean {
  const outer = record(properties)
  return [outer, record(outer.properties)].some(item => {
    const value = unwrapGraphCellValue(item[PROCEDURAL_ASSET_OUTPUT_PANEL])
    return value === true || text(value).toLowerCase() === 'true'
  })
}

export function hasProceduralAssetRunInvocation(properties: unknown): boolean {
  if (isProceduralAssetOutputPanel(properties)) return false
  const tokens = readImageDerivedInlineInvocationTokens(properties)
  return tokens.includes('/asset.create') || tokens.includes('#procedural-asset')
}

/** An ordinary @text request never invokes local geometry construction. */
export function resolveProceduralAssetRunInput(args: {
  node: Pick<GraphNode, 'properties'>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): ProceduralAssetRunInput | null {
  const properties = record(args.node.properties)
  if (!hasProceduralAssetRunInvocation(properties)) return null
  const connected = args.connectedValuesBySchemaPath
  const read = (key: string) => unwrapGraphCellValue(connected?.[`properties.${key}`]?.value ?? properties[key])
  const strip = (value: string) => value.replace(/(^|\s)(?:\/asset\.create|#procedural-asset|@text)(?=\s|$)/gi, ' ').trim()
  const intent = ['proceduralIntent', 'prompt', 'text', 'summary', 'action', 'dialogue'].map(key => strip(text(read(key)))).find(Boolean) || ''
  const seedValue = read('proceduralSeed')
  const seed = seedValue == null || seedValue === '' ? 1 : typeof seedValue === 'number' || typeof seedValue === 'string' && /^\d+$/.test(seedValue) ? Number(seedValue) : NaN
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Procedural seed must be an unsigned 32-bit integer')
  const recipe = read('proceduralRecipe')
  if (intent.length > 2000 || !intent && recipe == null) throw new Error('Describe an asset in 1–2000 characters or supply a typed procedural recipe')
  return { intent, seed, ...(recipe == null ? {} : { recipe }) }
}
