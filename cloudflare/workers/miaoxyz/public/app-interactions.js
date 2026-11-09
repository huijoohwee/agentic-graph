function setFlowerTypeCount(flowerId, desiredCount, preserveKey) {
  const matching = state.editor.flowers.filter(item => item.id === flowerId)
  const nextCount = Math.max(1, Math.min(12, desiredCount, matching.length + 30 - flowerCount()))
  if (nextCount < matching.length) {
    let removeCount = matching.length - nextCount
    const removable = matching.filter(item => item.key !== preserveKey).reverse()
    const removeKeys = new Set(removable.slice(0, removeCount).map(item => item.key))
    state.editor.flowers = state.editor.flowers.filter(item => !removeKeys.has(item.key))
  } else {
    for (let count = matching.length; count < nextCount; count += 1) {
      state.editor.flowers.push({ id: flowerId, key: requestKey(), quantity: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0, mirrored: false })
    }
  }
}

function updateSelectedQuantityPreview() {
  if (!state.editor || !state.product) return
  const layer = state.editor.flowers.find(item => item.key === state.editor.selectedFlowerId)
  const flower = layer && state.product.flowers.find(item => item.id === layer.id)
  if (!layer || !flower) return
  setFlowerTypeCount(layer.id, Number($("#selected-flower-quantity").value), layer.key)
  const count = state.editor.flowers.filter(item => item.id === layer.id).length
  $("#selected-flower-quantity-value").textContent = String(count)
  $("#selected-flower-price").textContent = money(flower.pricePerStemMinor) + " per stem · " +
    money(flower.pricePerStemMinor * count) + " for this flower"
  $("#canvas-layer-count").textContent = flowerCount() + " " + (flowerCount() === 1 ? "stem" : "stems")
  $("#builder-estimate").textContent = money(editorEstimate())
  renderCanvas()
}

function addFlower() {
  if (!state.product || !state.editor) return
  const flowerId = $("#flower-picker").value
  const flower = state.product.flowers.find(item => item.id === flowerId && item.available)
  if (!flower || flowerCount() >= 30) return
  if (state.editor.flowers.filter(item => item.id === flowerId).length >= 12) return
  const layer = { id: flowerId, key: requestKey(), quantity: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0, mirrored: false }
  state.editor.flowers.push(layer)
  state.editor.selectedFlowerId = layer.key
  setFlowerPickerOpen(false)
  recordHistory()
  renderEditor()
}

function removeFlower(layerKey) {
  if (!state.editor || state.editor.flowers.length <= 1) return
  const index = state.editor.flowers.findIndex(item => item.key === layerKey)
  if (index < 0) return
  state.editor.flowers.splice(index, 1)
  if (state.editor.selectedFlowerId === layerKey) {
    state.editor.selectedFlowerId = state.editor.flowers[Math.min(index, state.editor.flowers.length - 1)]?.key ?? ""
  }
  recordHistory()
  renderEditor()
}

function moveFlower(layerKey, direction) {
  if (!state.editor) return
  const index = state.editor.flowers.findIndex(item => item.key === layerKey)
  const target = index + direction
  if (index < 0 || target < 0 || target >= state.editor.flowers.length) return
  const [item] = state.editor.flowers.splice(index, 1)
  state.editor.flowers.splice(target, 0, item)
  state.editor.selectedFlowerId = layerKey
  recordHistory()
  renderEditor()
  focusFlowerLayer(layerKey)
}

function moveFlowerBefore(layerKey, targetLayerKey) {
  if (!state.editor || layerKey === targetLayerKey) return
  const index = state.editor.flowers.findIndex(item => item.key === layerKey)
  if (index < 0 || !state.editor.flowers.some(item => item.key === targetLayerKey)) return
  const [item] = state.editor.flowers.splice(index, 1)
  const target = state.editor.flowers.findIndex(entry => entry.key === targetLayerKey)
  if (target < 0) return
  state.editor.flowers.splice(target, 0, item)
  state.editor.selectedFlowerId = layerKey
  recordHistory()
  renderEditor()
  focusFlowerLayer(layerKey)
}

