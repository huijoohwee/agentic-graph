import { querySpaceEntities, SpaceError, type SpaceDocument, type SpaceEntity, type SpaceRegion } from '@/features/xr-v2/semanticSpaceRuntime'
import { readSemanticSpace, runSemanticSpaceAction } from '@/features/xr-v2/semanticSpaceStore'
import { SEMANTIC_SPACE_TOOL_IDS } from './semanticSpaceAgentReadyContract.mjs'
import { SEMANTIC_TWIN_PREVIEW_EVENT, type TwinRoom, type TwinTemplate, type TwinVector } from '@/features/xr-v2/semanticTwinRuntime'
import type { AssetControlValue } from '@/features/image-to-glb/proceduralAssetContract'

type ToolContract = Readonly<{ webName: string; title: string; description: string; inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown> }>
type Tool = ToolContract & Readonly<{ name: string; execute: (input?: Record<string, unknown>) => Promise<unknown> }>
const slim = (entity: SpaceEntity) => ({ id: entity.id, label: entity.label, category: entity.category,
  observationId: entity.observationId, region: entity.region, provenance: entity.provenance })
const summary = (doc: SpaceDocument | null, query = '') => ({
  ok: true, schema: 'agentic-graph/semantic-space-result/v1', spaceId: doc?.id || null,
  revision: doc?.revision ?? null, scale: 'unknown', selectedEntityId: doc?.selectedEntityId || null,
  observations: doc?.observations.map(item => ({ id: item.id, capturedAtMs: item.capturedAtMs,
    width: item.width, height: item.height, sha256: item.sha256 })) || [],
  entities: doc ? querySpaceEntities(doc, query).map(slim) : [],
  twin: doc?.twin ? { schema: doc.twin.schema, room: doc.twin.room,
    objects: doc.twin.objects.map(item => ({ entityId: item.entityId, observationId: item.observationId,
      evidenceSha256: item.evidenceSha256, template: item.template, size: item.size,
      position: item.position, provenance: item.provenance,
      controls: item.recipe.controls.map(control => ({ id: control.id, value: item.recipe.values[control.id] })) })) } : null,
})
type Parsed = { operation: 'query'; text: string } | { operation: 'select'; entityId: string }
  | { operation: 'correct'; entityId: string; category: string; label: string }
  | { operation: 'build'; entityId: string; template: TwinTemplate; size: TwinVector; position: TwinVector }
  | { operation: 'simulate' | 'reset'; entityId: string }
const TOKEN = '[A-Za-z0-9][A-Za-z0-9._:-]{0,127}'
const NUMBER = '-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)'
export function parseSemanticSpaceInvocation(value: string): Parsed {
  const find = new RegExp(`^/space\\.find #(${TOKEN})$`).exec(value)
  if (find) return { operation: 'query', text: find[1] }
  const select = new RegExp(`^/space\\.select @(${TOKEN})$`).exec(value)
  if (select) return { operation: 'select', entityId: select[1] }
  const label = new RegExp(`^/space\\.label @(${TOKEN}) #(${TOKEN}) label="([^"\\r\\n]{1,80})"$`).exec(value)
  if (label) return { operation: 'correct', entityId: label[1], category: label[2], label: label[3] }
  const build = new RegExp(`^/space\\.build @(${TOKEN}) #procedural-asset template=(chair|table|box|sphere|cylinder) width=(${NUMBER}) height=(${NUMBER}) depth=(${NUMBER}) x=(${NUMBER}) z=(${NUMBER})$`).exec(value)
  if (build) return { operation: 'build', entityId: build[1], template: build[2] as TwinTemplate,
    size: [Number(build[3]), Number(build[4]), Number(build[5])], position: [Number(build[6]), 0, Number(build[7])] }
  const simulate = new RegExp(`^/space\\.(simulate|reset) @(${TOKEN})$`).exec(value)
  if (simulate) return { operation: simulate[1] as 'simulate' | 'reset', entityId: simulate[2] }
  throw new SpaceError('unsupported-invocation', 'Use /space.find #category, /space.select @entity, /space.label, /space.build @entity #procedural-asset, /space.simulate or /space.reset')
}

