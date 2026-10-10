import { findNearestMapLibreWalkablePoint } from './mapLibreWalkableSurface.js'
export {
  findNearestMapLibreWalkablePoint,
  isMapLibreWalkableLineFeature,
} from './mapLibreWalkableSurface.js'

export type MapLibrePanOffset = readonly [x: number, y: number]

const MAP_KEYBOARD_PAN_STEP = 72
const MAP_KEYBOARD_FINE_PAN_STEP = 28
const MAP_CHARACTER_STEP = 10
const MAP_CHARACTER_FINE_STEP = 4
const MAP_CHARACTER_ANCHOR_RADIUS = 24
const MAP_CHARACTER_SNAP_RADIUS = 8
const MAP_CHARACTER_MAX_STEP = 17

export function resolveMapLibreKeyboardPanOffset(
  keyValue: unknown,
  fine = false,
): MapLibrePanOffset | null {
  const key = String(keyValue || '').trim().toLowerCase()
  const step = fine ? MAP_KEYBOARD_FINE_PAN_STEP : MAP_KEYBOARD_PAN_STEP
  if (key === 'w' || key === 'arrowup') return Object.freeze([0, step])
  if (key === 'a' || key === 'arrowleft') return Object.freeze([step, 0])
  if (key === 's' || key === 'arrowdown') return Object.freeze([0, -step])
  if (key === 'd' || key === 'arrowright') return Object.freeze([-step, 0])
  return null
}

export function resolveMapLibreKeyboardCharacterOffset(
  keyValue: unknown,
  fine = false,
): MapLibrePanOffset | null {
  const cameraOffset = resolveMapLibreKeyboardPanOffset(keyValue, fine)
  const step = fine ? MAP_CHARACTER_FINE_STEP : MAP_CHARACTER_STEP
  return cameraOffset
    ? Object.freeze([
        cameraOffset[0] === 0 ? 0 : Math.sign(-cameraOffset[0]) * step,
        cameraOffset[1] === 0 ? 0 : Math.sign(-cameraOffset[1]) * step,
      ])
    : null
}

export type MapLibreKeyboardCharacterOptions = Readonly<{
  /** Allows one explicit external input owner (for example, a released game canvas) to hand keys back to the map. */
  isExternalKeyboardFallbackTarget?: (target: EventTarget | null) => boolean
  moveSelectedCharacter?: (
    coordinate: readonly [longitude: number, latitude: number],
  ) => boolean
  readSelectedCharacterCoordinate?: () => readonly [longitude: number, latitude: number] | null
}>

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return !!element?.closest?.(
    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
  )
}

function isMapKeyboardTarget(target: EventTarget | null, container: HTMLElement): boolean {
  if (!target || isEditableTarget(target)) return false
  const node = target as Node
  if (container === node || container.contains(node)) return true
  const document = container.ownerDocument
  return node === document.body || node === document.documentElement
}

export function bindMapLibreKeyboardCameraControls(
  map: any,
  keyboardEventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  characterOptions: MapLibreKeyboardCharacterOptions = {},
): () => void {
  const container = map?.getCanvasContainer?.() as HTMLElement | null | undefined
  if (
    !container
    || typeof container.addEventListener !== 'function'
    || typeof map?.panBy !== 'function'
  ) return () => void 0
  const eventTarget = keyboardEventTarget
    || (typeof window !== 'undefined' ? window : container)

  const originalTabIndex = container.getAttribute('tabindex')
  if (originalTabIndex === null) container.setAttribute('tabindex', '0')
  if (container.dataset) container.dataset.kgMapKeyboardCamera = 'enabled'
  const handlePointerDown = (event: PointerEvent): void => {
    if (isEditableTarget(event.target)) return
    container.focus({ preventScroll: true })
  }
  const handleKeyDown = (event: KeyboardEvent): void => {
    const mapTarget = isMapKeyboardTarget(event.target, container)
    const externalFallbackTarget = !mapTarget
      && !isEditableTarget(event.target)
      && characterOptions.isExternalKeyboardFallbackTarget?.(event.target) === true
    if (
      event.defaultPrevented
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || (!mapTarget && !externalFallbackTarget)
    ) return
    const key = event.key.toLowerCase()
    if (key === '+' || key === '=') {
      if (typeof map.zoomIn !== 'function') return
      event.preventDefault()
      event.stopPropagation()
      map.zoomIn({ duration: 120 })
      return
    }
    if (key === '-' || key === '_') {
      if (typeof map.zoomOut !== 'function') return
      event.preventDefault()
      event.stopPropagation()
      map.zoomOut({ duration: 120 })
      return
    }
    const offset = resolveMapLibreKeyboardPanOffset(event.key, event.shiftKey)
    if (!offset) return
    const characterOffset = resolveMapLibreKeyboardCharacterOffset(event.key, event.shiftKey)
    const selectedCharacter = characterOptions.readSelectedCharacterCoordinate?.()
    if (selectedCharacter) {
      event.preventDefault()
      event.stopPropagation()
      try {
        if (
          characterOffset
          && typeof map.project === 'function'
          && typeof map.unproject === 'function'
          && characterOptions.moveSelectedCharacter
        ) {
          const point = map.project(selectedCharacter)
          const currentPoint = point && { x: Number(point.x), y: Number(point.y) }
          if (currentPoint && Number.isFinite(currentPoint.x) && Number.isFinite(currentPoint.y)) {
            const anchor = findNearestMapLibreWalkablePoint(map, currentPoint, MAP_CHARACTER_ANCHOR_RADIUS)
            if (anchor) {
              const intendedPoint = {
                x: anchor.point.x + characterOffset[0],
                y: anchor.point.y + characterOffset[1],
              }
              const destination = findNearestMapLibreWalkablePoint(map, intendedPoint, MAP_CHARACTER_SNAP_RADIUS)
              if (destination) {
                const dx = destination.point.x - anchor.point.x
                const dy = destination.point.y - anchor.point.y
                const distance = Math.hypot(dx, dy)
                const directionLength = Math.hypot(characterOffset[0], characterOffset[1]) || 1
                const directionX = characterOffset[0] / directionLength
                const directionY = characterOffset[1] / directionLength
                const forwardProgress = dx * directionX + dy * directionY
                const crossTrackDistance = Math.abs(dx * directionY - dy * directionX)
                if (
                  distance <= MAP_CHARACTER_MAX_STEP
                  && forwardProgress >= 1
                  && crossTrackDistance <= MAP_CHARACTER_SNAP_RADIUS
                ) characterOptions.moveSelectedCharacter(destination.coordinate)
              }
            }
          }
        }
      } catch {
        // A selected character remains stationary when the current map cannot resolve a walkable route.
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    map.panBy([...offset], { duration: 120 })
  }

  container.addEventListener('pointerdown', handlePointerDown, true)
  eventTarget.addEventListener('keydown', handleKeyDown, true)
  return () => {
    container.removeEventListener('pointerdown', handlePointerDown, true)
    eventTarget.removeEventListener('keydown', handleKeyDown, true)
    if (container.dataset?.kgMapKeyboardCamera === 'enabled') {
      delete container.dataset.kgMapKeyboardCamera
    }
    if (originalTabIndex === null) container.removeAttribute('tabindex')
  }
}
