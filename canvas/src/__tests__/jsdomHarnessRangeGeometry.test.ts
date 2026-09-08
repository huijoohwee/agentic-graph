import assert from 'node:assert/strict'
import { initJsdomHarness, restoreActiveJsdomGlobalsForTests } from '@/tests/lib/jsdomHarness'

export function testJsdomHarnessProvidesRangeGeometryApis() {
  const originalRange = (globalThis as { Range?: unknown }).Range
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')

  try {
    const doc = dom.window.document
    const text = doc.createTextNode('selectable text')
    doc.body.appendChild(text)
    const range = doc.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 10)

    const rangeWithGeometry = range as Range & {
      getBoundingClientRect: () => DOMRect
      getClientRects: () => DOMRectList
    }

    if (typeof rangeWithGeometry.getBoundingClientRect !== 'function') {
      throw new Error('expected jsdom harness to provide Range.getBoundingClientRect')
    }
    if (typeof rangeWithGeometry.getClientRects !== 'function') {
      throw new Error('expected jsdom harness to provide Range.getClientRects')
    }

    const rect = rangeWithGeometry.getBoundingClientRect()
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
      throw new Error('expected Range.getBoundingClientRect to return finite coordinates')
    }

    const rects = rangeWithGeometry.getClientRects()
    if (typeof rects.length !== 'number' || typeof rects.item !== 'function') {
      throw new Error('expected Range.getClientRects to return a DOMRectList-like value')
    }
    if (Array.from(rects).length !== rects.length) {
      throw new Error('expected Range.getClientRects result to be iterable through Array.from')
    }
    if ((globalThis as { Range?: unknown }).Range !== dom.window.Range) {
      throw new Error('expected jsdom harness to expose the active Range constructor globally')
    }
  } finally {
    restore()
  }

  if ((globalThis as { Range?: unknown }).Range !== originalRange) {
    throw new Error('expected jsdom harness restore to reset the global Range constructor')
  }
}

export function testJsdomHarnessOwnsXmlSerialization() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLSerializer')
  const previousDescriptors: Array<PropertyDescriptor | undefined> = [
    undefined,
    { configurable: true, writable: true, enumerable: true, value: undefined },
    { configurable: true, writable: true, enumerable: false, value: class PreviousSerializer {} },
  ]
  try {
    for (const previous of previousDescriptors) {
      if (previous) Object.defineProperty(globalThis, 'XMLSerializer', previous)
      else delete (globalThis as { XMLSerializer?: typeof XMLSerializer }).XMLSerializer
      const outer = initJsdomHarness()
      try {
        assert.equal(globalThis.XMLSerializer, outer.dom.window.XMLSerializer, 'active harness owns serialization')
        const inner = initJsdomHarness()
        try {
          assert.equal(globalThis.XMLSerializer, inner.dom.window.XMLSerializer, 'nested harness owns serialization')
          const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><text>A &amp; B</text></svg>', 'image/svg+xml')
          const serialized = new XMLSerializer().serializeToString(svg)
          const parsed = new DOMParser().parseFromString(serialized, 'image/svg+xml')
          assert.equal(parsed.documentElement.namespaceURI, 'http://www.w3.org/2000/svg')
          assert.equal(parsed.querySelector('text')?.textContent, 'A & B')
          Object.defineProperty(globalThis, 'XMLSerializer', { configurable: true, writable: true, value: undefined })
          restoreActiveJsdomGlobalsForTests()
          assert.equal(globalThis.XMLSerializer, inner.dom.window.XMLSerializer, 'active restoration repairs borrowed globals')
        } finally { inner.restore() }
        assert.equal(globalThis.XMLSerializer, outer.dom.window.XMLSerializer, 'nested restore returns the outer constructor')
      } finally { outer.restore() }
      assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'XMLSerializer'), previous, 'restore exact prior descriptor')
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'XMLSerializer', original)
    else delete (globalThis as { XMLSerializer?: typeof XMLSerializer }).XMLSerializer
  }
}
