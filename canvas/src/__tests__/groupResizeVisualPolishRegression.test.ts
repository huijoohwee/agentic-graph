import assert from 'node:assert/strict'
import { observeGroupResizeLayout } from './groupResizeHandleParityRegression.test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

export function testGroupResizeVisualPolishKeepsActiveOutlineAndLabelFeedback() {
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  for (const token of ['data-kg-base-stroke-width', 'data-kg-base-fill-opacity']) {
    assert.ok(groupsText.includes(token), 'group owner preserves base styling for resize feedback')
  }
  const { labels, chevrons } = observeGroupResizeLayout({ selected: 'child', active: 'child' })
  for (const [id, weight, stroke] of [['child', '700', '2.3'], ['parent', '600', '2.05'], ['other', '500', '1.75']]) {
    assert.equal(labels.get(id)!.attrs.get('font-weight'), weight, `${id} label emphasis`)
    assert.equal(chevrons.get(id)!.attrs.get('stroke-width'), stroke, `${id} chevron emphasis`)
  }
}

export function testGroupResizeVisualPolishRaisesActiveGroupAndUsesGrabbingCursor() {
  const layoutText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groupsLayout.ts'))
  if (!layoutText.includes("handleEl.style.cursor = isActiveResize ? 'grabbing' : 'nwse-resize'")) {
    throw new Error('expected active resize handle to switch to a grabbing cursor')
  }
  if (!layoutText.includes("hitRect.style.cursor = isActiveResize ? 'grabbing' : 'grab'")) {
    throw new Error('expected active rect hit areas to reflect grabbing cursor during resize')
  }
  if (!layoutText.includes('labelEl.parentNode.appendChild(labelEl)')) {
    throw new Error('expected active resize visuals to raise the group label within its layer')
  }
  if (!layoutText.includes('handleEl.parentNode?.appendChild(handleEl)')) {
    throw new Error('expected active resize visuals to raise the handle within its layer')
  }
}
