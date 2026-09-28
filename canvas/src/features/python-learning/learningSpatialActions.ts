import { useGraphStore } from '@/hooks/useGraphStore'
import { pythonLearningRuntime } from './learningRuntime'
import { learningLesson } from './learningLessons'
import { learningSpatialSelection as selection, learningSpatialDocumentKey, canInspectWarehouse } from './learningSpatialSelection'
import { placementIssue, snapLearningPosition, spatialBlocks, WAREHOUSE_DOORS } from './learningSpatialEditing'

function context() {
  const runtime = pythonLearningRuntime.read(), key = learningSpatialDocumentKey(runtime.document)
  return { runtime, key, view: selection.read(key), lesson: learningLesson('drone') }
}
export function spatialNotice(message: string, error = false) {
  const { key } = context()
  selection.update(key, { message })
  useGraphStore.getState().pushUiLog({ source: 'Warehouse layout', kind: error ? 'error' : 'success', message })
}
export function armLearningPlacement(id: string) {
  const { runtime, lesson, key } = context()
  if (!canInspectWarehouse(runtime) || !lesson.obstacles.some(o => `obstacle:${o.id}` === id)) return
  selection.update(key, { placement: id, walk: false })
  spatialNotice('Placement ready · click a clear floor position · 0.25 m snap · Esc cancels.')
}
export function cancelLearningPlacement() {
  const { key } = context(); selection.update(key, { placement: null }); spatialNotice('Placement cancelled.')
}
export function placeLearningAsset(x: number, z: number) {
  const { runtime, lesson, key, view } = context()
  if (!canInspectWarehouse(runtime) || !view.placement) return
  const template = lesson.obstacles.find(o => `obstacle:${o.id}` === view.placement)
  if (!template) return
  const asset = { id: `placed:${crypto.randomUUID()}`, templateId: template.id, name: `${template.name ?? template.id} · layout copy`,
    position: snapLearningPosition(x, z), size: [template.size[0], template.height ?? 1, template.size[1]] as const, color: '#b39163' }
  const issue = view.placed.length >= 32 ? 'Layout limit reached (32 objects). Remove an object first.' : placementIssue(asset, spatialBlocks(lesson, view.placed))
  if (issue) { spatialNotice(issue, true); return }
  selection.update(key, { placed: [...view.placed, asset], selectedId: asset.id, placement: null })
  spatialNotice(`Placed ${asset.name} at X ${asset.position[0].toFixed(2)}, Z ${asset.position[2].toFixed(2)} m. Layout preview only; flight routes unchanged.`)
}
export function removeLearningAsset() {
  const { key, view } = context(), asset = view.placed.find(o => o.id === view.selectedId)
  if (!asset) return
  selection.update(key, { placed: view.placed.filter(o => o.id !== asset.id), selectedId: 'room' })
  spatialNotice(`Removed ${asset.name} from the layout preview.`)
}
export function toggleWarehouseDoor(id: string) {
  const { key, view } = context(), door = WAREHOUSE_DOORS.find(o => o.id === id)
  if (!door) return
  const open = !view.doors.includes(id)
  selection.update(key, { doors: open ? [...view.doors, id] : view.doors.filter(o => o !== id) })
  spatialNotice(`${door.name} ${open ? 'opened' : 'closed'} in the layout preview. Flight access remains unchanged.`)
}
export function openLearningActivity() {
  const store = useGraphStore.getState(); store.setBottomSurfaceTab('activity'); store.setBottomSurfaceCollapsed(false)
}
