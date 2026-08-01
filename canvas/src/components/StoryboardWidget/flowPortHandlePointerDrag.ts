type FlowPortHandlePointerDragArgs = {
  event: FlowPortHandlePointerDragEvent
  sourceNodeId: string
  sourcePortKey?: string | null
}

type FlowPortHandleMouseDragArgs = {
  event: FlowPortHandleMouseDragEvent
  sourceNodeId: string
  sourcePortKey?: string | null
}

type FlowPortHandlePointerDragEvent = {
  button: number
  pointerId: number
  clientX: number
  clientY: number
  preventDefault: () => void
}

type FlowPortHandleMouseDragEvent = {
  button: number
  clientX: number
  clientY: number
  preventDefault: () => void
}

export type FlowPortHandleFinalizeDetail = {
  sourceNodeId: string
  sourcePortKey: string | null
  targetNodeId: string
  targetPortKey: string | null
}

export type FlowPortHandleCancelDetail = {
  sourceNodeId: string
  sourcePortKey: string | null
  clientX: number
  clientY: number
}

export type FlowPortHandlePreviewDetail = {
  phase: 'start' | 'move' | 'cancel'
  sourceNodeId: string
  sourcePortKey: string | null
  clientX: number
  clientY: number
}

export const FLOW_PORT_HANDLE_FINALIZE_EVENT = 'kg-flow-port-handle-finalize'
export const FLOW_PORT_HANDLE_CANCEL_EVENT = 'kg-flow-port-handle-cancel'
export const FLOW_PORT_HANDLE_PREVIEW_EVENT = 'kg-flow-port-handle-preview'

export const FLOW_PORT_HANDLE_SELECTOR = 'button[data-kg-port-handle="1"]'
const PORT_HANDLE_DROP_RADIUS_PX = 36
const PORT_HANDLE_CLICK_MOVEMENT_TOLERANCE_PX = 6

type FlowPortHandleDragSession = {
  id: number
  kind: 'pointer' | 'mouse'
}

let nextFlowPortHandleDragSessionId = 1
let activeFlowPortHandleDragSession: FlowPortHandleDragSession | null = null
let lastFlowPortHandleDragEndedAtMs = 0
const FLOW_PORT_HANDLE_PROJECTION_SETTLE_FREEZE_MS = 5000

export function shouldFreezeProjectionForFlowPortHandleDrag(nowMs = Date.now()): boolean {
  if (activeFlowPortHandleDragSession) return true
  return Number.isFinite(lastFlowPortHandleDragEndedAtMs) && nowMs - lastFlowPortHandleDragEndedAtMs < FLOW_PORT_HANDLE_PROJECTION_SETTLE_FREEZE_MS
}

export function readFlowPortHandleAtClientPoint(args: {
  clientX: number
  clientY: number
  dir?: 'in' | 'out'
}): HTMLButtonElement | null {
  const matches = (handle: HTMLButtonElement | null): handle is HTMLButtonElement => {
    if (!handle) return false
    if (args.dir && handle.dataset.kgPortDir !== args.dir) return false
    return true
  }
  const direct = (document.elementFromPoint(args.clientX, args.clientY)?.closest(FLOW_PORT_HANDLE_SELECTOR) || null) as HTMLButtonElement | null
  if (matches(direct)) return direct
  const elementsFromPoint = document.elementsFromPoint
  if (typeof elementsFromPoint !== 'function') return null
  const stack = elementsFromPoint.call(document, args.clientX, args.clientY)
  for (const element of stack) {
    const handle = element.closest(FLOW_PORT_HANDLE_SELECTOR) as HTMLButtonElement | null
    if (matches(handle)) return handle
  }
  return null
}

function scheduleAfterHandleStateCommit(callback: () => void): number {
  const requestFrame = document.defaultView?.requestAnimationFrame
  if (typeof requestFrame === 'function') return requestFrame.call(document.defaultView, callback)
  return setTimeout(callback, 0) as unknown as number
}

function cancelScheduledHandleCommit(id: number): void {
  const cancelFrame = document.defaultView?.cancelAnimationFrame
  if (typeof cancelFrame === 'function') {
    cancelFrame.call(document.defaultView, id)
    return
  }
  clearTimeout(id)
}

