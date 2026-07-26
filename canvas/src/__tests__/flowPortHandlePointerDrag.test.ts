import type React from 'react'
import { JSDOM } from 'jsdom'

import {
  FLOW_PORT_HANDLE_CANCEL_EVENT,
  FLOW_PORT_HANDLE_FINALIZE_EVENT,
  FLOW_PORT_HANDLE_PREVIEW_EVENT,
  readFlowPortHandleAtClientPoint,
  startFlowPortHandleMouseDrag,
  startFlowPortHandlePointerDrag,
  type FlowPortHandleCancelDetail,
  type FlowPortHandleFinalizeDetail,
  type FlowPortHandlePreviewDetail,
} from '@/components/StoryboardWidget/flowPortHandlePointerDrag'

export async function testFlowPortHandlePointerDragCompletesOnSemanticInputHandle() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const target = document.createElement('button')
  target.dataset.kgPortHandle = '1'
  target.dataset.kgPortDir = 'in'
  target.dataset.kgPortNodeId = 'target-node'
  target.dataset.kgPortKey = 'imageUrl'
  document.body.appendChild(target)

  let clickCount = 0
  target.addEventListener('click', () => { clickCount += 1 })
  let finalizeDetail: FlowPortHandleFinalizeDetail | null = null
  document.addEventListener(FLOW_PORT_HANDLE_FINALIZE_EVENT, event => {
    finalizeDetail = (event as CustomEvent<FlowPortHandleFinalizeDetail>).detail
    event.preventDefault()
  })
  const previewDetails: FlowPortHandlePreviewDetail[] = []
  document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, event => { previewDetails.push((event as CustomEvent<FlowPortHandlePreviewDetail>).detail) })
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })

  let defaultPrevented = false
  try {
    target.disabled = true
    startFlowPortHandlePointerDrag({
      event: { button: 0, pointerId: 42, clientX: 0, clientY: 0, preventDefault: () => { defaultPrevented = true } } as React.PointerEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
      sourcePortKey: 'imageUrl',
    })
    const pointerMove = new dom.window.Event('pointermove')
    Object.defineProperties(pointerMove, {
      pointerId: { value: 42 },
      clientX: { value: 8 },
      clientY: { value: 16 },
    })
    document.dispatchEvent(pointerMove)
    const pointerUp = new dom.window.Event('pointerup')
    Object.defineProperties(pointerUp, {
      pointerId: { value: 42 },
      clientX: { value: 10 },
      clientY: { value: 20 },
    })
    document.dispatchEvent(pointerUp)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (!defaultPrevented) throw new Error('expected pointer drag to suppress the competing canvas gesture')
    if (!previewDetails.some(detail => detail.phase === 'start' && detail.sourcePortKey === 'imageUrl')) {
      throw new Error(`expected immediate semantic preview start for source port, got ${JSON.stringify(previewDetails)}`)
    }
    if (!previewDetails.some(detail => detail.phase === 'move' && detail.clientX === 8 && detail.clientY === 16)) {
      throw new Error(`expected semantic preview move before finalize, got ${JSON.stringify(previewDetails)}`)
    }
    if (clickCount !== 0) throw new Error(`expected disabled semantic target handle to avoid fallback click, got ${clickCount}`)
    if (finalizeDetail?.sourceNodeId !== 'source-node' || finalizeDetail.targetNodeId !== 'target-node' || finalizeDetail.targetPortKey !== 'imageUrl') {
      throw new Error(`expected semantic finalize event for disabled target handle, got ${JSON.stringify(finalizeDetail)}`)
    }
  } finally {
    target.remove()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export function testFlowPortHandlePointLookupFindsCoveredSharedHandle() {
  const dom = new JSDOM('<!doctype html><html><body><section id="cover"></section></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const cover = document.getElementById('cover')
  const target = document.createElement('button')
  target.dataset.kgPortHandle = '1'
  target.dataset.kgPortDir = 'out'
  target.dataset.kgPortNodeId = 'source-node'
  target.dataset.kgPortKey = 'videoUrl'
  document.body.appendChild(target)
  const originalElementFromPoint = document.elementFromPoint
  const originalElementsFromPoint = document.elementsFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => cover })
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [cover, target] })

  try {
    const found = readFlowPortHandleAtClientPoint({ clientX: 10, clientY: 20, dir: 'out' })
    if (found !== target) throw new Error(`expected covered shared source handle lookup, got ${found?.dataset.kgPortKey || 'none'}`)
    const mismatched = readFlowPortHandleAtClientPoint({ clientX: 10, clientY: 20, dir: 'in' })
    if (mismatched) throw new Error(`expected dir-filtered lookup to ignore covered output handle, got ${mismatched.dataset.kgPortKey}`)
  } finally {
    target.remove()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: originalElementsFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export async function testFlowPortHandleMouseDragCompletesOnSemanticInputHandle() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const target = document.createElement('button')
  target.dataset.kgPortHandle = '1'
  target.dataset.kgPortDir = 'in'
  target.dataset.kgPortNodeId = 'target-node'
  target.dataset.kgPortKey = 'videoUrl'
  document.body.appendChild(target)

  let clickCount = 0
  target.addEventListener('click', () => { clickCount += 1 })
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })

  try {
    startFlowPortHandleMouseDrag({
      event: { button: 0, clientX: 0, clientY: 0, preventDefault: () => undefined } as React.MouseEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
    })
    const mouseUp = new dom.window.MouseEvent('mouseup', { clientX: 10, clientY: 20 })
    document.dispatchEvent(mouseUp)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (clickCount !== 1) throw new Error(`expected semantic target handle click after mouse drag, got ${clickCount}`)
  } finally {
    target.remove()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export async function testFlowPortHandlePointerDragCompletesNearSemanticInputHandle() {
  const dom = new JSDOM('<!doctype html><html><body><section id="miss"></section></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const target = document.createElement('button')
  target.dataset.kgPortHandle = '1'
  target.dataset.kgPortDir = 'in'
  target.dataset.kgPortNodeId = 'target-node'
  target.dataset.kgPortKey = 'imageUrl'
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 100, top: 100, width: 8, height: 8, right: 108, bottom: 108, x: 100, y: 100, toJSON: () => ({}) }),
  })
  document.body.appendChild(target)

  let clickCount = 0
  target.addEventListener('click', () => { clickCount += 1 })
  const miss = document.getElementById('miss')
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => miss })

  try {
    startFlowPortHandlePointerDrag({
      event: { button: 0, pointerId: 7, clientX: 0, clientY: 0, preventDefault: () => undefined } as React.PointerEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
    })
    const pointerUp = new dom.window.Event('pointerup')
    Object.defineProperties(pointerUp, {
      pointerId: { value: 7 },
      clientX: { value: 118 },
      clientY: { value: 104 },
    })
    document.dispatchEvent(pointerUp)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (clickCount !== 1) throw new Error(`expected nearest semantic target handle click after drag, got ${clickCount}`)
  } finally {
    target.remove()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export async function testFlowPortHandlePointerDragCancelsWhenReleasedWithoutTarget() {
  const dom = new JSDOM('<!doctype html><html><body><section id="miss"></section></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const miss = document.getElementById('miss')
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => miss })

  let cancelDetail: FlowPortHandleCancelDetail | null = null
  const previewDetails: FlowPortHandlePreviewDetail[] = []
  document.addEventListener(FLOW_PORT_HANDLE_CANCEL_EVENT, event => { cancelDetail = (event as CustomEvent<FlowPortHandleCancelDetail>).detail })
  document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, event => { previewDetails.push((event as CustomEvent<FlowPortHandlePreviewDetail>).detail) })

  try {
    startFlowPortHandlePointerDrag({
      event: { button: 0, pointerId: 9, clientX: 10, clientY: 20, preventDefault: () => undefined } as React.PointerEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
      sourcePortKey: 'imageUrl',
    })
    const pointerUp = new dom.window.Event('pointerup')
    Object.defineProperties(pointerUp, {
      pointerId: { value: 9 },
      clientX: { value: 300 },
      clientY: { value: 400 },
    })
    document.dispatchEvent(pointerUp)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (cancelDetail?.sourceNodeId !== 'source-node' || cancelDetail.sourcePortKey !== 'imageUrl') {
      throw new Error(`expected semantic drag cancel when released away from target, got ${JSON.stringify(cancelDetail)}`)
    }
    if (!previewDetails.some(detail => detail.phase === 'cancel' && detail.clientX === 300 && detail.clientY === 400)) {
      throw new Error(`expected preview cancel on missed target release, got ${JSON.stringify(previewDetails)}`)
    }
  } finally {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export async function testFlowPortHandlePointerClickKeepsPendingConnectionWithoutTarget() {
  const dom = new JSDOM('<!doctype html><html><body><section id="miss"></section></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const miss = document.getElementById('miss')
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => miss })

  let cancelCount = 0
  const previewDetails: FlowPortHandlePreviewDetail[] = []
  document.addEventListener(FLOW_PORT_HANDLE_CANCEL_EVENT, () => { cancelCount += 1 })
  document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, event => {
    previewDetails.push((event as CustomEvent<FlowPortHandlePreviewDetail>).detail)
  })

  try {
    startFlowPortHandlePointerDrag({
      event: { button: 0, pointerId: 10, clientX: 120, clientY: 80, preventDefault: () => undefined } as React.PointerEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
      sourcePortKey: 'output',
    })
    const pointerUp = new dom.window.Event('pointerup')
    Object.defineProperties(pointerUp, {
      pointerId: { value: 10 },
      clientX: { value: 123 },
      clientY: { value: 83 },
    })
    document.dispatchEvent(pointerUp)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (cancelCount !== 0) throw new Error(`expected click-sized release to preserve pending connection mode, got ${cancelCount} cancel events`)
    if (!previewDetails.some(detail => detail.phase === 'cancel' && detail.clientX === 123 && detail.clientY === 83)) {
      throw new Error(`expected transient preview cleanup without cancelling click-to-connect, got ${JSON.stringify(previewDetails)}`)
    }
  } finally {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export async function testFlowPortHandleMouseClickKeepsPendingConnectionWithoutTarget() {
  const dom = new JSDOM('<!doctype html><html><body><section id="miss"></section></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const miss = document.getElementById('miss')
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => miss })

  let cancelCount = 0
  document.addEventListener(FLOW_PORT_HANDLE_CANCEL_EVENT, () => { cancelCount += 1 })

  try {
    startFlowPortHandleMouseDrag({
      event: { button: 0, clientX: 40, clientY: 50, preventDefault: () => undefined } as React.MouseEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
      sourcePortKey: 'output',
    })
    document.dispatchEvent(new dom.window.MouseEvent('mouseup', { clientX: 42, clientY: 54 }))
    await new Promise(resolve => setTimeout(resolve, 5))
    if (cancelCount !== 0) throw new Error(`expected mouse click-sized release to preserve pending connection mode, got ${cancelCount} cancel events`)
  } finally {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}

export async function testFlowPortHandleMouseFallbackDoesNotStartDuringActivePointerDrag() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
  const target = document.createElement('button')
  target.dataset.kgPortHandle = '1'
  target.dataset.kgPortDir = 'in'
  target.dataset.kgPortNodeId = 'target-node'
  target.dataset.kgPortKey = 'imageUrl'
  document.body.appendChild(target)

  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  const previewDetails: FlowPortHandlePreviewDetail[] = []
  let finalizeCount = 0
  document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, event => {
    previewDetails.push((event as CustomEvent<FlowPortHandlePreviewDetail>).detail)
  })
  document.addEventListener(FLOW_PORT_HANDLE_FINALIZE_EVENT, event => {
    finalizeCount += 1
    event.preventDefault()
  })

  try {
    const pointerStarted = startFlowPortHandlePointerDrag({
      event: { button: 0, pointerId: 11, clientX: 0, clientY: 0, preventDefault: () => undefined } as React.PointerEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
      sourcePortKey: 'imageUrl',
    })
    const mouseStarted = startFlowPortHandleMouseDrag({
      event: { button: 0, clientX: 0, clientY: 0, preventDefault: () => undefined } as React.MouseEvent<HTMLButtonElement>,
      sourceNodeId: 'source-node',
      sourcePortKey: 'imageUrl',
    })
    const mouseMove = new dom.window.MouseEvent('mousemove', { clientX: 8, clientY: 16 })
    document.dispatchEvent(mouseMove)
    const mouseUp = new dom.window.MouseEvent('mouseup', { clientX: 10, clientY: 20 })
    document.dispatchEvent(mouseUp)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (!pointerStarted) throw new Error('expected primary pointer drag session to start')
    if (mouseStarted) throw new Error('expected mouse fallback drag session to be ignored while pointer drag is active')
    const previewStartCount = previewDetails.filter(detail => detail.phase === 'start').length
    if (previewStartCount !== 1) {
      throw new Error(`expected one preview start for the owning pointer drag session, got ${previewStartCount}`)
    }
    if (!previewDetails.some(detail => detail.phase === 'move' && detail.clientX === 8 && detail.clientY === 16)) {
      throw new Error(`expected pointer-owned drag session to continue consuming mouse move events, got ${JSON.stringify(previewDetails)}`)
    }
    if (finalizeCount !== 1) {
      throw new Error(`expected one finalize event after suppressing duplicate mouse fallback, got ${finalizeCount}`)
    }
  } finally {
    target.remove()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    dom.window.close()
    if (previousDocumentDescriptor) Object.defineProperty(globalThis, 'document', previousDocumentDescriptor)
    else delete (globalThis as { document?: Document }).document
  }
}
