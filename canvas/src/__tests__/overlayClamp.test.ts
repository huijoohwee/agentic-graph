import {
  clampLocalOverlayTopLeftFullyInViewport,
  clampOverlayCenterFullyInViewport,
  clampOverlayTopLeftFullyInViewport,
  clampOverlayTopLeftToViewport,
} from '@/lib/ui/overlayClamp'

export function testOverlayClampKeepsPanelInViewport() {
  const clamped = clampOverlayTopLeftToViewport({
    pos: { top: -999, left: 999 },
    size: { width: 200, height: 120 },
    viewport: { width: 500, height: 400 },
    visiblePx: 32,
  })
  if (!(clamped.left <= 500 - 32)) throw new Error('expected left to be clamped to max visible bound')
  if (!(clamped.left >= 32 - 200)) throw new Error('expected left to be clamped to min visible bound')
  if (!(clamped.top <= 400 - 32)) throw new Error('expected top to be clamped to max visible bound')
  if (!(clamped.top >= 32 - 120)) throw new Error('expected top to be clamped to min visible bound')
}

export function testOverlayClampSnapPxRoundsToGrid() {
  const clamped = clampOverlayTopLeftToViewport({
    pos: { top: 10.3, left: 20.7 },
    size: { width: 200.2, height: 120.9 },
    viewport: { width: 500, height: 400 },
    visiblePx: 32,
    snapPx: 1,
  })
  if (Math.abs(clamped.top - Math.round(clamped.top)) > 1e-9) throw new Error('expected top snapped to integer px')
  if (Math.abs(clamped.left - Math.round(clamped.left)) > 1e-9) throw new Error('expected left snapped to integer px')
}

export function testOverlayClampFullyInViewport() {
  const clamped = clampOverlayTopLeftFullyInViewport({
    pos: { top: -999, left: 999 },
    size: { width: 200, height: 120 },
    viewport: { width: 500, height: 400 },
  })
  if (!(clamped.left >= 0)) throw new Error('expected left to be clamped to 0')
  if (!(clamped.left <= 500 - 200)) throw new Error('expected left to be clamped to max inside bound')
  if (!(clamped.top >= 0)) throw new Error('expected top to be clamped to 0')
  if (!(clamped.top <= 400 - 120)) throw new Error('expected top to be clamped to max inside bound')
}

export function testOverlayClampCenterKeepsPanelAndHeaderReachable() {
  const viewport = { width: 1108, height: 720 }
  const size = { width: 700, height: 600 }
  const clamped = clampOverlayCenterFullyInViewport({
    pos: { top: -374, left: -152 }, size, viewport,
  })
  if (clamped.top - size.height / 2 < 0) throw new Error('panel header remains above viewport')
  if (clamped.left - size.width / 2 < 0) throw new Error('panel remains left of viewport')
  if (clamped.top + size.height / 2 > viewport.height) throw new Error('panel remains below viewport')

  const oversized = clampOverlayCenterFullyInViewport({
    pos: { top: -374, left: -152 }, size: { width: 700, height: 800 }, viewport,
  })
  if (oversized.top - 400 !== 0) throw new Error('oversized panel header is not reachable')
}

export function testOverlayClampLocalPositionKeepsMenuInViewport() {
  const clamped = clampLocalOverlayTopLeftFullyInViewport({
    localPos: { top: 290, left: 360 },
    localRootRect: { top: 24, left: 32 },
    size: { width: 180, height: 140 },
    viewport: { width: 420, height: 360 },
    snapPx: 1,
  })
  if (clamped.left !== 208) {
    throw new Error(`expected local overlay left to account for root offset and viewport width, got ${clamped.left}`)
  }
  if (clamped.top !== 196) {
    throw new Error(`expected local overlay top to account for root offset and viewport height, got ${clamped.top}`)
  }
}