function openBuilder(productId, alreadyOpen = false) {
  const product = availableProducts().find(item => item.id === productId)
  if (!product || !state.store) return
  $("#arrangement-dialog").setAttribute("aria-labelledby", "dialog-title")
  state.product = product
  state.canvasView = defaultCanvasView()
  if (layerWheelCommitTimer) clearTimeout(layerWheelCommitTimer)
  layerWheelCommitTimer = 0
  canvasPointers.clear()
  canvasGesture = null
  const defaultChoice = (group, options) => {
    const preferredLabels = group === "size" ? ["medium", "signature"] : ["garden", "regular", "standard"]
    return options.find(option => option.available && preferredLabels.includes(option.id.toLowerCase()))?.id
      ?? options.find(option => option.available && preferredLabels.includes(option.label.toLowerCase()))?.id
      ?? options.find(option => option.available)?.id ?? ""
  }
  state.editor = {
    choices: Object.fromEntries(Object.entries(product.choices).map(([group, options]) => [
      group, defaultChoice(group, options),
    ])),
    finishing: defaultFinishing(product),
    flowers: expandFlowerRecipe(product.recipe),
    selectedFlowerId: "",
  }
  setFlowerPickerOpen(false)
  state.history = []
  state.historyIndex = -1
  state.idempotencyKey = requestKey()
  recordHistory()
  const dateInput = $("#service-date")
  dateInput.min = product.availableFrom > today() ? product.availableFrom : today()
  dateInput.max = product.availableUntil
  dateInput.value = ""
  const fulfillment = $("#fulfillment")
  fulfillment.replaceChildren()
  if (state.store.pickupEnabled) fulfillment.add(new Option("Studio pickup", "pickup"))
  if (state.store.deliveryEnabled) fulfillment.add(new Option("Delivery", "delivery"))
  $("#delivery-address").value = ""
  $("#delivery-address").required = fulfillment.value === "delivery"
  $("#delivery-address-wrap").hidden = fulfillment.value !== "delivery"
  $("#buyer-name").value = ""
  $("#contact-method").value = "email"
  $("#contact-value").value = ""
  $("#contact-value").type = "email"
  $("#contact-value").autocomplete = "email"
  $("#gift-note").value = ""
  $("#request-consent").checked = false
  $("#buyer-privacy-notice").textContent = state.store.privacyNotice +
    " (Notice " + state.store.privacyNoticeVersion + ")"
  $("#builder-step").hidden = false
  $("#request-step").hidden = true
  $("#request-confirmation").hidden = true
  $("#request-error").hidden = true
  $("#submit-request").disabled = state.previewOnly || !state.store.intakeEnabled
  renderEditor()
  if (!alreadyOpen) $("#arrangement-dialog").showModal()
}

function showOperator() {
  $("#public-view").hidden = true
  $("#operator-view").hidden = false
  $("#operator-auth").hidden = !!state.token
  $("#operator-content").hidden = true
  $("#operator-signout").hidden = !state.token
  if (state.token) loadOperator().catch(error => {
    sessionStorage.removeItem("miaoxyz-operator-token")
    state.token = ""
    $("#operator-auth").hidden = false
    $("#operator-signout").hidden = true
    setStatus("#operator-auth-error", error.message, true)
  })
  window.scrollTo(0, 0)
}

function showPublic() {
  $("#operator-view").hidden = true
  $("#public-view").hidden = false
  window.scrollTo(0, 0)
}

function fillSettings(settings, intake) {
  const form = $("#settings-form")
  form.elements.storeName.value = settings.storeName ?? ""
  form.elements.serviceArea.value = settings.serviceArea ?? ""
  form.elements.priceNote.value = settings.priceNote ?? ""
  form.elements.privacyNoticeVersion.value = settings.privacyNoticeVersion ?? ""
  form.elements.privacyNotice.value = settings.privacyNotice ?? ""
  form.elements.retentionDays.value = settings.retentionDays ?? ""
  form.elements.pickupEnabled.checked = settings.pickupEnabled ?? false
  form.elements.deliveryEnabled.checked = settings.deliveryEnabled ?? false
  form.elements.deliveryFeeSgd.value = settings.deliveryFeeMinor == null ? "" : (settings.deliveryFeeMinor / 100).toFixed(2)
  form.elements.orderIntakeEnabled.checked = intake ?? false
  form.elements.deliveryFeeSgd.required = form.elements.deliveryEnabled.checked
  $("#intake-state").textContent = intake ? "Requests open" : "Requests paused"
  $("#intake-state").classList.toggle("state-off", !intake)
  $("#runtime-gate-note").textContent = settings.intakeEnabled
    ? "Privacy, data region, backup/restore and rate-limit review controls are approved. The studio can enable customer requests."
    : "Requests stay paused until privacy, data region, backup/restore and rate-limit reviews are approved and operator/rate-limit secrets are configured."
}

async function loadOperator() {
  const [settingsResult, catalogResult, queueResult] = await Promise.all([
    api("operator/settings"), api("operator/catalog"), api("operator/requests"),
  ])
  fillSettings({ ...settingsResult.settings, retentionDays: settingsResult.retentionDays }, settingsResult.orderIntakeEnabled)
  $("#catalog-json").value = JSON.stringify(catalogResult.products, null, 2)
  $("#catalog-revision").textContent = "Revision " + catalogResult.revision
  renderQueue(queueResult.requests)
  $("#operator-auth").hidden = true
  $("#operator-content").hidden = false
  $("#operator-signout").hidden = false
  setStatus("#operator-auth-error", "")
}

