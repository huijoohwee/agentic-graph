const CANVAS_VIEW_WIDTH = 640
const CANVAS_VIEW_HEIGHT = 680
const CANVAS_ZOOM_MIN = 1
const CANVAS_ZOOM_MAX = 4
const LAYER_SCALE_MIN = 0.5
const LAYER_SCALE_MAX = 2
const canvasPointers = new Map()
let canvasGesture = null
let layerWheelCommitTimer = 0

function defaultCanvasView() {
  return { centerX: CANVAS_VIEW_WIDTH / 2, centerY: CANVAS_VIEW_HEIGHT / 2, zoom: CANVAS_ZOOM_MIN }
}

function clampCanvasView(view) {
  const zoom = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, Number(view?.zoom) || CANVAS_ZOOM_MIN))
  const width = CANVAS_VIEW_WIDTH / zoom
  const height = CANVAS_VIEW_HEIGHT / zoom
  const horizontalMargin = width * 0.4
  const verticalMargin = height * 0.4
  return {
    zoom,
    centerX: Math.max(horizontalMargin, Math.min(CANVAS_VIEW_WIDTH - horizontalMargin,
      Number.isFinite(view?.centerX) ? view.centerX : CANVAS_VIEW_WIDTH / 2)),
    centerY: Math.max(verticalMargin, Math.min(CANVAS_VIEW_HEIGHT - verticalMargin,
      Number.isFinite(view?.centerY) ? view.centerY : CANVAS_VIEW_HEIGHT / 2)),
  }
}

function canvasViewBounds(view = state.canvasView) {
  const zoom = view?.zoom || CANVAS_ZOOM_MIN
  const width = CANVAS_VIEW_WIDTH / zoom
  const height = CANVAS_VIEW_HEIGHT / zoom
  return {
    left: (view?.centerX ?? CANVAS_VIEW_WIDTH / 2) - width / 2,
    top: (view?.centerY ?? CANVAS_VIEW_HEIGHT / 2) - height / 2,
    width,
    height,
  }
}

function layerSvgTransform(layer, baseX, baseY) {
  const offsetX = Number.isFinite(layer.offsetX) ? Math.max(-240, Math.min(240, layer.offsetX)) : 0
  const offsetY = Number.isFinite(layer.offsetY) ? Math.max(-240, Math.min(240, layer.offsetY)) : 0
  const scale = Number.isFinite(layer.scale) ? Math.max(LAYER_SCALE_MIN, Math.min(LAYER_SCALE_MAX, layer.scale)) : 1
  const rotation = Number.isFinite(layer.rotation) ? Math.max(-180, Math.min(180, layer.rotation)) : 0
  const mirrorX = layer.mirrored === true ? -1 : 1
  return "translate(" + offsetX + " " + offsetY + ") translate(" + baseX + " " + baseY + ") rotate(" + rotation +
    ") scale(" + scale + " " + scale + ") scale(" + mirrorX + " 1) translate(" + -baseX + " " + -baseY + ")"
}

function selectedFlowerLayer() {
  return state.editor?.flowers.find(item => item.key === state.editor.selectedFlowerId) ?? null
}

function syncSelectedLayerTransform() {
  const layer = selectedFlowerLayer()
  if (!layer) return
  const values = [
    ["#selected-layer-horizontal", "#selected-layer-horizontal-value", Math.round(layer.offsetX ?? 0)],
    ["#selected-layer-vertical", "#selected-layer-vertical-value", Math.round(layer.offsetY ?? 0)],
    ["#selected-layer-scale", "#selected-layer-scale-value", Math.round((layer.scale ?? 1) * 100)],
    ["#selected-layer-rotation", "#selected-layer-rotation-value", Math.round(layer.rotation ?? 0)],
  ]
  values.forEach(([inputSelector, outputSelector, value]) => {
    const input = $(inputSelector)
    const output = $(outputSelector)
    if (!input || !output) return
    input.value = String(value)
    output.value = inputSelector.includes("scale") ? value + "%" : inputSelector.includes("rotation") ? value + "°" : String(value)
    output.textContent = output.value
  })
  $("#mirror-selected-layer").setAttribute("aria-pressed", String(layer.mirrored === true))
}