function readSemanticInputHandleAt(args: {
  clientX: number
  clientY: number
  sourceNodeId: string
}): HTMLButtonElement | null {
  const sourceNodeId = String(args.sourceNodeId || '').trim()
  if (!sourceNodeId) return null
  const exact = readFlowPortHandleAtClientPoint({ clientX: args.clientX, clientY: args.clientY, dir: 'in' })
  if (exact?.dataset.kgPortDir === 'in' && exact.dataset.kgPortNodeId && exact.dataset.kgPortNodeId !== sourceNodeId) return exact

  let nearest: HTMLButtonElement | null = null
  let nearestDistance = PORT_HANDLE_DROP_RADIUS_PX
  const handles = Array.from(document.querySelectorAll<HTMLButtonElement>(FLOW_PORT_HANDLE_SELECTOR))
  for (const handle of handles) {
    if (handle.dataset.kgPortDir !== 'in') continue
    if (!handle.dataset.kgPortNodeId || handle.dataset.kgPortNodeId === sourceNodeId) continue
    const rect = handle.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distance = Math.hypot(centerX - args.clientX, centerY - args.clientY)
    if (distance > nearestDistance) continue
    nearestDistance = distance
    nearest = handle
  }
  return nearest
}

function finalizeSemanticInputHandleAt(args: {
  clientX: number
  clientY: number
  sourceNodeId: string
  sourcePortKey: string | null
}): boolean {
  const target = readSemanticInputHandleAt(args)
  if (!target) return false
  const targetNodeId = String(target.dataset.kgPortNodeId || '').trim()
  if (!targetNodeId) return false
  const targetPortKey = String(target.dataset.kgPortKey || '').trim() || null
  const detail: FlowPortHandleFinalizeDetail = {
    sourceNodeId: args.sourceNodeId,
    sourcePortKey: args.sourcePortKey,
    targetNodeId,
    targetPortKey,
  }
  const EventCtor = document.defaultView?.CustomEvent || CustomEvent
  const event = new EventCtor(FLOW_PORT_HANDLE_FINALIZE_EVENT, {
    cancelable: true,
    detail,
  }) as CustomEvent<FlowPortHandleFinalizeDetail>
  document.dispatchEvent(event)
  if (!event.defaultPrevented && !target.disabled) target.click()
  return true
}

function dispatchFlowPortHandlePreview(detail: FlowPortHandlePreviewDetail): void {
  const EventCtor = document.defaultView?.CustomEvent || CustomEvent
  document.dispatchEvent(new EventCtor(FLOW_PORT_HANDLE_PREVIEW_EVENT, { detail }))
}

function dispatchFlowPortHandleCancel(detail: FlowPortHandleCancelDetail): void {
  const EventCtor = document.defaultView?.CustomEvent || CustomEvent
  document.dispatchEvent(new EventCtor(FLOW_PORT_HANDLE_CANCEL_EVENT, { detail }))
}

function beginFlowPortHandleDragSession(kind: FlowPortHandleDragSession['kind']): FlowPortHandleDragSession | null {
  if (activeFlowPortHandleDragSession) return null
  const session = { id: nextFlowPortHandleDragSessionId, kind }
  nextFlowPortHandleDragSessionId += 1
  activeFlowPortHandleDragSession = session
  return session
}

function clearFlowPortHandleDragSession(session: FlowPortHandleDragSession): void {
  if (activeFlowPortHandleDragSession?.id !== session.id) return
  activeFlowPortHandleDragSession = null
  lastFlowPortHandleDragEndedAtMs = Date.now()
}