function allowedStatuses(status) {
  return ({ submitted: ["accepted", "declined", "cancelled"], accepted: ["fulfilled", "cancelled"] })[status] ?? []
}

function renderQueue(requests) {
  const container = $("#queue-list")
  if (!requests.length) {
    container.innerHTML = '<p class="queue-empty">No requests yet. New requests will appear here.</p>'
    return
  }
  container.innerHTML = requests.map(item => {
    const request = item.request
    const snapshot = request.priceSnapshot
    const actions = allowedStatuses(item.status)
    const choiceLabels = Object.values(snapshot.choices).map(choice => escapeHtml(choice.label)).join(" · ")
    const finishLabels = Object.values(snapshot.finishing).map(choice => escapeHtml(choice.label)).join(" · ")
    const flowerLabels = snapshot.flowers.map(flower => escapeHtml(flower.quantity + " × " + flower.label)).join(", ")
    const layerEdits = snapshot.flowers.flatMap(flower => (flower.layers ?? []).map((layer, index) => {
      const offsetX = Math.round(layer.offsetX ?? 0)
      const offsetY = Math.round(layer.offsetY ?? 0)
      const scale = Math.round((layer.scale ?? 1) * 100)
      const rotation = Math.round(layer.rotation ?? 0)
      const mirrored = layer.mirrored === true
      if (offsetX === 0 && offsetY === 0 && scale === 100 && rotation === 0 && !mirrored) return null
      return escapeHtml(flower.label + " layer " + (flower.quantity - index) + ": position " + offsetX + ", " + offsetY +
        "; size " + scale + "%; rotation " + rotation + "°" + (mirrored ? "; mirrored horizontally" : ""))
    })).filter(Boolean)
    return '<article class="queue-card"><div class="queue-card-heading"><div><span class="request-reference">' +
      escapeHtml(item.requestId) + "</span><h3>" + escapeHtml(request.buyerName) + '</h3></div><span class="queue-status status-' +
      escapeHtml(item.status) + '">' + escapeHtml(item.status) + "</span></div><div class=\"queue-details\"><p><strong>" +
      escapeHtml(snapshot.product.name) + "</strong> · " + money(snapshot.totalMinor) + "</p><p>" + choiceLabels +
      " · " + finishLabels + "</p><p>Flowers: " + (flowerLabels || "included recipe only") + "</p>" +
      (layerEdits.length ? "<p>Layer layout: " + layerEdits.join("; ") + "</p>" : "") + "<p>" +
      escapeHtml(request.serviceDate) + " · " + escapeHtml(request.fulfillment) +
      (request.deliveryAddress ? " · " + escapeHtml(request.deliveryAddress) : "") + "</p><p>" +
      escapeHtml(request.contactMethod) + ": " + escapeHtml(request.contactValue) + "</p>" +
      (request.note ? "<p>Note: " + escapeHtml(request.note) + "</p>" : "") +
      "<small>Received " + escapeHtml(new Date(item.createdAt).toLocaleString()) + " · Retained until " +
      escapeHtml(item.retainUntil.slice(0, 10)) + "</small></div>" +
      (actions.length ? '<label class="queue-action">Update request<select data-request-status="' +
        escapeHtml(item.requestId) + '"><option value="">Choose status</option>' +
        actions.map(status => '<option value="' + status + '">' + status[0].toUpperCase() + status.slice(1) + "</option>").join("") +
        "</select></label>" : "") + "</article>"
  }).join("")
  container.querySelectorAll("[data-request-status]").forEach(select => select.addEventListener("change", async () => {
    if (!select.value) return
    try {
      await api("operator/requests/" + encodeURIComponent(select.dataset.requestStatus) + "/status", {
        method: "POST", body: { status: select.value },
      })
      setStatus("#queue-result", "Request status updated.")
      await refreshQueue()
    } catch (error) {
      setStatus("#queue-result", error.message, true)
      select.value = ""
    }
  }))
}

async function refreshQueue() {
  const data = await api("operator/requests")
  renderQueue(data.requests)
}

function validateFields(selectors) {
  for (const selector of selectors) {
    const field = $(selector)
    if (!field.checkValidity()) {
      field.reportValidity()
      return false
    }
  }
  return true
}