export function buildSemanticSpaceWebMcpToolBuilders(findContract: (name: string) => ToolContract): Record<string, () => Tool> {
  const inspect = findContract(SEMANTIC_SPACE_TOOL_IDS.inspectLocalSemanticSpace)
  const control = findContract(SEMANTIC_SPACE_TOOL_IDS.controlLocalSemanticSpace)
  return {
    [SEMANTIC_SPACE_TOOL_IDS.inspectLocalSemanticSpace]: () => ({ ...inspect, name: inspect.webName,
      execute: async input => summary(await readSemanticSpace(), String(input?.query || '')) }),
    [SEMANTIC_SPACE_TOOL_IDS.controlLocalSemanticSpace]: () => ({ ...control, name: control.webName,
      execute: async input => {
        try {
          const raw = (input?.invocation ? parseSemanticSpaceInvocation(String(input.invocation)) : input || {}) as Record<string, unknown>
          const operation = String(raw.operation || '')
          if (operation === 'query') return summary(await readSemanticSpace(), String(raw.text || ''))
          const doc = await readSemanticSpace()
          if (!doc) throw new SpaceError('space-unavailable', 'Capture or import a space before editing')
          if (operation === 'simulate' || operation === 'reset') {
            const entityId = String(raw.entityId || '')
            if (!doc.twin?.objects.some(item => item.entityId === entityId)) {
              throw new SpaceError('unknown-entity', 'Build this entity before previewing its physics')
            }
            const detail = { spaceId: doc.id, entityId, operation: operation === 'simulate' ? 'drop' : 'reset', handled: false }
            window.dispatchEvent(new CustomEvent(SEMANTIC_TWIN_PREVIEW_EVENT, { detail }))
            if (!detail.handled) throw new SpaceError('scene-unavailable', 'Open the linked 3D or XR canvas before previewing physics')
            return { ...summary(doc), preview: operation === 'simulate' ? 'running' : 'reset' }
          }
          const fromInvocation = typeof input?.invocation === 'string'
          if (!fromInvocation && (typeof raw.requestId !== 'string'
            || !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0)) {
            throw new SpaceError('invalid-input', 'Mutations require a request ID and expected revision')
          }
          const requestId = fromInvocation ? `request:${crypto.randomUUID()}` : String(raw.requestId || '')
          const expectedRevision = fromInvocation ? doc.revision : Number(raw.expectedRevision)
          if (operation === 'select') {
            return summary(await runSemanticSpaceAction({ operation: 'select', requestId, expectedRevision,
              entityId: raw.entityId as string | null }), '')
          }
          if (operation === 'correct') {
            return summary(await runSemanticSpaceAction({ operation: 'correct', requestId, expectedRevision,
              entityId: String(raw.entityId), label: String(raw.label), category: String(raw.category) }), '')
          }
          if (operation === 'confirm') {
            return summary(await runSemanticSpaceAction({ operation: 'confirm', requestId, expectedRevision,
              entity: { id: `entity:${requestId}`, observationId: String(raw.observationId),
                label: String(raw.label), category: String(raw.category), region: raw.region as SpaceRegion,
                confirmedAtMs: Date.now(), provenance: 'user-confirmed' } }), '')
          }
          if (operation === 'build') return summary(await runSemanticSpaceAction({ operation: 'build', requestId,
            expectedRevision, entityId: String(raw.entityId), template: raw.template as TwinTemplate,
            size: raw.size as TwinVector, position: raw.position as TwinVector }), '')
          if (operation === 'edit-twin') return summary(await runSemanticSpaceAction({ operation: 'edit-twin', requestId,
            expectedRevision, entityId: String(raw.entityId), size: raw.size as TwinVector,
            position: raw.position as TwinVector }), '')
          if (operation === 'set-room') return summary(await runSemanticSpaceAction({ operation: 'set-room', requestId,
            expectedRevision, room: raw.room as TwinRoom }), '')
          if (operation === 'control-twin') return summary(await runSemanticSpaceAction({ operation: 'control-twin',
            requestId, expectedRevision, entityId: String(raw.entityId), controlId: String(raw.controlId),
            value: raw.value as AssetControlValue }), '')
          if (operation === 'remove-twin') return summary(await runSemanticSpaceAction({ operation: 'remove-twin',
            requestId, expectedRevision, entityId: String(raw.entityId) }), '')
          throw new SpaceError('unsupported-operation', 'This tool cannot request camera permission or perform that action')
        } catch (error) {
          return { ok: false, code: error instanceof SpaceError ? error.code : 'space-error',
            message: String((error as Error).message || error) }
        }
      } }),
  }
}