function consumeFlowPortHandleDragEvent(event: Event): void {
  try {
    event.preventDefault()
  } catch {
    void 0
  }
  try {
    event.stopPropagation()
  } catch {
    void 0
  }
  try {
    ;(event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
  } catch {
    void 0
  }
}

function movedBeyondClickTolerance(args: {
  startClientX: number
  startClientY: number
  clientX: number
  clientY: number
}): boolean {
  return Math.hypot(
    args.clientX - args.startClientX,
    args.clientY - args.startClientY,
  ) > PORT_HANDLE_CLICK_MOVEMENT_TOLERANCE_PX
}

export function startFlowPortHandlePointerDrag(args: FlowPortHandlePointerDragArgs): boolean {
  if (typeof document === 'undefined' || args.event.button !== 0) return false
  const pointerId = args.event.pointerId
  const sourceNodeId = String(args.sourceNodeId || '').trim()
  const sourcePortKey = String(args.sourcePortKey || '').trim() || null
  if (!sourceNodeId) return false
  const session = beginFlowPortHandleDragSession('pointer')
  if (!session) return false
  args.event.preventDefault()
  dispatchFlowPortHandlePreview({ phase: 'start', sourceNodeId, sourcePortKey, clientX: args.event.clientX, clientY: args.event.clientY })

  const startClientX = args.event.clientX
  const startClientY = args.event.clientY
  let didDrag = false
  let finishFrame = 0
  const trackMovement = (clientX: number, clientY: number) => {
    if (didDrag) return
    didDrag = movedBeyondClickTolerance({ startClientX, startClientY, clientX, clientY })
  }

  const cleanup = () => {
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', finish, true)
    document.removeEventListener('pointercancel', cancel, true)
    document.removeEventListener('mousemove', moveMouse, true)
    document.removeEventListener('mouseup', finishMouse, true)
    if (finishFrame) cancelScheduledHandleCommit(finishFrame)
    clearFlowPortHandleDragSession(session)
  }
  const move = (event: PointerEvent) => {
    consumeFlowPortHandleDragEvent(event)
    if (event.pointerId === pointerId) {
      trackMovement(event.clientX, event.clientY)
      dispatchFlowPortHandlePreview({ phase: 'move', sourceNodeId, sourcePortKey, clientX: event.clientX, clientY: event.clientY })
    }
  }
  const moveMouse = (event: MouseEvent) => {
    consumeFlowPortHandleDragEvent(event)
    trackMovement(event.clientX, event.clientY)
    dispatchFlowPortHandlePreview({ phase: 'move', sourceNodeId, sourcePortKey, clientX: event.clientX, clientY: event.clientY })
  }
  const cancel = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    consumeFlowPortHandleDragEvent(event)
    dispatchFlowPortHandlePreview({ phase: 'cancel', sourceNodeId, sourcePortKey, clientX: event.clientX, clientY: event.clientY })
    cleanup()
  }
  const finishAt = (clientX: number, clientY: number) => {
    trackMovement(clientX, clientY)
    cleanup()
    dispatchFlowPortHandlePreview({ phase: 'move', sourceNodeId, sourcePortKey, clientX, clientY })
    finishFrame = scheduleAfterHandleStateCommit(() => {
      finishFrame = 0
      if (!finalizeSemanticInputHandleAt({ clientX, clientY, sourceNodeId, sourcePortKey })) {
        dispatchFlowPortHandlePreview({ phase: 'cancel', sourceNodeId, sourcePortKey, clientX, clientY })
        if (didDrag) dispatchFlowPortHandleCancel({ sourceNodeId, sourcePortKey, clientX, clientY })
      }
    })
  }
  const finish = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    consumeFlowPortHandleDragEvent(event)
    finishAt(event.clientX, event.clientY)
  }
  const finishMouse = (event: MouseEvent) => {
    consumeFlowPortHandleDragEvent(event)
    finishAt(event.clientX, event.clientY)
  }

  document.addEventListener('pointermove', move, true)
  document.addEventListener('pointerup', finish, true)
  document.addEventListener('pointercancel', cancel, true)
  document.addEventListener('mousemove', moveMouse, true)
  document.addEventListener('mouseup', finishMouse, true)
  return true
}

export function startFlowPortHandleMouseDrag(args: FlowPortHandleMouseDragArgs): boolean {
  if (typeof document === 'undefined' || args.event.button !== 0) return false
  const sourceNodeId = String(args.sourceNodeId || '').trim()
  const sourcePortKey = String(args.sourcePortKey || '').trim() || null
  if (!sourceNodeId) return false
  const session = beginFlowPortHandleDragSession('mouse')
  if (!session) return false
  args.event.preventDefault()
  dispatchFlowPortHandlePreview({ phase: 'start', sourceNodeId, sourcePortKey, clientX: args.event.clientX, clientY: args.event.clientY })

  const startClientX = args.event.clientX
  const startClientY = args.event.clientY
  let didDrag = false
  const trackMovement = (clientX: number, clientY: number) => {
    if (didDrag) return
    didDrag = movedBeyondClickTolerance({ startClientX, startClientY, clientX, clientY })
  }
  const move = (event: MouseEvent) => {
    consumeFlowPortHandleDragEvent(event)
    trackMovement(event.clientX, event.clientY)
    dispatchFlowPortHandlePreview({ phase: 'move', sourceNodeId, sourcePortKey, clientX: event.clientX, clientY: event.clientY })
  }
  const finish = (event: MouseEvent) => {
    consumeFlowPortHandleDragEvent(event)
    document.removeEventListener('mousemove', move, true)
    document.removeEventListener('mouseup', finish, true)
    clearFlowPortHandleDragSession(session)
    const clientX = event.clientX
    const clientY = event.clientY
    trackMovement(clientX, clientY)
    dispatchFlowPortHandlePreview({ phase: 'move', sourceNodeId, sourcePortKey, clientX, clientY })
    scheduleAfterHandleStateCommit(() => {
      if (!finalizeSemanticInputHandleAt({ clientX, clientY, sourceNodeId, sourcePortKey })) {
        dispatchFlowPortHandlePreview({ phase: 'cancel', sourceNodeId, sourcePortKey, clientX, clientY })
        if (didDrag) dispatchFlowPortHandleCancel({ sourceNodeId, sourcePortKey, clientX, clientY })
      }
    })
  }

  document.addEventListener('mousemove', move, true)
  document.addEventListener('mouseup', finish, true)
  return true
}
