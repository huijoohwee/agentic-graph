import { LS_KEYS } from '@/lib/config'
import { lsJson, lsSetJson, resolveBrowserStorageKey } from '@/lib/persistence'

export type CanvasContainerSizing = 'full' | 'inset'
export type CanvasContainerRect = { left: number; top: number; right: number; bottom: number }
export type CanvasContainerInsets = { left: number; top: number; right: number; bottom: number }
const CHANGE_EVENT = 'kg:canvas-container-sizing-changed'
export const FULL_CANVAS_INSETS: CanvasContainerInsets = { left: 0, top: 0, right: 0, bottom: 0 }

export function normalizeCanvasContainerSizing(value: unknown): CanvasContainerSizing {
  return value === 'inset' ? 'inset' : 'full'
}

export function readCanvasContainerSizing(): CanvasContainerSizing {
  return lsJson(LS_KEYS.canvasContainerSizing, 'full', normalizeCanvasContainerSizing)
}

export function writeCanvasContainerSizing(value: unknown): void {
  lsSetJson(LS_KEYS.canvasContainerSizing, normalizeCanvasContainerSizing(value))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeCanvasContainerSizing(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === resolveBrowserStorageKey(LS_KEYS.canvasContainerSizing)) listener()
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

const area = (rect: CanvasContainerRect) => (rect.right - rect.left) * (rect.bottom - rect.top)
const usable = (rect: CanvasContainerRect) => [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
  && rect.right - rect.left >= 24 && rect.bottom - rect.top >= 24

// Choose the largest remaining rectangle, including when panels are dragged away from an edge.
// Measurements use the unchanged workspace frame so inset sizing cannot move its own inputs.
export function resolveCanvasContainerInsets(
  mode: CanvasContainerSizing, frame: CanvasContainerRect, overlays: readonly CanvasContainerRect[],
): CanvasContainerInsets {
  if (mode !== 'inset' || !usable(frame)) return FULL_CANVAS_INSETS
  let regions = [{ left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom }]
  for (const overlay of overlays) {
    if (!usable(overlay)) continue
    regions = regions.flatMap(region => {
      const left = Math.max(region.left, overlay.left), right = Math.min(region.right, overlay.right)
      const top = Math.max(region.top, overlay.top), bottom = Math.min(region.bottom, overlay.bottom)
      if (left >= right || top >= bottom) return [region]
      return [
        { ...region, left: right }, { ...region, right: left },
        { ...region, top: bottom }, { ...region, bottom: top },
      ].filter(usable)
    })
  }
  // A full-screen panel can temporarily cover everything. Keep a stable canvas until it closes.
  const visible = regions.sort((a, b) => area(b) - area(a))[0]
  if (!visible) return FULL_CANVAS_INSETS
  return {
    left: visible.left - frame.left, top: visible.top - frame.top,
    right: frame.right - visible.right, bottom: frame.bottom - visible.bottom,
  }
}
