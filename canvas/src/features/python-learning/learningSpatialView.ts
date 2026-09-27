import { useLayoutEffect, useRef, useState } from 'react'
import { resolveWorkspaceVisibleViewport, WORKSPACE_VISIBLE_VIEWPORT_OCCLUDER_ATTR } from '@/lib/zoom/workspaceVisibleViewport'
import { WAREHOUSE_ZONES, WAREHOUSE_DOCKS } from './warehouseLayout'
import { chargeTruckAssemblySize, DRONE002_DIMENSIONS } from './learningDockAssets'
import { sampleWarehouseInspection, type WarehouseInspectionSample } from './warehouseCoverageRoutes'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
export { LearningSpatialSelection, type SpatialView } from './learningSpatialSelection'
export { useLearningSpatialView } from './useWarehouseInspectionMode'

export type LearningAsset = Readonly<{ id: string; name: string; kind: 'space' | 'zone' | 'dock' | 'pad' | 'obstacle' | 'drone' | 'truck';
  position: readonly [number, number, number]; size: readonly [number, number, number]; color: string; detail: string }>
/** Presentation inventory derived from the lesson, never a second simulation model. */
export function learningAssets(lesson: LearningLesson, scene?: LearningSceneSnapshot, inspection?: WarehouseInspectionSample): LearningAsset[] {
  const fleet = inspection ?? sampleWarehouseInspection(0)
  return [
    { id: 'room', name: 'Inspection cell', kind: 'space', position: [0, 0, 0], size: [16, 4, 16], color: '#91a6b7', detail: '16 × 16 m bounded flight cell within the 60 × 40 m warehouse concept · altitude 0–4 m' },
    { id: 'launch', name: 'Launch pad', kind: 'pad', position: [0, 0, 0], size: [1.08, 0.02, 1.08], color: '#398ccc', detail: 'Program starts at (0, 0) · decorative pad' },
    { id: 'goal', name: 'Landing pad', kind: 'pad', position: [lesson.goal[0], 0, lesson.goal[1]], size: [1.08, 0.02, 1.08], color: '#399775', detail: 'Land at the lesson goal · decorative pad' },
    ...lesson.obstacles.map(o => ({ id: `obstacle:${o.id}`, name: o.name ?? `Training ${o.id}`, kind: 'obstacle' as const,
      position: [o.position[0], 0, o.position[1]] as const, size: [o.size[0], o.height ?? 1, o.size[1]] as const, color: o.id.startsWith('rack-') ? '#cc773e' : '#b39163', detail: (o.height ?? 1) > 4 ? 'Tall rack collision volume · stay in the aisle; above the flight ceiling' : 'Low pallet collision volume · clear its top at 2 m altitude' })),
    ...WAREHOUSE_ZONES.map(zone => ({ id: `zone:${zone.id}`, name: zone.name, kind: 'zone' as const, position: [zone.rect[0] + zone.rect[2] / 2, 0, zone.rect[1] + zone.rect[3] / 2] as const, size: [zone.rect[2], 0, zone.rect[3]] as const, color: zone.color, detail: `${zone.rect[2] * zone.rect[3]} m² · ${zone.use === 'core' ? 'core logistics' : 'ancillary support'} · conceptual allocation; facility rehearsal has explicit access exclusions` })),
    ...WAREHOUSE_DOCKS.map(dock => ({ id: `dock:${dock.id}`, name: dock.name, kind: 'dock' as const, position: [dock.x + dock.width / 2, 0, dock.z + dock.depth / 2] as const, size: [dock.width, 0, dock.depth] as const, color: '#ab9a78', detail: '20/40-foot container bay · dock leveler at building edge · conceptual 4 × 18 m allowance; exterior to indoor allocation' })),
    { id: 'charging-truck', name: 'Mobile charging truck', kind: 'truck', position: fleet.actors.truck.position, size: chargeTruckAssemblySize(inspection?.lidAngleRadians ?? 0), color: '#263039', detail: 'Shell 220 × 160 × 90 mm · wall 3 mm · bay 214 × 154 × 84 mm. Tracks, hinges and antenna add to the assembled size. Charging is a scheduled demonstration.' },
    { id: 'drone002', name: 'ESP32 quad · drone-002', kind: 'drone', position: fleet.actors.drone002.position, size: DRONE002_DIMENSIONS.size, color: '#303b43', detail: 'Photo-informed ESP32 quad · assumed 140 × 140 × 52 mm envelope. Local rehearsal; camera, battery and charging hardware unverified.' },
    { id: 'drone', name: 'Programmed drone · drone-001', kind: 'drone', position: inspection?.actors.drone001.position ?? [scene?.x ?? 0, scene?.altitude ?? 0, scene?.z ?? 0], size: [0.4, 0.4, 0.4], color: '#568cb3', detail: inspection ? 'drone-001 · scheduled facility rehearsal · native Timeline pose' : 'drone-001 · 0.20 m collision radius · position follows Python' },
  ]
}
/** Resolve only named lesson owners; decoration inherits the closest named parent. */
export function learningAssetFromObject(object: { name: string; parent: { name: string; parent: unknown } | null }): string | null {
  let node: { name: string; parent: unknown } | null = object
  while (node) {
    if (node.name.startsWith('warehouse-zone-')) return `zone:${node.name.slice(15)}`
    if (node.name.startsWith('warehouse-dock-')) return `dock:${node.name.slice(15)}`
    if (node.name === 'learning-charge-truck') return 'charging-truck'
    if (node.name === 'learning-drone002') return 'drone002'
    if (node.name === 'learning-drone') return 'drone'
    if (node.name.startsWith('learning-obstacle-')) return `obstacle:${node.name.slice(18)}`
    if (node.name === 'learning-goal-pad') return 'goal'
    if (node.name === 'learning-launch-pad') return 'launch'
    if (node.name === 'learning-drone-training-room') return 'room'
    node = node.parent as typeof node
  }
  return null
}

/** Reuse the Canvas occlusion contract when the source editor shares the viewport. */
export function useLearningViewportLeft(editorOpen: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [left, setLeft] = useState(0)
  useLayoutEffect(() => {
    const surface = ref.current?.parentElement
    if (!surface) return
    const refresh = () => {
      const rect = surface.getBoundingClientRect()
      const frame = resolveWorkspaceVisibleViewport({ viewportW: rect.width, viewportH: rect.height,
        workspaceEditorOverlayOpen: editorOpen, surfaceElement: surface })
      setLeft(frame.left)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh)
    observer?.observe(surface)
    surface.ownerDocument.querySelectorAll(`[${WORKSPACE_VISIBLE_VIEWPORT_OCCLUDER_ATTR}]`).forEach(element => observer?.observe(element))
    const frame = requestAnimationFrame(refresh)
    window.addEventListener('resize', refresh)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', refresh) }
  }, [editorOpen])
  return { ref, left }
}
