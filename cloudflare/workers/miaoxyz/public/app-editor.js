function currentComposition() {
  if (!state.editor) return null
  return {
    choices: clone(state.editor.choices),
    finishing: clone(state.editor.finishing),
    flowers: clone(state.editor.flowers),
    selectedFlowerId: state.editor.selectedFlowerId,
  }
}

function applyComposition(composition) {
  state.editor = normalizeComposition(clone(composition))
}

function recordHistory() {
  const snapshot = currentComposition()
  const encoded = JSON.stringify(snapshot)
  if (JSON.stringify(state.history[state.historyIndex]) === encoded) return
  state.history = state.history.slice(0, state.historyIndex + 1)
  state.history.push(snapshot)
  if (state.history.length > 50) state.history.shift()
  state.historyIndex = state.history.length - 1
}

function snapshotStorageKey() {
  return "miaoxyz-compositions:" + state.catalog.revision + ":" + state.product.id
}

function readSnapshots() {
  try {
    const value = JSON.parse(sessionStorage.getItem(snapshotStorageKey()) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.map(item => item && ({ ...item, composition: normalizeComposition(item.composition) }))
      .filter(item => item && item.revision === state.catalog.revision && compositionIsValid(item.composition, state.product))
  } catch {
    return []
  }
}

function saveSnapshot() {
  if (!state.product || !state.editor) return
  const snapshots = readSnapshots()
  snapshots.unshift({
    id: requestKey(),
    name: state.product.name + " · " + new Date().toLocaleString(),
    revision: state.catalog.revision,
    composition: currentComposition(),
  })
  try {
    sessionStorage.setItem(snapshotStorageKey(), JSON.stringify(snapshots.slice(0, 8)))
    renderSnapshotList()
    $("#global-status").textContent = "Arrangement snapshot saved in this browser tab."
  } catch {
    $("#global-status").textContent = "This browser could not save the arrangement snapshot."
  }
}

function compositionIsValid(composition, product) {
  if (!composition || !composition.choices || !composition.finishing || !Array.isArray(composition.flowers)) return false
  for (const group of ["size", "stems"]) {
    if (!optionById(product.choices[group], composition.choices[group])) return false
  }
  for (const group of ["ribbon", "outerWrap", "innerWrap"]) {
    if (!optionById(product.finishing[group], composition.finishing[group])) return false
  }
  const keys = new Set()
  const counts = new Map()
  let total = 0
  for (const stem of composition.flowers) {
    const quantity = stem.quantity
    if (!product.flowers.some(flower => flower.id === stem.id && flower.available)
      || (stem.key && (keys.has(stem.key) || quantity !== 1)) || !Number.isInteger(quantity) || quantity < 1 || quantity > 12) return false
    if (![stem.offsetX ?? 0, stem.offsetY ?? 0, stem.scale ?? 1].every(Number.isFinite)
      || Math.abs(stem.offsetX ?? 0) > 240 || Math.abs(stem.offsetY ?? 0) > 240
      || (stem.scale ?? 1) < LAYER_SCALE_MIN || (stem.scale ?? 1) > LAYER_SCALE_MAX
      || !Number.isFinite(stem.rotation ?? 0) || Math.abs(stem.rotation ?? 0) > 180
      || (stem.mirrored !== undefined && typeof stem.mirrored !== "boolean")) return false
    if (stem.key) keys.add(stem.key)
    const count = (counts.get(stem.id) ?? 0) + quantity
    if (count > 12) return false
    counts.set(stem.id, count)
    total += quantity
  }
  return total >= 1 && total <= 30
}

function renderSnapshotList() {
  const snapshots = readSnapshots()
  $("#snapshot-empty").hidden = snapshots.length > 0
  $("#snapshot-list").innerHTML = snapshots.map(snapshot =>
    '<li class="snapshot-item"><span class="snapshot-name"><strong>' + escapeHtml(snapshot.name) +
    '</strong><small>' + escapeHtml(flowerCount(snapshot.composition)) +
    ' stems</small></span><button class="snapshot-restore" type="button" data-restore-snapshot="' +
    escapeHtml(snapshot.id) + '">Restore</button></li>',
  ).join("")
  $("#snapshot-list").querySelectorAll("[data-restore-snapshot]").forEach(button => {
    button.addEventListener("click", () => {
      const snapshot = readSnapshots().find(item => item.id === button.dataset.restoreSnapshot)
      if (!snapshot || !compositionIsValid(snapshot.composition, state.product)) return
      applyComposition(snapshot.composition)
      recordHistory()
      renderEditor()
      $("#global-status").textContent = "Saved arrangement restored."
    })
  })
}

function flowerCount(editor = state.editor) {
  return editor?.flowers.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 0
}

function setFlowerPickerOpen(open) {
  $("#flower-picker-popover").hidden = !open
  $("#open-flower-picker").setAttribute("aria-expanded", String(open))
  if (open) $("#flower-picker").focus()
}

document.addEventListener("keydown", event => {
  const popover = $("#flower-picker-popover")
  if (event.key !== "Escape" || popover.hidden) return
  event.preventDefault()
  event.stopPropagation()
  setFlowerPickerOpen(false)
  $("#open-flower-picker").focus({ preventScroll: true })
})

document.addEventListener("pointerdown", event => {
  const popover = $("#flower-picker-popover")
  const opener = $("#open-flower-picker")
  if (popover.hidden || !(event.target instanceof Node)) return
  if (!popover.contains(event.target) && !opener.contains(event.target)) setFlowerPickerOpen(false)
})

function captureEditorFocus() {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return null
  return {
    id: active.id,
    selectLayer: active.dataset.selectLayer ?? "",
    choice: active.dataset.choice ?? "",
    finish: active.dataset.finish ?? "",
    optionId: active.dataset.optionId ?? "",
    restoreSnapshot: active.dataset.restoreSnapshot ?? "",
  }
}

function focusFlowerLayer(layerKey) {
  const button = [...document.querySelectorAll("#flower-layer-list [data-select-layer]")]
    .find(element => element.dataset.selectLayer === layerKey)
  button?.focus({ preventScroll: true })
}

function restoreEditorFocus(focus) {
  if (!focus) return
  let target = focus.id ? document.getElementById(focus.id) : null
  const findMatch = (selector, key, value) => [...document.querySelectorAll(selector)]
    .find(element => element.dataset[key] === value)
  if (!target && focus.selectLayer) {
    focusFlowerLayer(focus.selectLayer)
    return
  }
  if (!target && focus.choice) target = [...document.querySelectorAll("[data-choice]")]
    .find(element => element.dataset.choice === focus.choice && element.dataset.optionId === focus.optionId)
  if (!target && focus.finish) target = [...document.querySelectorAll("[data-finish]")]
    .find(element => element.dataset.finish === focus.finish && element.dataset.optionId === focus.optionId)
  if (!target && focus.restoreSnapshot) target = findMatch("[data-restore-snapshot]", "restoreSnapshot", focus.restoreSnapshot)
  if (target && !target.disabled && !target.closest("[hidden]") && target !== document.activeElement) {
    target.focus({ preventScroll: true })
  }
}

function renderEditor() {
  const focus = captureEditorFocus()
  const product = state.product
  const editor = state.editor
  if (!product || !editor) return
  $("#builder-type-label").textContent = state.previewOnly ? "Synthetic sample design" : "Florist-approved design"
  $("#flower-type-label").textContent = "Flowers"
  $("#dialog-title").textContent = product.name
  $("#builder-product-description").textContent = product.description
  $("#builder-price-note").textContent = state.previewOnly
    ? "Synthetic values for local interface review. This is not a florist quote or service area."
    : (state.store?.priceNote || "The florist confirms final details and availability.")
      + " Service area: " + (state.store?.serviceArea || "To be set by the florist.")
  for (const [group, target] of [["size", "#builder-size-options"], ["stems", "#builder-stem-options"]]) {
    const options = product.choices[group].filter(option => option.available)
    $(target).innerHTML = options.map(option =>
      '<button type="button" class="segmented-option" data-choice="' + group + '" data-option-id="' +
      escapeHtml(option.id) + '" aria-pressed="' + (editor.choices[group] === option.id) + '">' +
      escapeHtml(option.label) + (option.priceDeltaMinor ? '<small>' +
      (option.priceDeltaMinor > 0 ? "+" : "−") + money(Math.abs(option.priceDeltaMinor)) + "</small>" : "") +
      "</button>",
    ).join("")
  }
  $("#stem-recipe-current").textContent = optionById(product.choices.stems, editor.choices.stems)?.label ?? "Choose"
  for (const [group, target] of [["ribbon", "#ribbon-options"], ["outerWrap", "#outer-wrap-options"], ["innerWrap", "#inner-wrap-options"]]) {
    const options = product.finishing[group].filter(option => option.available)
    $(target).innerHTML = options.map(option =>
      '<button type="button" class="finish-option" data-finish="' + group + '" data-option-id="' +
      escapeHtml(option.id) + '" aria-label="' + escapeHtml(option.label + (option.priceDeltaMinor ? ", " +
      (option.priceDeltaMinor > 0 ? "adds " : "reduces ") + money(Math.abs(option.priceDeltaMinor)) : ", included")) +
      '" aria-pressed="' + (editor.finishing[group] === option.id) + '"><span class="finish-swatch" style="--finish-color:' +
      safeColor(option.colorHex) + '"></span><span>' + escapeHtml(option.label) + "</span>" +
      (option.priceDeltaMinor ? "<small>" + (option.priceDeltaMinor > 0 ? "+" : "−") +
      money(Math.abs(option.priceDeltaMinor)) + "</small>" : "") + "</button>",
    ).join("")
  }
  const availableFlowers = product.flowers.filter(flower => flower.available)
  const picker = $("#flower-picker")
  const previous = picker.value
  picker.replaceChildren(new Option(state.previewOnly ? "Choose a sample flower" : "Choose a florist-approved flower", ""))
  availableFlowers.forEach(flower => picker.add(new Option(flower.label + " · " + money(flower.pricePerStemMinor) + " / stem", flower.id)))
  const selectedLayer = editor.flowers.find(item => item.key === editor.selectedFlowerId)
  const selectedPickerFlower = availableFlowers.find(flower => flower.id === selectedLayer?.id)
  if (selectedPickerFlower) picker.value = selectedPickerFlower.id
  else if (previous && availableFlowers.some(flower => flower.id === previous)) picker.value = previous
  else picker.value = availableFlowers[0]?.id ?? ""
  const pickedCount = editor.flowers.filter(item => item.id === picker.value).length
  $("#add-flower").disabled = !picker.value || flowerCount() >= 30 || pickedCount >= 12

  const list = $("#flower-layer-list")
  list.innerHTML = editor.flowers.map((item, index) => {
    const flower = product.flowers.find(entry => entry.id === item.id)
    const layerNumber = editor.flowers.slice(index).filter(entry => entry.id === item.id).length
    const label = flower ? flower.label + " " + layerNumber : ""
    return flower ? '<li class="flower-layer' + (editor.selectedFlowerId === item.key ? " is-selected" : "") +
      '" draggable="true" data-layer-key="' + escapeHtml(item.key) +
      '"><button class="layer-select" type="button" data-select-layer="' + escapeHtml(item.key) +
      '" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="Select ' + escapeHtml(label) +
      '. Drag to reorder, or use Alt plus an arrow key."><span class="layer-grip" aria-hidden="true">⠿</span><span class="flower-swatch" aria-hidden="true">' + flowerThumbnail(flower) + '</span><span>' +
      escapeHtml(label) + "</span></button></li>" : ""
  }).join("")
  $("#flower-layer-empty").hidden = editor.flowers.length > 0
  const selectedFlower = selectedLayer ? product.flowers.find(item => item.id === selectedLayer.id) : null
  const selectedIndex = selectedLayer ? editor.flowers.findIndex(item => item.key === selectedLayer.key) : -1
  const selectedNumber = selectedLayer
    ? editor.flowers.slice(selectedIndex).filter(item => item.id === selectedLayer.id).length : 0
  const selectedTypeCount = selectedFlower
    ? editor.flowers.filter(item => item.id === selectedFlower.id).length : 0
  $("#selected-flower-name").textContent = selectedFlower ? selectedFlower.label + " " + selectedNumber : "Nothing selected"
  $("#selected-flower-controls").hidden = !selectedLayer || !selectedFlower
  $("#selected-flower-hint").hidden = !!selectedLayer
  if (selectedLayer && selectedFlower) {
    $("#selected-layer-flower").innerHTML = availableFlowers.map(flower => {
      const count = editor.flowers.filter(item => item.id === flower.id).length
      const capped = flower.id !== selectedLayer.id && count >= 12
      return '<option value="' + escapeHtml(flower.id) + '"' + (flower.id === selectedLayer.id ? " selected" : "") +
        (capped ? " disabled" : "") + ">" + escapeHtml(flower.label) + " · " + money(flower.pricePerStemMinor) + " / stem</option>"
    }).join("")
    $("#selected-flower-quantity").value = String(selectedTypeCount)
    $("#selected-flower-quantity-value").textContent = String(selectedTypeCount)
    $("#selected-flower-price").textContent = money(selectedFlower.pricePerStemMinor) + " per stem · " +
      money(selectedFlower.pricePerStemMinor * selectedTypeCount) + " for this flower"
    $("#selected-flower-quantity").max = String(Math.min(12, selectedTypeCount + 30 - flowerCount()))
    $("#remove-selected-flower").disabled = editor.flowers.length <= 1
    syncSelectedLayerTransform()
  }
  $("#canvas-size-label").textContent = optionById(product.choices.size, editor.choices.size)?.label ?? "Bouquet"
  $("#canvas-layer-count").textContent = flowerCount() + " " + (flowerCount() === 1 ? "stem" : "stems")
  renderCanvas()
  $("#builder-estimate").textContent = money(editorEstimate())
  $("#builder-fee-note").textContent = state.previewOnly
    ? "Synthetic estimate only; no fulfillment fee is represented."
    : $("#fulfillment").value === "delivery"
      ? "Includes the florist-set delivery fee of " + money(state.store.deliveryFeeMinor) + "."
      : "No delivery fee is included for studio pickup."
  $("#editor-continue").disabled = state.previewOnly || !state.store?.intakeEnabled
  $("#editor-continue").title = state.previewOnly
    ? "Request submission is disabled in the synthetic local preview"
    : state.store?.intakeEnabled ? "Continue to the request details" : "Requests are paused"
  $("#undo-edit").disabled = state.historyIndex <= 0
  $("#redo-edit").disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1
  renderSnapshotList()
  renderRequestSummary()
  document.querySelectorAll("#builder-size-options [data-choice], #builder-stem-options [data-choice]").forEach(button => {
    button.addEventListener("click", () => {
      state.editor.choices[button.dataset.choice] = button.dataset.optionId
      recordHistory()
      renderEditor()
    })
  })
  document.querySelectorAll(".finish-options [data-finish]").forEach(button => {
    button.addEventListener("click", () => {
      state.editor.finishing[button.dataset.finish] = button.dataset.optionId
      recordHistory()
      renderEditor()
    })
  })
  $("#flower-picker").onchange = () => {
    const flowerId = $("#flower-picker").value
    state.editor.selectedFlowerId = [...state.editor.flowers].reverse().find(item => item.id === flowerId)?.key ?? ""
    renderEditor()
  }
  $("#open-flower-picker").onclick = () => setFlowerPickerOpen($("#flower-picker-popover").hidden)
  $("#add-flower").onclick = addFlower
  $("#selected-layer-flower").onchange = () => {
    const layer = selectedFlowerLayer()
    const flower = product.flowers.find(item => item.id === $("#selected-layer-flower").value && item.available)
    if (!layer || !flower || (flower.id !== layer.id && editor.flowers.filter(item => item.id === flower.id).length >= 12)) return
    layer.id = flower.id
    recordHistory()
    renderEditor()
    $("#selected-layer-flower").focus({ preventScroll: true })
  }
  $("#flower-layer-list").querySelectorAll("[data-select-layer]").forEach(button => {
    button.addEventListener("click", () => {
      const layerKey = button.dataset.selectLayer
      state.editor.selectedFlowerId = layerKey
      renderEditor()
      focusFlowerLayer(layerKey)
    })
    button.addEventListener("keydown", event => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
      event.preventDefault()
      moveFlower(button.dataset.selectLayer, event.key === "ArrowUp" ? -1 : 1)
    })
  })
  $("#flower-layer-list").querySelectorAll("[data-layer-key]").forEach(row => {
    row.addEventListener("dragstart", event => {
      if (!event.dataTransfer) return
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", row.dataset.layerKey)
      row.classList.add("is-dragging")
    })
    row.addEventListener("dragover", event => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
      row.classList.add("is-drop-target")
    })
    row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"))
    row.addEventListener("drop", event => {
      event.preventDefault()
      row.classList.remove("is-drop-target")
      const draggedId = event.dataTransfer?.getData("text/plain")
      if (draggedId) moveFlowerBefore(draggedId, row.dataset.layerKey)
    })
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging")
      $("#flower-layer-list").querySelectorAll(".is-drop-target").forEach(target => target.classList.remove("is-drop-target"))
    })
  })
  $("#selected-flower-quantity").oninput = updateSelectedQuantityPreview
  $("#selected-flower-quantity").onchange = () => {
    recordHistory()
    renderEditor()
  }
  const transformControls = [
    ["#selected-layer-horizontal", "offsetX", Number],
    ["#selected-layer-vertical", "offsetY", Number],
    ["#selected-layer-scale", "scale", value => Number(value) / 100],
    ["#selected-layer-rotation", "rotation", Number],
  ]
  transformControls.forEach(([selector, property, parse]) => {
    $(selector).oninput = () => updateFlowerLayer(state.editor.selectedFlowerId, { [property]: parse($(selector).value) })
    $(selector).onchange = () => {
      recordHistory()
      renderEditor()
      $(selector).focus({ preventScroll: true })
    }
  })
  $("#mirror-selected-layer").onclick = () => {
    const layer = selectedFlowerLayer()
    if (!layer) return
    updateFlowerLayer(layer.key, { mirrored: !layer.mirrored })
    recordHistory()
    renderEditor()
    $("#mirror-selected-layer").focus({ preventScroll: true })
  }
  $("#bring-selected-layer-into-view").onclick = () => {
    bringLayerIntoView(state.editor.selectedFlowerId)
  }
  $("#reset-selected-layer").onclick = () => {
    const layerKey = state.editor.selectedFlowerId
    updateFlowerLayer(layerKey, { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, mirrored: false })
    commitLayerEdit(layerKey)
  }
  $("#remove-selected-flower").onclick = () => {
    if (state.editor.selectedFlowerId) removeFlower(state.editor.selectedFlowerId)
  }
  restoreEditorFocus(focus)
}
