import { querySpaceEntities, SpaceError, type SpaceDocument, type SpaceEntity, type SpaceRegion } from '@/features/xr-v2/semanticSpaceRuntime'
import { readSemanticSpace, runSemanticSpaceAction } from '@/features/xr-v2/semanticSpaceStore'
import { SEMANTIC_SPACE_TOOL_IDS } from './semanticSpaceAgentReadyContract.mjs'

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
})
type Parsed = { operation: 'query'; text: string } | { operation: 'select'; entityId: string }
  | { operation: 'correct'; entityId: string; category: string; label: string }
const TOKEN = '[A-Za-z0-9][A-Za-z0-9._:-]{0,127}'
export function parseSemanticSpaceInvocation(value: string): Parsed {
  const find = new RegExp(`^/space\\.find #(${TOKEN})$`).exec(value)
  if (find) return { operation: 'query', text: find[1] }
  const select = new RegExp(`^/space\\.select @(${TOKEN})$`).exec(value)
  if (select) return { operation: 'select', entityId: select[1] }
  const label = new RegExp(`^/space\\.label @(${TOKEN}) #(${TOKEN}) label="([^"\\r\\n]{1,80})"$`).exec(value)
  if (label) return { operation: 'correct', entityId: label[1], category: label[2], label: label[3] }
  throw new SpaceError('unsupported-invocation', 'Use /space.find #category, /space.select @entity, or /space.label @entity #category label="name"')
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
          const requestId = typeof raw.requestId === 'string' ? raw.requestId : `request:${crypto.randomUUID()}`
          const expectedRevision = typeof raw.expectedRevision === 'number' ? raw.expectedRevision : doc.revision
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
          throw new SpaceError('unsupported-operation', 'This tool cannot request camera permission or perform that action')
        } catch (error) {
          return { ok: false, code: error instanceof SpaceError ? error.code : 'space-error',
            message: String((error as Error).message || error) }
        }
      } }),
  }
}
