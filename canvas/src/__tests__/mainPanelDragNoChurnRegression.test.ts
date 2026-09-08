import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testMainPanelDragUsesSharedPointerDragAndRaf() {
  const p = resolve(process.cwd(), 'src', 'features', 'toolbar', 'hooks', 'useMainPanelDrag.ts')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('beginOverlayPanelPositionDrag({')) throw new Error('expected main panel drag to delegate to the shared overlay pointer drag owner')
  if (!text.includes('createRafValueScheduler')) throw new Error('expected main panel drag to batch updates with the shared RAF value scheduler')
  if (!text.includes('scheduler.schedule(')) throw new Error('expected main panel drag movement to schedule batched position updates')
}
