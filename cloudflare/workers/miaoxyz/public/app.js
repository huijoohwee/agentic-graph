async function loadCatalog() {
  if (state.previewOnly) {
    state.catalog = { revision: 0, products: demoProducts }
    state.store = {
      storeName: "Local interface preview",
      serviceArea: "Synthetic data only",
      priceNote: "Synthetic sample values only.",
      privacyNoticeVersion: "preview",
      privacyNotice: "The local synthetic preview does not submit or store customer requests.",
      deliveryFeeMinor: 0,
      pickupEnabled: true,
      deliveryEnabled: false,
      intakeEnabled: false,
    }
    $("#preview-banner").hidden = false
    $("#hero-intro").textContent = "Explore eight synthetic bouquet samples and try the collection and editing controls. No request or service is available in this preview."
    $("#hero-quiet-note").textContent = "Synthetic data · no request submission"
    $("#hero-proof-label").textContent = "SYNTHETIC SAMPLE DESIGNS"
    $("#collection-intro").textContent = "Synthetic examples demonstrate filtering, comparison, and bounded arrangement editing. They are not florist offerings or price quotes."
    $("#store-summary").textContent = "Local demonstration · not a live service area"
    $("#store-summary").hidden = false
    $("#process-heading").textContent = "Choose the controls. Explore the editor."
    $("#process-intro").textContent = "Use this sample catalog to explore the interface. No live order workflow or service is available in the local preview."
    $("#step-one-copy").textContent = "Filter synthetic designs by occasion, palette, date, or sample estimate."
    $("#step-two-copy").textContent = "Adjust sample recipe options, flowers, and wrapping; the synthetic estimate updates as you choose."
    $("#step-three-title").textContent = "Explore the editor"
    $("#step-three-copy").textContent = "Request submission is disabled. The sample catalog and prices exist only in this local browser preview."
    $("#promise-copy").textContent = "Sample designs demonstrate the interface only. They are not florist offerings, quotes, or service promises."
    $("#footer-copy").textContent = "Local synthetic preview · no request submission"
    renderFilters()
    renderCatalog()
    alignInitialCollectionHash()
    $("#global-status").textContent = "Synthetic local preview loaded. Request submission is disabled."
    return
  }
  try {
    const result = await api("catalog")
    state.catalog = { revision: result.revision, products: result.products }
    state.store = result.store
    state.compareIds = state.compareIds.filter(id => state.catalog.products.some(product => product.id === id && product.available))
    const summary = [state.store.storeName, state.store.serviceArea].filter(Boolean).join(" · ")
    $("#store-summary").textContent = summary
    $("#store-summary").hidden = !summary
    renderFilters()
    renderCatalog()
    alignInitialCollectionHash()
    $("#global-status").textContent = availableProducts().length + " designs available."
  } catch (error) {
    $("#catalog-empty").hidden = true
    $("#catalog-error").hidden = false
    $("#catalog-error").textContent = error.message
    alignInitialCollectionHash()
  }
}

function alignInitialCollectionHash() {
  if (location.hash !== "#collection") return
  requestAnimationFrame(() => $("#collection").scrollIntoView({ behavior: "instant", block: "start" }))
}

if (state.token) showOperator()
loadCatalog()
