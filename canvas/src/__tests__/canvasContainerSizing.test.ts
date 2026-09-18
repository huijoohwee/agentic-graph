import assert from 'node:assert/strict'
import {
  FULL_CANVAS_INSETS, normalizeCanvasContainerSizing, resolveCanvasContainerInsets,
} from '@/lib/canvas/canvasContainerSizing'

const frame = { left: 20, top: 40, right: 1420, bottom: 940 }
const editor = { left: 20, top: 40, right: 520, bottom: 940 }
const props = { left: 1100, top: 48, right: 1412, bottom: 932 }
const timeline = { left: 530, top: 650, right: 1090, bottom: 930 }

export function testCanvasContainerSizingDefaultsToFull() {
  for (const input of [undefined, null, 'full', '', 'legacy-inset', {}, 0]) {
    assert.equal(normalizeCanvasContainerSizing(input), 'full')
  }
  assert.equal(normalizeCanvasContainerSizing('inset'), 'inset')
  assert.deepEqual(resolveCanvasContainerInsets('full', frame, [editor, props, timeline]), FULL_CANVAS_INSETS)
}

export function testCanvasContainerSizingAvoidsEditorAndPanels() {
  assert.deepEqual(resolveCanvasContainerInsets('inset', frame, [editor, props, timeline]), {
    left: 500, top: 0, right: 320, bottom: 290,
  })
  // Closing or resizing overlays expands the same container; positions are relative to the full frame.
  assert.deepEqual(resolveCanvasContainerInsets('inset', frame, [editor]), {
    left: 500, top: 0, right: 0, bottom: 0,
  })
  assert.deepEqual(resolveCanvasContainerInsets('inset', frame, []), FULL_CANVAS_INSETS)
  // DOMRect exposes coordinates through prototype accessors, not enumerable own properties.
  assert.deepEqual(resolveCanvasContainerInsets('inset', Object.create(frame), [Object.create(editor)]), {
    left: 500, top: 0, right: 0, bottom: 0,
  })
}

export function testCanvasContainerSizingHandlesCompactAndCoveredViews() {
  const compact = { left: 0, top: 0, right: 360, bottom: 800 }
  assert.deepEqual(resolveCanvasContainerInsets('inset', compact, [{ ...compact, right: 288 }]), {
    left: 288, top: 0, right: 0, bottom: 0,
  })
  assert.deepEqual(resolveCanvasContainerInsets('inset', compact, [compact]), FULL_CANVAS_INSETS)
  assert.deepEqual(resolveCanvasContainerInsets('inset', compact, [
    { left: 400, top: 0, right: 700, bottom: 800 },
    { left: NaN, top: 0, right: 200, bottom: 600 },
  ]), FULL_CANVAS_INSETS)
}
