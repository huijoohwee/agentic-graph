import type {
  GeoCommand,
  GeoCommandEnvelope,
  GeoCommandRejection,
  GeospatialBounds,
  NormalizedEnhancedConfig,
} from 'grph-shared/geospatial/enhancedLayerContract'
import { GEO_COMMAND_SCHEMA_ID } from 'grph-shared/geospatial/enhancedLayerContract'
import {
  requestGeospatialFitToBounds,
  setEnhancedGeospatialLayerVisibility,
  setEnhancedGeospatialTagVisibility,
  setGeospatialModeEnabled,
} from './gympgrphBridge'

export type GeoInvocationParseResult =
  | { ok: true; command: GeoCommand }
  | { ok: false; rejection: GeoCommandRejection }

export type GeoCommandApplyResult =
  | { ok: true; changed: boolean }
  | { ok: false; rejection: GeoCommandRejection }

const reject = (
  code: GeoCommandRejection['code'],
  message: string,
): { ok: false; rejection: GeoCommandRejection } => ({
  ok: false,
  rejection: { code, message: message.slice(0, 140) },
})

const parseVisibility = (value: string): boolean | null => {
  if (['show', 'on', 'enable', 'visible'].includes(value)) return true
  if (['hide', 'off', 'disable', 'hidden'].includes(value)) return false
  return null
}

export function parseGeoInvocation(raw: string): GeoInvocationParseResult {
  const text = String(raw || '').trim()
  if (!text) return reject('unknown-action', 'Enter /geo, @node-id, or #tag followed by show or hide.')
  if (text.startsWith('@')) {
    const nodeId = /^@(\S+)$/.exec(text)?.[1] || ''
    return nodeId
      ? { ok: true, command: { kind: 'fit.node', nodeId } }
      : reject('unknown-target', 'Use one geo-capable node id after @.')
  }
  if (text.startsWith('#')) {
    const [tagValue, action, extra] = text.split(/\s+/)
    const normalizedAction = String(action || '').toLowerCase()
    const visible = normalizedAction === 'show' ? true : normalizedAction === 'hide' ? false : null
    if (!tagValue || extra || visible == null) return reject('unknown-action', 'Use #tag show or #tag hide.')
    return { ok: true, command: { kind: 'tag.visibility', tag: tagValue.toLowerCase(), visible } }
  }
  const slashPrefix = /^\/geo(?:spatial)?(?:\s+|$)/i.exec(text)?.[0]
  if (!slashPrefix) {
    return reject('unknown-action', 'Use /geo on|off, @<geo-node-id>, or #<tag> show|hide.')
  }
  const tokens = text.slice(slashPrefix.length).trim().split(/\s+/).filter(Boolean)
  const action = (tokens[0] || '').toLowerCase()
  if (['on', 'enable', 'show'].includes(action)) {
    return tokens.length === 1
      ? { ok: true, command: { kind: 'mode.set', enabled: true } }
      : reject('unknown-target', 'Use /geo on without an additional target.')
  }
  if (['off', 'disable', 'hide'].includes(action)) {
    return tokens.length === 1
      ? { ok: true, command: { kind: 'mode.set', enabled: false } }
      : reject('unknown-target', 'Use /geo off without an additional target.')
  }
  if (action === 'extrusion' || action === 'asset') {
    const id = String(tokens[1] || '').trim()
    const visible = parseVisibility(String(tokens[2] || '').toLowerCase())
    if (!id) return reject('unknown-target', `Add a ${action} id.`)
    if (visible == null || tokens.length !== 3) {
      return reject('unknown-action', `Use /geo ${action} <id> show or hide.`)
    }
    return {
      ok: true,
      command: action === 'extrusion'
        ? { kind: 'extrusion.visibility', layerId: id, visible }
        : { kind: 'asset.visibility', assetId: id, visible },
    }
  }
  return reject('unknown-action', 'Use /geo on|off, /geo extrusion <id> show|hide, or /geo asset <id> show|hide.')
}

