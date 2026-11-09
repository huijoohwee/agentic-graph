function openRequestDetails() {
  if (state.previewOnly || !state.store?.intakeEnabled) return
  renderRequestSummary()
  $("#arrangement-dialog").setAttribute("aria-labelledby", "request-title")
  $("#builder-step").hidden = true
  $("#request-step").hidden = false
  $("#service-date").focus()
}
function renderRequestSummary() {
  if (!state.product || !state.editor) return
  const product = state.product
  const editor = state.editor
  const selectedLabel = (group, id) => optionById(product.choices[group], id)?.label ?? "Unavailable"
  const selectedFinishLabel = group => optionById(product.finishing[group], editor.finishing[group])?.label ?? "Unavailable"
  const flowers = groupFlowerLayers(editor.flowers).map(stem => {
    const flower = product.flowers.find(item => item.id === stem.id)
    return flower ? stem.quantity + " × " + flower.label : null
  }).filter(Boolean)
  $("#request-summary-product").textContent = product.name
  $("#request-summary-art").innerHTML = bouquetSvg(product, editor.flowers, editor.finishing, "", editor.choices.size, false, true)
  $("#request-summary-total").textContent = money(editorEstimate())
  $("#request-summary-size").textContent = selectedLabel("size", editor.choices.size)
  $("#request-summary-stems").textContent = selectedLabel("stems", editor.choices.stems)
  $("#request-summary-ribbon").textContent = selectedFinishLabel("ribbon")
  $("#request-summary-outer-wrap").textContent = selectedFinishLabel("outerWrap")
  $("#request-summary-inner-wrap").textContent = selectedFinishLabel("innerWrap")
  $("#request-summary-flowers").textContent = flowers.join(", ") || "No flowers selected"
  $("#request-summary-fee").textContent = state.previewOnly
    ? "Synthetic estimate only; no fulfillment fee is represented."
    : $("#fulfillment").value === "delivery"
      ? "Includes the florist-set delivery fee of " + money(state.store.deliveryFeeMinor) + "."
      : "No delivery fee is included for studio pickup."
}
$("#back-to-builder").addEventListener("click", () => {
  $("#request-step").hidden = true
  $("#builder-step").hidden = false
  $("#arrangement-dialog").setAttribute("aria-labelledby", "dialog-title")
  $("#editor-continue").focus()
})
$("#contact-method").addEventListener("change", () => {
  const email = $("#contact-method").value === "email"
  $("#contact-value").type = email ? "email" : "tel"
  $("#contact-value").autocomplete = email ? "email" : "tel"
  $("#contact-value").placeholder = email ? "you@example.com" : "+65 ..."
})
$("#request-form").addEventListener("submit", async event => {
  event.preventDefault()
  if (state.previewOnly) {
    $("#request-error").textContent = "Request submission is disabled in the synthetic local preview."
    $("#request-error").hidden = false
    return
  }
  if (!state.product || !state.editor || !state.store?.intakeEnabled) return
  const requiredFields = ["#service-date", "#fulfillment", "#buyer-name", "#contact-method", "#contact-value", "#request-consent"]
  if ($("#fulfillment").value === "delivery") requiredFields.push("#delivery-address")
  if (!validateFields(requiredFields)) return
  const submit = $("#submit-request")
  submit.disabled = true
  $("#request-error").hidden = true
  const payload = {
    productId: state.product.id,
    choices: clone(state.editor.choices),
    finishing: clone(state.editor.finishing),
    flowers: groupFlowerLayers(state.editor.flowers),
    serviceDate: $("#service-date").value,
    fulfillment: $("#fulfillment").value,
    buyerName: $("#buyer-name").value.trim(),
    contactMethod: $("#contact-method").value,
    contactValue: $("#contact-value").value.trim(),
    deliveryAddress: $("#delivery-address").value.trim(),
    note: $("#gift-note").value.trim(),
    consent: $("#request-consent").checked,
  }
  try {
    const result = await api("requests", {
      method: "POST", headers: { "idempotency-key": state.idempotencyKey }, body: payload,
    })
    $("#request-step").hidden = true
    $("#request-confirmation").hidden = false
    $("#arrangement-dialog").setAttribute("aria-labelledby", "request-confirmation-title")
    $("#request-reference").textContent = result.requestId
    $("#confirmation-message").textContent = result.message
    $("#confirmation-close").focus()
  } catch (error) {
    $("#request-error").textContent = error.message
    $("#request-error").hidden = false
  } finally {
    submit.disabled = false
  }
})
$("#undo-edit").addEventListener("click", () => {
  if (state.historyIndex <= 0) return
  state.historyIndex -= 1
  applyComposition(state.history[state.historyIndex])
  renderEditor()
})
$("#redo-edit").addEventListener("click", () => {
  if (state.historyIndex >= state.history.length - 1) return
  state.historyIndex += 1
  applyComposition(state.history[state.historyIndex])
  renderEditor()
})
$("#save-snapshot").addEventListener("click", saveSnapshot)
$("#dialog-close").addEventListener("click", () => $("#arrangement-dialog").close())
$("#editor-back-to-shop").addEventListener("click", () => $("#arrangement-dialog").close())
$("#editor-continue").addEventListener("click", openRequestDetails)
$("#confirmation-close").addEventListener("click", () => $("#arrangement-dialog").close())
$("#arrangement-dialog").addEventListener("close", () => {
  state.product = null
  state.editor = null
  state.history = []
  state.historyIndex = -1
})
