import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeGraphElementCentroidShiftToViewportCenter,
  computeLayoutRectSetViewportCenterShift,
  computeViewportCenteredTransformForGraphElements,
  measureTransformedGraphElementScreenRectSet,
} from '@/lib/canvas/graph-elements/centroid'

const close = (a: number, b: number, epsilon = 1e-6): boolean => Math.abs(a - b) <= epsilon

export function testGraphElementCentroidComputesViewportCenteredTransform() {
  const transform = computeViewportCenteredTransformForGraphElements({
    elements: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    viewportW: 1000,
    viewportH: 500,
    scale: 2,
  })
  if (!transform) throw new Error('expected centered graph-element transform')
  if (!close(transform.k, 2) || !close(transform.x, 400) || !close(transform.y, 250)) {
    throw new Error(`expected viewport-centered transform around graph centroid, got ${JSON.stringify(transform)}`)
  }
}

export function testGraphElementCentroidSupportsTopLeftVisualRects() {
  const transform = computeViewportCenteredTransformForGraphElements({
    elements: [
      {
        x: 10,
        y: 20,
        properties: {
          'visual:width': 100,
          'visual:height': 80,
        },
      },
    ],
    viewportW: 400,
    viewportH: 300,
    coordinateMode: 'topLeftVisualRect',
  })
  if (!transform) throw new Error('expected top-left visual-rect graph-element transform')
  if (!close(transform.x, 140) || !close(transform.y, 90) || !close(transform.k, 1)) {
    throw new Error(`expected top-left visual rect to center at 60,60 before viewport transform, got ${JSON.stringify(transform)}`)
  }
}

export function testGraphElementCentroidComputesTransformedRectViewportShift() {
  const metrics = measureTransformedGraphElementScreenRectSet({
    elements: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    transform: { k: 1, x: 0, y: 0 },
    elementWidth: 50,
    elementHeight: 50,
    coordinateMode: 'topLeftVisualRect',
  })
  const shift = computeLayoutRectSetViewportCenterShift({
    metrics,
    viewportW: 200,
    viewportH: 100,
  })
  if (!shift) throw new Error('expected transformed rect viewport-center shift')
  if (!close(shift.dx, 25) || !close(shift.dy, 25)) {
    throw new Error(`expected transformed rect centroid shift 25,25, got ${JSON.stringify(shift)}`)
  }
}

export function testGraphElementCentroidShiftUsesExplicitViewportCenter() {
  const shifted = computeGraphElementCentroidShiftToViewportCenter({
    elements: [
      { x: -50, y: 10 },
      { x: 50, y: 10 },
    ],
    viewportW: 800,
    viewportH: 600,
    targetCenter: { x: 320, y: 240 },
  })
  if (!shifted) throw new Error('expected graph-element centroid shift')
  if (!close(shifted.dx, 320) || !close(shifted.dy, 230)) {
    throw new Error(`expected explicit target center shift, got ${JSON.stringify(shifted)}`)
  }
}

export function test2dRendererCentroidOwnersReuseSharedGraphElementCentroidUtils() {
  const root = process.cwd()
  const files = [
    'src/components/GraphCanvas/fit.ts',
    'src/components/DesignCanvas/useZoomInitController.ts',
    'src/lib/graph/graphCenteredSvg.ts',
    'src/components/FlowCanvas/useFlowCanvasRuntime.ts',
    'src/components/FlowCanvas/fitPinnedWidgets.ts',
    'src/components/FlowCanvas/applyZoomRequestNative.ts',
    'src/components/FlowCanvas/workspaceVisibleViewportRecovery.ts',
    'src/components/GraphCanvas/layout/initialization.ts',
    'src/components/GraphCanvas/layout/postFit.ts',
    'src/components/GraphCanvas/layout/mermaidSeed.ts',
    'src/components/GraphCanvas/layout/markdownHeadingSeed.ts',
    'src/lib/canvas/arrange2d.ts',
  ]
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!
    const text = readFileSync(resolve(root, file), 'utf8')
    const sharedRectOwner = file === 'src/components/FlowCanvas/applyZoomRequestNative.ts'
      && text.includes("import { measureLayoutRectSet } from '@/lib/canvas/layoutCentroid'") && text.includes('measureLayoutRectSet(entries.map(')
    if (!sharedRectOwner && !text.includes('@/lib/canvas/graph-elements/centroid')) {
      throw new Error(`expected ${file} to reuse the shared graph-element centroid helper`)
    }
    if (/\b(sumCenterX|sumCenterY)\b/.test(text)) {
      throw new Error(`expected ${file} to avoid local screen-centroid accumulation`)
    }
    if (/\blet\s+sumX\b|\blet\s+sumY\b/.test(text)) {
      throw new Error(`expected ${file} to avoid local graph-centroid accumulation`)
    }
  }
}
