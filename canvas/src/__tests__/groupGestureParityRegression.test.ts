import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

export function testGroupDragBehaviorReusesSharedIntentThresholds() {
  const consumer = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  if (!consumer.includes("import { bindGroupsDrag } from '@/components/GraphCanvas/layers/groupsDrag'") || !consumer.includes('bindGroupsDrag({')) throw new Error('expected group layers to use their shared drag binder')
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groupsDrag.ts'))
  if (!groupsText.includes("import { readCanvasDragIntentThresholdPx } from '@/lib/canvas/dragIntent'")) {
    throw new Error('expected group drag behavior to reuse the shared canvas drag intent helper')
  }
  if (!groupsText.includes('const activateGroupDrag =')) {
    throw new Error('expected group drag behavior to defer layout churn until drag intent is confirmed')
  }
  if (!groupsText.includes('Math.hypot(clientX - dragStartClientX, clientY - dragStartClientY) < dragThresholdPx')) {
    throw new Error('expected group drag behavior to block tiny pointer drift before moving group members')
  }
}

export function testGroupLabelClickRespectsPreventedDragClicks() {
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  if (
    !groupsText.includes('const queueGroupSelectOrToggle = (event: MouseEvent, d: GroupDatum) => {')
    || !groupsText.includes('if ((event as unknown as { defaultPrevented?: unknown }).defaultPrevented) return')
    || !groupsText.includes(".on('click', queueGroupSelectOrToggle)")
  ) {
    throw new Error('expected group label click handling to ignore prevented click events after drag gestures')
  }
}
