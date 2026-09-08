import assert from 'node:assert/strict'
import { createGroupsLayoutEngine } from '@/components/GraphCanvas/layers/groupsLayout'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

// Exercise the real layout owner through the D3 selection boundary, without a browser.
export function observeGroupResizeLayout(options: { selected: string; active?: string; allowResize?: boolean; autoBounds?: boolean }) {
  const groups = ['parent', 'child', 'other'].map(id => ({ id, autoBounds: options.autoBounds === true }))
  const element = () => {
    const attrs = new Map<string, string>()
    const style: Record<string, unknown> = { removeProperty(key: string) { delete style[key] } }
    return { attrs, style, setAttribute(key: string, value: string) { attrs.set(key, value) },
      getAttribute(key: string) { return attrs.get(key) ?? null }, querySelector() { return null } }
  }
  const selections = () => {
    const elements = new Map(groups.map(g => [g.id, element()]))
    return { elements, each(fn: (this: ReturnType<typeof element>, g: typeof groups[number]) => void) {
      for (const g of groups) fn.call(elements.get(g.id)!, g)
    } }
  }
  const handles = selections(), labels = selections(), chevrons = selections()
  const empty = { each() {} }
  const args = {
    shape: 'rect', schema: {}, nodeById: new Map(), nodeHalfExtentsById: new Map(),
    parentGroupIdById: new Map([['parent', null], ['child', 'parent'], ['other', null]]),
    padding: 8, nestedPaddingStep: 2, maxDepth: 2, labelPadding: 4,
    chevronSizePx: 10, chevronGapPx: 4, chevronHitRadiusPx: 16, collapsedSet: new Set(),
    allowResize: options.allowResize !== false,
    resizeHandleBase: { dotRadiusPx: 6, hitRadiusPx: 16, strokeWidthPx: 1.25 },
    getGroupLabelText: () => ({ fontSize: 12, labelWidthPx: 40 }),
    rectSel: empty, geoSel: empty, labelSel: labels, chevronSel: chevrons,
    chevronHitSel: empty, resizeHandleGroupSel: handles,
  }
  const engine = createGroupsLayoutEngine(args as unknown as Parameters<typeof createGroupsLayoutEngine>[0])
  const box = { x: 10, y: 20, w: 100, h: 80, labelX: 14, labelY: 24, chevronCx: 15, chevronCy: 25, d: null }
  for (const g of groups) engine.applyComputedToGroup(g as Parameters<typeof engine.applyComputedToGroup>[0], box, options.selected, options.active ?? '')
  return { handles: handles.elements, labels: labels.elements, chevrons: chevrons.elements }
}

export function testGroupResizeHandleKeepsActiveFeedbackAndInsetAnchor() {
  for (const active of ['', 'child']) {
    const { handles } = observeGroupResizeLayout({ selected: 'child', active })
    const handle = handles.get('child')!
    assert.notEqual(handle.style.display, 'none', 'selected or actively resized manual group remains actionable')
    assert.equal(handle.attrs.get('data-kg-group-resize-selected'), '1')
    assert.equal(handle.attrs.get('data-kg-group-resize-active'), active ? '1' : '0')
    const [x, y] = handle.attrs.get('transform')!.match(/[\d.]+/g)!.map(Number)
    assert.ok(x > 10 && x < 110 && y > 20 && y < 100, 'touch handle is inset inside group bounds')
  }
  for (const options of [{ allowResize: false }, { autoBounds: true }]) {
    const { handles } = observeGroupResizeLayout({ selected: 'child', active: 'child', ...options })
    assert.equal(handles.get('child')!.style.display, 'none', 'disabled or auto-bounded groups cannot be resized')
  }
}

export function testGroupResizeHandleBinderPublishesActiveResizeState() {
  const binderText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groupsResizeHandle.ts'))
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  if (!binderText.includes('onResizeActiveGroupIdChange?: (id: string | null) => void')) {
    throw new Error('expected resize handle binder to publish active resize group state')
  }
  if (!binderText.includes("args.onResizeActiveGroupIdChange?.(String(d.id || '').trim() || null)")) {
    throw new Error('expected resize handle binder to publish the active group id on drag start')
  }
  if (!binderText.includes("args.onResizeActiveGroupIdChange?.(null)")) {
    throw new Error('expected resize handle binder to clear the active group id on drag end')
  }
  if (!groupsText.includes('let activeResizeGroupId =')) {
    throw new Error('expected groups layer to track active resize group state for shared feedback')
  }
}