function syncLayerScaleHandleGeometry(group, canvas = $("#bouquet-canvas")) {
  const handle = group?.querySelector("[data-layer-scale-handle]")
  if (!handle || !canvas) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const matrix = handle.getScreenCTM()
  if (!matrix) return
  const screenScale = Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
  if (!Number.isFinite(screenScale) || screenScale <= 0) return
  const radiusScreen = 12
  const ringRadiusScreen = 33 * screenScale
  const offsetAxis = (ringRadiusScreen + radiusScreen + 2) / (Math.SQRT2 * screenScale)
  const radius = radiusScreen / screenScale
  handle.setAttribute("cx", String(Number(group.dataset.baseX) + offsetAxis))
  handle.setAttribute("cy", String(Number(group.dataset.baseY) - offsetAxis))
  handle.setAttribute("r", String(radius))
}

function syncCanvasLayerScaleHandles(canvas = $("#bouquet-canvas")) {
  if (!canvas) return
  for (const group of canvas.querySelectorAll(".bouquet-layer")) {
    const layer = state.editor?.flowers.find(item => item.key === group.dataset.layerKey)
    if (layer) syncLayerScaleHandleGeometry(group, canvas)
  }
}

function applyFlowerLayerVisual(layerKey, canvas = $("#bouquet-canvas")) {
  const layer = state.editor?.flowers.find(item => item.key === layerKey)
  if (!layer || !canvas) return
  const group = [...canvas.querySelectorAll(".bouquet-layer")].find(item => item.dataset.layerKey === layerKey)
  if (group) {
    group.setAttribute("transform", layerSvgTransform(layer, Number(group.dataset.baseX), Number(group.dataset.baseY)))
    const percent = Math.round((layer.scale ?? 1) * 100)
    const position = Math.round(layer.offsetX ?? 0) + ", " + Math.round(layer.offsetY ?? 0)
    const rotation = Math.round(layer.rotation ?? 0)
    group.setAttribute("aria-label", group.dataset.layerLabel + ", position " + position + ", size " + percent +
      " percent, rotation " + rotation + " degrees" + (layer.mirrored ? ", mirrored horizontally" : ""))
    const moveTarget = group.querySelector("[data-layer-move-key]")
    if (moveTarget) moveTarget.setAttribute("aria-label", "Move " + group.dataset.layerLabel + "; current position " + position)
    const handle = group.querySelector("[data-layer-scale-handle]")
    if (handle) {
      const percent = Math.round((layer.scale ?? 1) * 100)
      handle.setAttribute("aria-valuenow", String(percent))
      handle.setAttribute("aria-valuetext", percent + " percent")
      syncLayerScaleHandleGeometry(group, canvas)
    }
  }
  if (state.editor.selectedFlowerId === layerKey) syncSelectedLayerTransform()
}

function updateFlowerLayer(layerKey, changes, canvas = $("#bouquet-canvas")) {
  const layer = state.editor?.flowers.find(item => item.key === layerKey)
  if (!layer) return false
  if (Number.isFinite(changes.offsetX)) layer.offsetX = Math.max(-240, Math.min(240, changes.offsetX))
  if (Number.isFinite(changes.offsetY)) layer.offsetY = Math.max(-240, Math.min(240, changes.offsetY))
  if (Number.isFinite(changes.scale)) layer.scale = Math.max(LAYER_SCALE_MIN, Math.min(LAYER_SCALE_MAX, changes.scale))
  if (Number.isFinite(changes.rotation)) layer.rotation = Math.max(-180, Math.min(180, changes.rotation))
  if (typeof changes.mirrored === "boolean") layer.mirrored = changes.mirrored
  applyFlowerLayerVisual(layerKey, canvas)
  return true
}

function focusCanvasLayer(layerKey) {
  const target = [...document.querySelectorAll("#bouquet-canvas [data-layer-move-key]")]
    .find(element => element.dataset.layerMoveKey === layerKey)
  target?.focus({ preventScroll: true })
}

function applyCanvasView(canvas = $("#bouquet-canvas")) {
  if (!canvas) return
  state.canvasView = clampCanvasView(state.canvasView)
  const bounds = canvasViewBounds(state.canvasView)
  canvas.setAttribute("viewBox", [bounds.left, bounds.top, bounds.width, bounds.height]
    .map(value => value.toFixed(2)).join(" "))
  syncCanvasLayerScaleHandles(canvas)
  const zoom = Math.round(state.canvasView.zoom * 100)
  const output = $("#canvas-zoom-level")
  if (output) {
    output.textContent = zoom + "%"
    output.setAttribute("aria-label", "Canvas zoom " + zoom + " percent")
  }
}

