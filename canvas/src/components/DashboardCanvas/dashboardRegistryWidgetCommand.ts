import { useGraphStore } from '@/hooks/useGraphStore'
import { readAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { listWidgetPaletteLayoutVariants } from '@/features/toolbar/widgetPaletteLayoutVariants'
import { beginFlowWidgetPointerDragSession, dispatchFlowWidgetPointerDragDropFromSession, clearActiveFlowWidgetPointerDragSession, readActiveFlowWidgetPointerDragSession } from '@/lib/storyboardWidget/widgetDrag'

type Request = { id: string; registryEntryId?: string; layoutVariantId?: string }
type Result = { ok: true; operation: 'create'; nodeId: string; reused: boolean }
// An accepted, unobserved request remains recorded: retrying must never create another card.
const pending = new Map<string, { signature: string; result: Promise<Result> }>()
/** Invoke the palette's native drop owner, which assigns the command identity at creation. */
export async function createRegistryWidget(input: Request): Promise<Result> {
  const state = useGraphStore.getState()
  if (readAgentRunWorkspace() || state.canvas2dRenderer !== 'storyboard') throw Error('Open an editable Storyboard to create a registry Widget Card.')
  const key = `${buildGraphDocumentMetaKey(state.graphData)}:${input.id}`, signature = JSON.stringify([input.registryEntryId, input.layoutVariantId])
  const existing = state.graphData.nodes.find(node => node.properties?.['widget:commandId'] === input.id)
  if (existing) return { ok: true, operation: 'create', nodeId: existing.id, reused: true }
  const current = pending.get(key)
  if (current) { if (current.signature !== signature) throw Error('This widget id already has a different creation request.'); return current.result }
  if (pending.size >= 128) throw Error('Too many pending Widget Card commands. Inspect the canvas first.')
  if (readActiveFlowWidgetPointerDragSession()) throw Error('Finish the active widget drag before invoking another card.')
  const variants = listWidgetPaletteLayoutVariants(state.widgetRegistry, state.strybldrStoryboardCardAspectMode === '9:16' ? '9:16' : '16:9')
  const variant = variants.find(item => input.layoutVariantId ? item.id === input.layoutVariantId : input.registryEntryId ? item.entry.id === input.registryEntryId : item.label === 'Widget Card Type 0')
  if (!variant) throw Error('Choose an enabled Widget Card from the Props palette.')
  const viewport = document.querySelector('[data-kg-canvas-viewport]') ?? document.querySelector('[aria-label="Canvas viewport"]')
  const rect = viewport?.getBoundingClientRect()
  if (!rect || !rect.width || !rect.height) throw Error('The editable canvas is not mounted.')
  let complete!: (result: Result) => void, fail!: (error: Error) => void
  const result = new Promise<Result>((resolve, reject) => { complete = resolve; fail = reject })
  pending.set(key, { signature, result })
  const timeout = window.setTimeout(() => fail(Error('The native owner accepted creation but has not reported its result. This id stays reserved; inspect the canvas before continuing.')), 5000)
  const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
  beginFlowWidgetPointerDragSession({ ...point, pointerId: -1, registryEntryId: variant.entry.id,
    nodeTypeId: variant.entry.nodeTypeId, widgetTypeId: variant.entry.widgetTypeId, formId: variant.entry.formId, layoutVariantId: variant.id,
    command: { id: input.id, onCreated: nodeId => {
      window.clearTimeout(timeout)
      if (!nodeId) { fail(Error('The native owner did not create a card.')); return }
      const receipt: Result = { ok: true, operation: 'create', nodeId, reused: false }
      pending.set(key, { signature, result: Promise.resolve(receipt) }); complete(receipt)
    } } })
  let claimed = false
  try { claimed = dispatchFlowWidgetPointerDragDropFromSession(point) } finally { clearActiveFlowWidgetPointerDragSession() }
  if (!claimed) { window.clearTimeout(timeout); pending.delete(key); fail(Error('The native Widget Card owner did not accept this request.')) }
  return result
}
