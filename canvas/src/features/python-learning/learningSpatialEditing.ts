import { WAREHOUSE_CONTEXT_RACKS, WAREHOUSE_FIXTURES, WAREHOUSE_PARTITIONS } from './warehouseLayout'
import type { LearningLesson } from './learningLessons'

export type PlacedLearningAsset = Readonly<{ id: string; templateId: string; name: string; position: readonly [number, number, number]; size: readonly [number, number, number]; color: string }>
export const WAREHOUSE_DOORS = [
  { id: 'office', name: 'Office entry', x: 18, z: 12, width: 1.6 },
  { id: 'break', name: 'Pantry entry', x: 0, z: 12, width: 1.4 },
  { id: 'vault', name: 'Vault entry', x: -25, z: -10, width: 1.8 },
] as const
export type SpatialBlock = { name: string; x: number; z: number; width: number; depth: number }
export function spatialBlocks(lesson: LearningLesson, placed: readonly PlacedLearningAsset[], doors: readonly string[] = []): SpatialBlock[] {
  return [
    ...lesson.obstacles.map(o => ({ name: o.name ?? o.id, x: o.position[0], z: o.position[1], width: o.size[0], depth: o.size[1] })),
    ...WAREHOUSE_CONTEXT_RACKS.map(o => ({ name: o.id, x: o.position[0], z: o.position[1], width: o.size[0], depth: o.size[2] })),
    ...WAREHOUSE_FIXTURES.map(o => ({ name: o.id, x: o.position[0], z: o.position[2], width: o.size[0], depth: o.size[2] })),
    ...WAREHOUSE_PARTITIONS.map(o => ({ name: 'Partition', x: o.position[0], z: o.position[2], width: o.size[0], depth: o.size[2] })),
    ...WAREHOUSE_DOORS.map(o => ({ name: `${o.name} swing clearance`, x: doors.includes(o.id) ? o.x - o.width / 2 : o.x, z: doors.includes(o.id) ? o.z + o.width / 2 : o.z, width: doors.includes(o.id) ? .08 : o.width, depth: doors.includes(o.id) ? o.width : .08 })),
    ...placed.map(o => ({ name: o.name, x: o.position[0], z: o.position[2], width: o.size[0], depth: o.size[2] })),
  ]
}
export const snapLearningPosition = (x: number, z: number): readonly [number, number, number] => [Math.round(x * 4) / 4, 0, Math.round(z * 4) / 4]
export function placementIssue(asset: Pick<PlacedLearningAsset, 'position' | 'size'>, blocks: readonly SpatialBlock[]): string | null {
  const [x, , z] = asset.position, [w, , d] = asset.size
  if (![...asset.position, ...asset.size].every(Number.isFinite) || w <= 0 || d <= 0) return 'Invalid object dimensions or position.'
  if (Math.abs(x) + w / 2 > 29.7 || Math.abs(z) + d / 2 > 19.7) return 'Keep the whole object inside the warehouse.'
  if (Math.abs(x) < 8 + w / 2 && Math.abs(z) < 8 + d / 2) return 'Keep the programmed flight cell clear.'
  for (const door of WAREHOUSE_DOORS) if (Math.abs(x - door.x) < (w + door.width * 2) / 2 && Math.abs(z - door.z) < (d + door.width * 2) / 2) return `Keep ${door.name} swing clearance free.`
  const overlap = blocks.find(o => Math.abs(x - o.x) < (w + o.width) / 2 + .1 && Math.abs(z - o.z) < (d + o.depth) / 2 + .1)
  return overlap ? `Overlaps ${overlap.name}. Choose a clear floor position.` : null
}
export function canWalkTo(x: number, z: number, blocks: readonly SpatialBlock[]) {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) < 29.5 && Math.abs(z) < 19.5
    && !blocks.some(o => Math.abs(x - o.x) < o.width / 2 + .25 && Math.abs(z - o.z) < o.depth / 2 + .25)
}