$("#operator-entry").addEventListener("click", showOperator)
document.querySelectorAll(".back-link").forEach(link => {
  if (link.tagName === "A") link.addEventListener("click", event => {
    event.preventDefault()
    showPublic()
  })
})
$("#operator-auth-form").addEventListener("submit", async event => {
  event.preventDefault()
  state.token = $("#operator-token").value.trim()
  sessionStorage.setItem("miaoxyz-operator-token", state.token)
  try { await loadOperator() } catch (error) {
    state.token = ""
    sessionStorage.removeItem("miaoxyz-operator-token")
    setStatus("#operator-auth-error", error.message, true)
  }
})
$("#operator-signout").addEventListener("click", () => {
  state.token = ""
  sessionStorage.removeItem("miaoxyz-operator-token")
  $("#operator-token").value = ""
  $("#operator-auth").hidden = false
  $("#operator-content").hidden = true
  $("#operator-signout").hidden = true
})
$("#settings-form").addEventListener("submit", async event => {
  event.preventDefault()
  const form = event.currentTarget
  const payload = {
    storeName: form.elements.storeName.value.trim(),
    serviceArea: form.elements.serviceArea.value.trim(),
    priceNote: form.elements.priceNote.value.trim(),
    privacyNoticeVersion: form.elements.privacyNoticeVersion.value.trim(),
    privacyNotice: form.elements.privacyNotice.value.trim(),
    retentionDays: Number(form.elements.retentionDays.value),
    pickupEnabled: form.elements.pickupEnabled.checked,
    deliveryEnabled: form.elements.deliveryEnabled.checked,
    deliveryFeeMinor: form.elements.deliveryFeeSgd.value === "" ? null : Math.round(Number(form.elements.deliveryFeeSgd.value) * 100),
    orderIntakeEnabled: form.elements.orderIntakeEnabled.checked,
  }
  try {
    await api("operator/settings", { method: "PUT", body: payload })
    const data = await api("operator/settings")
    fillSettings({ ...data.settings, retentionDays: data.retentionDays }, data.orderIntakeEnabled)
    setStatus("#settings-result", "Studio settings saved.")
    await loadCatalog()
  } catch (error) {
    setStatus("#settings-result", error.message, true)
  }
})
$("#publish-catalog").addEventListener("click", async () => {
  let products
  try { products = JSON.parse($("#catalog-json").value) } catch {
    setStatus("#catalog-result", "Catalog JSON is not valid. Correct it and try again.", true)
    return
  }
  try {
    const result = await api("operator/catalog", { method: "PUT", body: { products } })
    $("#catalog-revision").textContent = "Revision " + result.revision
    setStatus("#catalog-result", "Published revision " + result.revision + " with " + result.productCount +
      " design" + (result.productCount === 1 ? "" : "s") + ".")
    await loadCatalog()
    const settings = await api("operator/settings")
    fillSettings({ ...settings.settings, retentionDays: settings.retentionDays }, settings.orderIntakeEnabled)
  } catch (error) {
    setStatus("#catalog-result", error.message, true)
  }
})
$("#refresh-queue").addEventListener("click", () => refreshQueue()
  .then(() => setStatus("#queue-result", "Queue refreshed."))
  .catch(error => setStatus("#queue-result", error.message, true)))

for (const selector of ["#filter-price", "#filter-occasion", "#filter-palette", "#filter-date"]) {
  $(selector).addEventListener("input", renderCatalog)
  $(selector).addEventListener("change", renderCatalog)
}
$("#clear-filters").addEventListener("click", clearFilters)
$("#clear-no-match-filters").addEventListener("click", clearFilters)
$("#custom-bouquet").addEventListener("click", () => {
  const products = availableProducts()
  if (products.length === 1) openBuilder(products[0].id)
  else if (products.length > 1) {
    renderCustomChooser()
    $("#custom-design-dialog").showModal()
  } else {
    $("#collection").scrollIntoView({ behavior: "smooth" })
    $("#global-status").textContent = "Custom bouquets will be available after the florist publishes the first design."
  }
})
$("#compare-open").addEventListener("click", () => {
  renderCompare()
  $("#compare-dialog").showModal()
})
$("#compare-close").addEventListener("click", () => $("#compare-dialog").close())
$("#compare-dialog").addEventListener("click", event => {
  if (event.target === $("#compare-dialog")) $("#compare-dialog").close()
})
$("#custom-design-close").addEventListener("click", () => $("#custom-design-dialog").close())
$("#custom-design-dialog").addEventListener("click", event => {
  if (event.target === $("#custom-design-dialog")) $("#custom-design-dialog").close()
})
$("#fulfillment").addEventListener("change", () => {
  const delivery = $("#fulfillment").value === "delivery"
  $("#delivery-address-wrap").hidden = !delivery
  $("#delivery-address").required = delivery
  if (state.product) renderEditor()
})
$("#settings-form").elements.deliveryEnabled.addEventListener("change", event => {
  $("#settings-form").elements.deliveryFeeSgd.required = event.currentTarget.checked
})