function setCanvasViewAround(zoom, anchor, fraction) {
  const boundedZoom = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, zoom))
  const width = CANVAS_VIEW_WIDTH / boundedZoom
  const height = CANVAS_VIEW_HEIGHT / boundedZoom
  state.canvasView = clampCanvasView({
    zoom: boundedZoom,
    centerX: anchor.x + (0.5 - fraction.x) * width,
    centerY: anchor.y + (0.5 - fraction.y) * height,
  })
  applyCanvasView()
}

function zoomCanvasAt(zoom, clientX, clientY, canvas = $("#bouquet-canvas")) {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const bounds = canvasViewBounds(state.canvasView)
  const fraction = {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  }
  const anchor = { x: bounds.left + fraction.x * bounds.width, y: bounds.top + fraction.y * bounds.height }
  setCanvasViewAround(zoom, anchor, fraction)
}

function selectCanvasFlower(layerKey) {
  if (!layerKey || !state.editor?.flowers.some(item => item.key === layerKey)) return
  state.editor.selectedFlowerId = layerKey
  renderEditor()
  focusCanvasLayer(layerKey)
}

function beginCanvasPinch(canvas) {
  const pointers = [...canvasPointers.entries()].slice(0, 2)
  if (pointers.length < 2) return
  const [firstId, first] = pointers[0]
  const [secondId, second] = pointers[1]
  const startDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
  if (first.layerKey && first.layerKey === second.layerKey) {
    const layer = state.editor?.flowers.find(item => item.key === first.layerKey)
    if (!layer) return
    canvasGesture = {
      mode: "layer-pinch",
      pointerIds: [firstId, secondId],
      layerKey: first.layerKey,
      startDistance,
      startMidpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      startOffsetX: layer.offsetX ?? 0,
      startOffsetY: layer.offsetY ?? 0,
      startScale: layer.scale ?? 1,
      startBounds: canvasViewBounds(state.canvasView),
      moved: true,
      changed: false,
    }
    return
  }
  const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
  const rect = canvas.getBoundingClientRect()
  const bounds = canvasViewBounds(state.canvasView)
  const fraction = {
    x: Math.max(0, Math.min(1, (midpoint.x - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (midpoint.y - rect.top) / rect.height)),
  }
  canvasGesture = {
    mode: "pinch",
    pointerIds: [firstId, secondId],
    startDistance,
    startZoom: state.canvasView.zoom,
    anchor: { x: bounds.left + fraction.x * bounds.width, y: bounds.top + fraction.y * bounds.height },
    moved: true,
  }
}

function layerCenterClientPoint(canvas, layerKey) {
  const layerGroup = [...canvas.querySelectorAll(".bouquet-layer")]
    .find(item => item.dataset.layerKey === layerKey)
  if (!layerGroup) return null
  const rect = canvas.getBoundingClientRect()
  const bounds = canvasViewBounds(state.canvasView)
  const baseX = Number(layerGroup.dataset.baseX) + (state.editor.flowers.find(item => item.key === layerKey)?.offsetX ?? 0)
  const baseY = Number(layerGroup.dataset.baseY) + (state.editor.flowers.find(item => item.key === layerKey)?.offsetY ?? 0)
  return {
    x: rect.left + (baseX - bounds.left) * rect.width / bounds.width,
    y: rect.top + (baseY - bounds.top) * rect.height / bounds.height,
  }
}

function bringLayerIntoView(layerKey) {
  const canvas = $("#bouquet-canvas")
  const group = [...(canvas?.querySelectorAll(".bouquet-layer") ?? [])]
    .find(item => item.dataset.layerKey === layerKey)
  if (!canvas || !group) return
  const bounds = group.getBBox()
  const canvasMatrix = canvas.getScreenCTM()
  const groupMatrix = group.getScreenCTM()
  if (!canvasMatrix || !groupMatrix || !bounds.width || !bounds.height) return
  const toCanvas = canvasMatrix.inverse().multiply(groupMatrix)
  const points = [
    new DOMPoint(bounds.x, bounds.y),
    new DOMPoint(bounds.x + bounds.width, bounds.y),
    new DOMPoint(bounds.x, bounds.y + bounds.height),
    new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height),
  ].map(point => point.matrixTransform(toCanvas))
  const left = Math.min(...points.map(point => point.x))
  const right = Math.max(...points.map(point => point.x))
  const top = Math.min(...points.map(point => point.y))
  const bottom = Math.max(...points.map(point => point.y))
  const width = right - left
  const height = bottom - top
  const zoom = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX,
    CANVAS_VIEW_WIDTH / (width + 96), CANVAS_VIEW_HEIGHT / (height + 96)))
  state.canvasView = clampCanvasView({
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    zoom,
  })
  applyCanvasView(canvas)
}

