import {
  alignmentGuideScreenPosition,
  alignmentRectFromTopLeft,
  resolveAlignmentSnap,
  translateAlignmentRect,
  unionAlignmentRects,
} from '@/lib/canvas/alignmentGuides'

export function testAlignmentHelperLinesInteractionContract() {
  const target = alignmentRectFromTopLeft({
    id: 'target',
    x: 100,
    y: 200,
    width: 40,
    height: 30,
  })
  const moving = alignmentRectFromTopLeft({
    id: 'moving',
    x: 77,
    y: 177,
    width: 20,
    height: 20,
  })
  const simultaneous = resolveAlignmentSnap({
    moving,
    stationary: [target],
    scale: 1,
  })
  if (
    simultaneous.dx !== 3 ||
    simultaneous.dy !== 3 ||
    simultaneous.guides.find(guide => guide.axis === 'x')?.position !== 100 ||
    simultaneous.guides.find(guide => guide.axis === 'y')?.position !== 200
  ) {
    throw new Error('expected independent horizontal and vertical alignment snaps')
  }

  const scaleSensitiveMoving = alignmentRectFromTopLeft({
    id: 'scale-sensitive',
    x: 96,
    y: 300,
    width: 20,
    height: 20,
  })
  const scaleSensitiveTarget = alignmentRectFromTopLeft({
    id: 'scale-target',
    x: 100,
    y: 400,
    width: 20,
    height: 20,
  })
  const zoomedIn = resolveAlignmentSnap({
    moving: scaleSensitiveMoving,
    stationary: [scaleSensitiveTarget],
    scale: 2,
  })
  const zoomedOut = resolveAlignmentSnap({
    moving: scaleSensitiveMoving,
    stationary: [scaleSensitiveTarget],
    scale: 0.5,
  })
  if (zoomedIn.dx !== 0 || zoomedIn.guides.some(guide => guide.axis === 'x')) {
    throw new Error('expected screen-pixel tolerance to narrow in world space when zoomed in')
  }
  if (zoomedOut.dx !== 4 || !zoomedOut.guides.some(guide => guide.axis === 'x')) {
    throw new Error('expected screen-pixel tolerance to widen in world space when zoomed out')
  }

  const sameSizeMoving = alignmentRectFromTopLeft({
    id: 'moving-same-size',
    x: 5,
    y: 0,
    width: 20,
    height: 20,
  })
  const deterministic = resolveAlignmentSnap({
    moving: sameSizeMoving,
    stationary: [
      alignmentRectFromTopLeft({ id: 'beta', x: 0, y: 100, width: 20, height: 20 }),
      alignmentRectFromTopLeft({ id: 'alpha', x: 0, y: 100, width: 20, height: 20 }),
    ],
    scale: 1,
  })
  const verticalGuide = deterministic.guides.find(guide => guide.axis === 'x')
  if (
    deterministic.dx !== -5 ||
    verticalGuide?.movingAnchor !== 'center' ||
    verticalGuide.targetAnchor !== 'center' ||
    verticalGuide.targetId !== 'alpha'
  ) {
    throw new Error('expected deterministic center-first tie resolution')
  }

  const selection = unionAlignmentRects([
    alignmentRectFromTopLeft({ id: 'a', x: 0, y: 10, width: 20, height: 20 }),
    alignmentRectFromTopLeft({ id: 'b', x: 40, y: 0, width: 20, height: 30 }),
  ])
  if (
    !selection ||
    selection.minX !== 0 ||
    selection.minY !== 0 ||
    selection.maxX !== 60 ||
    selection.maxY !== 30
  ) {
    throw new Error('expected multi-node snapping to use the selection bounds')
  }
  const translated = translateAlignmentRect(selection, 10, -5)
  if (translated.minX !== 10 || translated.minY !== -5 || translated.maxX !== 70 || translated.maxY !== 25) {
    throw new Error('expected translated selection bounds to preserve dimensions')
  }

  const xGuide = simultaneous.guides.find(guide => guide.axis === 'x')
  const yGuide = simultaneous.guides.find(guide => guide.axis === 'y')
  if (
    !xGuide ||
    !yGuide ||
    alignmentGuideScreenPosition(xGuide, { x: -40, y: 20, k: 2.5 }) !== 210 ||
    alignmentGuideScreenPosition(yGuide, { x: -40, y: 20, k: 2.5 }) !== 520
  ) {
    throw new Error('expected guide projection to honor viewport pan and scale')
  }
}
