import type { GraphData } from '@/lib/graph/types'
import type {
  GeoCommand,
  NormalizedEnhancedConfig,
} from 'grph-shared/geospatial/enhancedLayerContract'
import {
  applyGeoCommand,
  parseGeoInvocation,
  type GeoCommandApplyResult,
  type GeoCommandBridge,
} from './geoInvocationDispatcher'
import { resolveGraphNodeGeoBounds, resolveGraphNodeGeoReference } from './geoNodeBounds'
import { readEnhancedGeospatialConfig } from './gympgrphBridge'

const GEO_SLASH_INVOCATION = /^\/geo(?:spatial)?(?:\s|$)/i
const GEO_TAG_VISIBILITY_INVOCATION = /^#[^\s]+\s+(?:show|hide)$/i
const GEO_NODE_INVOCATION = /^@(\S+)$/
const EMPTY_ENHANCED_CONFIG: NormalizedEnhancedConfig = {
  extrusions: [],
  assets: [],
  diagnostics: [],
}

export type GeoInvocationRuntimeDependencies = {
  bridge?: GeoCommandBridge
  readConfig?: () => Promise<NormalizedEnhancedConfig>
}

export type GeoInvocationRuntimeResult =
  | { handled: false }
  | { handled: true; result: GeoCommandApplyResult }

const commandNeedsEnhancedConfig = (command: GeoCommand): boolean => (
  command.kind === 'extrusion.visibility'
  || command.kind === 'asset.visibility'
  || command.kind === 'tag.visibility'
)

export function isGeoInvocationCandidate(
  raw: unknown,
  graphData: GraphData | null | undefined,
): boolean {
  const text = String(raw || '').trim()
  if (GEO_SLASH_INVOCATION.test(text) || GEO_TAG_VISIBILITY_INVOCATION.test(text)) return true
  const nodeId = GEO_NODE_INVOCATION.exec(text)?.[1]
  return nodeId
    ? resolveGraphNodeGeoReference({ graphData, nodeId }).exists
    : false
}

export async function applyGeoCommandFromGraph(args: {
  command: GeoCommand
  graphData: GraphData | null | undefined
  dependencies?: GeoInvocationRuntimeDependencies
}): Promise<GeoCommandApplyResult> {
  const dependencies = args.dependencies || {}
  const config = commandNeedsEnhancedConfig(args.command)
    ? await (dependencies.readConfig || readEnhancedGeospatialConfig)()
    : EMPTY_ENHANCED_CONFIG
  return applyGeoCommand(args.command, {
    config,
    resolveNodeBounds: nodeId => resolveGraphNodeGeoBounds(args.graphData, nodeId),
    bridge: dependencies.bridge,
  })
}

export async function runGeoInvocation(args: {
  raw: unknown
  graphData: GraphData | null | undefined
  dependencies?: GeoInvocationRuntimeDependencies
}): Promise<GeoInvocationRuntimeResult> {
  if (!isGeoInvocationCandidate(args.raw, args.graphData)) return { handled: false }
  const parsed = parseGeoInvocation(String(args.raw || ''))
  if (parsed.ok === false) return { handled: true, result: parsed }
  return {
    handled: true,
    result: await applyGeoCommandFromGraph({
      command: parsed.command,
      graphData: args.graphData,
      dependencies: args.dependencies,
    }),
  }
}