export function parseGeoCommandEnvelope(raw: unknown): GeoCommandEnvelope | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const envelope = raw as Record<string, unknown>
  if (envelope.schemaId !== GEO_COMMAND_SCHEMA_ID) return null
  if (!envelope.command || typeof envelope.command !== 'object' || Array.isArray(envelope.command)) return null
  const command = envelope.command as Record<string, unknown>
  if (command.kind === 'mode.set' && typeof command.enabled === 'boolean') {
    return { schemaId: GEO_COMMAND_SCHEMA_ID, command: { kind: 'mode.set', enabled: command.enabled } }
  }
  if (
    command.kind === 'extrusion.visibility'
    && typeof command.layerId === 'string'
    && command.layerId.trim()
    && typeof command.visible === 'boolean'
  ) {
    return {
      schemaId: GEO_COMMAND_SCHEMA_ID,
      command: { kind: 'extrusion.visibility', layerId: command.layerId.trim(), visible: command.visible },
    }
  }
  if (
    command.kind === 'asset.visibility'
    && typeof command.assetId === 'string'
    && command.assetId.trim()
    && typeof command.visible === 'boolean'
  ) {
    return {
      schemaId: GEO_COMMAND_SCHEMA_ID,
      command: { kind: 'asset.visibility', assetId: command.assetId.trim(), visible: command.visible },
    }
  }
  return null
}

export type GeoCommandBridge = {
  setMode(enabled: boolean): Promise<boolean>
  setLayer(kind: 'extrusion' | 'asset', id: string, visible: boolean): Promise<boolean>
  setTag(tag: string, visible: boolean): Promise<readonly string[]>
  fitBounds(bounds: GeospatialBounds): Promise<void>
}

const defaultBridge: GeoCommandBridge = {
  setMode: setGeospatialModeEnabled,
  setLayer: setEnhancedGeospatialLayerVisibility,
  setTag: setEnhancedGeospatialTagVisibility,
  fitBounds: requestGeospatialFitToBounds,
}

export async function applyGeoCommand(
  command: GeoCommand,
  context: {
    config: NormalizedEnhancedConfig
    resolveNodeBounds: (id: string) => GeospatialBounds | null
    bridge?: GeoCommandBridge
  },
): Promise<GeoCommandApplyResult> {
  const bridge = context.bridge || defaultBridge
  if (command.kind === 'mode.set') {
    await bridge.setMode(command.enabled)
    return { ok: true, changed: true }
  }
  if (command.kind === 'fit.node') {
    const bounds = context.resolveNodeBounds(command.nodeId)
    if (!bounds) return reject('no-geo-bounds', `Node ${command.nodeId} has no geographic bounds.`)
    await bridge.fitBounds(bounds)
    return { ok: true, changed: true }
  }
  if (command.kind === 'tag.visibility') {
    const normalizedTag = command.tag.startsWith('#') ? command.tag.toLowerCase() : `#${command.tag.toLowerCase()}`
    const matched = [...context.config.extrusions, ...context.config.assets]
      .filter(entry => entry.tags.includes(normalizedTag))
    if (matched.length === 0) return reject('no-tag-match', `No enhanced geospatial layer has tag ${normalizedTag}.`)
    const changedIds = await bridge.setTag(normalizedTag, command.visible)
    return { ok: true, changed: changedIds.length > 0 }
  }
  const kind = command.kind === 'extrusion.visibility' ? 'extrusion' : 'asset'
  const id = command.kind === 'extrusion.visibility' ? command.layerId : command.assetId
  const entries = kind === 'extrusion' ? context.config.extrusions : context.config.assets
  if (!entries.some(entry => entry.id === id)) {
    return reject('unknown-target', `Unknown ${kind} layer: ${id}.`)
  }
  const changed = await bridge.setLayer(kind, id, command.visible)
  return { ok: true, changed }
}