function commitLayerEdit(layerKey, focus = true) {
  if (!state.editor?.flowers.some(item => item.key === layerKey)) return
  state.editor.selectedFlowerId = layerKey
  recordHistory()
  renderEditor()
  if (focus) focusCanvasLayer(layerKey)
}

function renderCanvas() {
  if (!state.product || !state.editor) return
  canvasPointers.clear()
  canvasGesture = null
  $("#bouquet-canvas").outerHTML = '<svg id="bouquet-canvas" class="bouquet-canvas" viewBox="0 0 640 680" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Live bouquet composition. Each flower layer can be moved, resized, and rotated." tabindex="0" aria-describedby="canvas-gesture-help" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - Home">' +
    bouquetSvg(state.product, state.editor.flowers, state.editor.finishing, state.editor.selectedFlowerId, state.editor.choices.size, true)
      .replace(/^<svg[^>]*>|<\/svg>$/gu, "") + "</svg>"
  const canvas = $("#bouquet-canvas")
  applyCanvasView(canvas)

  canvas.querySelectorAll("[data-layer-move-key]").forEach(target => {
    target.addEventListener("click", () => {
      const layerKey = target.dataset.layerMoveKey
      if (state.editor.selectedFlowerId !== layerKey) selectCanvasFlower(layerKey)
    })
    target.addEventListener("focus", () => {
      const layerKey = target.dataset.layerMoveKey
      if (state.editor.selectedFlowerId === layerKey) return
      state.editor.selectedFlowerId = layerKey
      renderEditor()
      focusCanvasLayer(layerKey)
    })
  })

  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (!canvasPointers.has(event.pointerId) && canvasPointers.size >= 2) return
    event.preventDefault()
    const element = event.target instanceof Element ? event.target : null
    const layer = element?.closest(".bouquet-layer")
    const scaleHandle = element?.closest("[data-layer-scale-handle]")
    const layerKey = layer?.dataset.layerKey ?? ""
    canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY, layerKey })
    canvas.setPointerCapture(event.pointerId)
    if (canvasPointers.size === 1) {
      const mode = scaleHandle ? "layer-scale-handle" : layerKey ? "layer-move" : "pan"
      const currentLayer = state.editor.flowers.find(item => item.key === layerKey)
      const center = scaleHandle ? layerCenterClientPoint(canvas, layerKey) : null
      canvasGesture = {
        mode, pointerId: event.pointerId, layerKey,
        startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
        startOffsetX: currentLayer?.offsetX ?? 0, startOffsetY: currentLayer?.offsetY ?? 0,
        startScale: currentLayer?.scale ?? 1,
        startDistance: center ? Math.max(1, Math.hypot(event.clientX - center.x, event.clientY - center.y)) : 1,
        moved: false, changed: false,
      }
    } else {
      beginCanvasPinch(canvas)
    }
  })

  canvas.addEventListener("pointermove", event => {
    if (!canvasPointers.has(event.pointerId) || !canvasGesture) return
    const previous = canvasPointers.get(event.pointerId)
    canvasPointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY })
    const gesture = canvasGesture
    if (canvasPointers.size >= 2) {
      if (gesture.mode !== "pinch" && gesture.mode !== "layer-pinch") beginCanvasPinch(canvas)
      const pinch = canvasGesture
      const first = canvasPointers.get(pinch.pointerIds?.[0])
      const second = canvasPointers.get(pinch.pointerIds?.[1])
      if (!first || !second) return
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      if (pinch.mode === "layer-pinch") {
        const rect = canvas.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const deltaX = (midpoint.x - pinch.startMidpoint.x) * pinch.startBounds.width / rect.width
        const deltaY = (midpoint.y - pinch.startMidpoint.y) * pinch.startBounds.height / rect.height
        const nextScale = pinch.startScale * distance / pinch.startDistance
        const changed = Math.abs(nextScale - pinch.startScale) > 0.01 || Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1
        pinch.changed ||= changed
        updateFlowerLayer(pinch.layerKey, {
          offsetX: pinch.startOffsetX + deltaX,
          offsetY: pinch.startOffsetY + deltaY,
          scale: nextScale,
        }, canvas)
      } else {
        const rect = canvas.getBoundingClientRect()
        const bounds = canvasViewBounds(state.canvasView)
        setCanvasViewAround(pinch.startZoom * distance / pinch.startDistance, pinch.anchor, {
          x: Math.max(0, Math.min(1, (midpoint.x - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (midpoint.y - rect.top) / rect.height)),
        })
        pinch.changed = true
      }
      event.preventDefault()
      return
    }
    const gestureOne = canvasGesture
    if (gestureOne.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gestureOne.lastX
    const deltaY = event.clientY - gestureOne.lastY
    if (Math.hypot(event.clientX - gestureOne.startX, event.clientY - gestureOne.startY) > 4) {
      gestureOne.moved = true
      if (gestureOne.mode === "pan") canvas.classList.add("is-panning")
      if (gestureOne.mode.startsWith("layer-")) canvas.classList.add("is-layer-manipulating")
    }
    if (!gestureOne.moved) return
    if (gestureOne.mode === "layer-move") {
      const rect = canvas.getBoundingClientRect()
      const bounds = canvasViewBounds(state.canvasView)
      if (!rect.width || !rect.height) return
      updateFlowerLayer(gestureOne.layerKey, {
        offsetX: (state.editor.flowers.find(item => item.key === gestureOne.layerKey)?.offsetX ?? 0) + deltaX * bounds.width / rect.width,
        offsetY: (state.editor.flowers.find(item => item.key === gestureOne.layerKey)?.offsetY ?? 0) + deltaY * bounds.height / rect.height,
      }, canvas)
      gestureOne.changed = true
    } else if (gestureOne.mode === "layer-scale-handle") {
      const center = layerCenterClientPoint(canvas, gestureOne.layerKey)
      const currentLayer = state.editor.flowers.find(item => item.key === gestureOne.layerKey)
      if (!center || !currentLayer) return
      const distance = Math.max(1, Math.hypot(event.clientX - center.x, event.clientY - center.y))
      const nextScale = gestureOne.startScale * distance / gestureOne.startDistance
      updateFlowerLayer(gestureOne.layerKey, { scale: nextScale }, canvas)
      gestureOne.changed = Math.abs(nextScale - gestureOne.startScale) > 0.01
    } else if (gestureOne.mode === "pan") {
      const rect = canvas.getBoundingClientRect()
      const bounds = canvasViewBounds(state.canvasView)
      if (!rect.width || !rect.height) return
      state.canvasView = clampCanvasView({
        ...state.canvasView,
        centerX: state.canvasView.centerX - deltaX * bounds.width / rect.width,
        centerY: state.canvasView.centerY - deltaY * bounds.height / rect.height,
      })
      applyCanvasView(canvas)
      gestureOne.changed = true
    }
    gestureOne.lastX = event.clientX
    gestureOne.lastY = event.clientY
    event.preventDefault()
  })

  const finishPointer = (event, cancelled = false) => {
    const pointer = canvasPointers.get(event.pointerId)
    if (!pointer) return
    const gesture = canvasGesture
    canvasPointers.delete(event.pointerId)
    if (canvasPointers.size === 1 && (gesture?.mode === "pinch" || gesture?.mode === "layer-pinch")) {
      const [[pointerId, remaining]] = canvasPointers.entries()
      const layerKey = gesture.mode === "layer-pinch" ? gesture.layerKey : ""
      canvasGesture = {
        mode: layerKey ? "layer-move" : "pan", pointerId, layerKey,
        startX: remaining.x, startY: remaining.y, lastX: remaining.x, lastY: remaining.y,
        moved: true, changed: gesture.changed,
      }
    } else if (canvasPointers.size === 0) {
      canvasGesture = null
      canvas.classList.remove("is-panning", "is-layer-manipulating")
      if (gesture?.mode.startsWith("layer-") && gesture.layerKey) {
        if (gesture.changed) commitLayerEdit(gesture.layerKey)
        else if (!cancelled && gesture.mode === "layer-move") selectCanvasFlower(gesture.layerKey)
      } else if (!cancelled && gesture?.mode === "pan" && !gesture.moved && pointer.layerKey) {
        selectCanvasFlower(pointer.layerKey)
      }
    }
  }
  canvas.addEventListener("pointerup", event => finishPointer(event))
  canvas.addEventListener("pointercancel", event => finishPointer(event, true))
  canvas.addEventListener("lostpointercapture", event => finishPointer(event, true))

  canvas.addEventListener("wheel", event => {
    const layer = event.target instanceof Element ? event.target.closest(".bouquet-layer") : null
    if (layer) {
      event.preventDefault()
      const layerKey = layer.dataset.layerKey
      const currentLayer = state.editor.flowers.find(item => item.key === layerKey)
      if (!currentLayer) return
      state.editor.selectedFlowerId = layerKey
      updateFlowerLayer(layerKey, { scale: (currentLayer.scale ?? 1) * Math.exp(-event.deltaY * 0.0015) }, canvas)
      if (layerWheelCommitTimer) clearTimeout(layerWheelCommitTimer)
      layerWheelCommitTimer = setTimeout(() => {
        layerWheelCommitTimer = 0
        commitLayerEdit(layerKey)
      }, 260)
      return
    }
    event.preventDefault()
    zoomCanvasAt(state.canvasView.zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY, canvas)
  }, { passive: false })

  canvas.addEventListener("keydown", event => {
    const target = event.target instanceof Element ? event.target : null
    const scaleHandle = target?.closest("[data-layer-scale-handle]")
    const moveTarget = target?.closest("[data-layer-move-key]")
    if (scaleHandle || moveTarget) {
      const layerKey = scaleHandle?.dataset.layerScaleHandle ?? moveTarget.dataset.layerMoveKey
      const layer = state.editor.flowers.find(item => item.key === layerKey)
      if (!layer) return
      let changes = null
      if (scaleHandle) {
        if (event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "+" || event.key === "=") changes = { scale: (layer.scale ?? 1) + 0.05 }
        else if (event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "-") changes = { scale: (layer.scale ?? 1) - 0.05 }
        else if (event.key === "Home") changes = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, mirrored: false }
      } else if (event.key === "ArrowLeft") changes = { offsetX: (layer.offsetX ?? 0) - 8 / state.canvasView.zoom }
      else if (event.key === "ArrowRight") changes = { offsetX: (layer.offsetX ?? 0) + 8 / state.canvasView.zoom }
      else if (event.key === "ArrowUp") changes = { offsetY: (layer.offsetY ?? 0) - 8 / state.canvasView.zoom }
      else if (event.key === "ArrowDown") changes = { offsetY: (layer.offsetY ?? 0) + 8 / state.canvasView.zoom }
      else if (event.key === "+" || event.key === "=" || event.key === "Add") changes = { scale: (layer.scale ?? 1) + 0.05 }
      else if (event.key === "-" || event.key === "Subtract") changes = { scale: (layer.scale ?? 1) - 0.05 }
      else if (event.key === "Home") changes = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, mirrored: false }
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        selectCanvasFlower(layerKey)
        return
      }
      if (!changes) return
      event.preventDefault()
      state.editor.selectedFlowerId = layerKey
      updateFlowerLayer(layerKey, changes, canvas)
      commitLayerEdit(layerKey)
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const step = 40 / state.canvasView.zoom
    const next = { ...state.canvasView }
    if (event.key === "ArrowLeft") next.centerX += step
    else if (event.key === "ArrowRight") next.centerX -= step
    else if (event.key === "ArrowUp") next.centerY += step
    else if (event.key === "ArrowDown") next.centerY -= step
    else if (event.key === "+" || event.key === "=" || event.key === "Add") {
      event.preventDefault()
      zoomCanvasAt(state.canvasView.zoom * 1.25, x, y, canvas)
      return
    } else if (event.key === "-" || event.key === "Subtract") {
      event.preventDefault()
      zoomCanvasAt(state.canvasView.zoom / 1.25, x, y, canvas)
      return
    } else if (event.key === "Home") {
      event.preventDefault()
      state.canvasView = defaultCanvasView()
      applyCanvasView(canvas)
      return
    } else return
    event.preventDefault()
    state.canvasView = clampCanvasView(next)
    applyCanvasView(canvas)
  })
  const zoomAtCenter = scale => {
    const rect = canvas.getBoundingClientRect()
    zoomCanvasAt(state.canvasView.zoom * scale, rect.left + rect.width / 2, rect.top + rect.height / 2, canvas)
  }
  $("#canvas-zoom-in").onclick = () => zoomAtCenter(1.25)
  $("#canvas-zoom-out").onclick = () => zoomAtCenter(1 / 1.25)
  $("#canvas-view-reset").onclick = () => {
    state.canvasView = defaultCanvasView()
    applyCanvasView(canvas)
  }
}
