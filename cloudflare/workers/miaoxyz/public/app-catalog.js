function renderFilters() {
  const products = availableProducts()
  const fillTags = (selector, tags, initial) => {
    const select = $(selector)
    const previous = select.value
    select.replaceChildren(new Option(initial, ""))
    for (const tag of [...new Set(tags)].sort((a, b) => a.localeCompare(b))) select.add(new Option(tag, tag))
    if ([...select.options].some(option => option.value === previous)) select.value = previous
    select.disabled = products.length === 0
  }
  fillTags("#filter-occasion", products.flatMap(product => product.occasionTags), "Any occasion")
  fillTags("#filter-palette", products.flatMap(product => product.paletteTags), "Any palette")
  const price = $("#filter-price")
  const previousPrice = price.value
  price.replaceChildren(new Option("Any price", ""))
  const priceBands = [
    { label: "Under S$50", low: 0, high: 5000 },
    { label: "S$50–59", low: 5000, high: 6000 },
    { label: "S$60–69", low: 6000, high: 7000 },
    { label: "S$70+", low: 7000, high: Infinity },
  ]
  for (const band of priceBands) {
    price.add(new Option(band.label, band.low + ":" + band.high))
  }
  if ([...price.options].some(option => option.value === previousPrice)) price.value = previousPrice
  price.disabled = products.length === 0
  $("#filter-date").disabled = products.length === 0
}

function renderCatalog() {
  const filterRange = $("#filter-price").value
  const [priceMin, priceMax] = filterRange ? filterRange.split(":").map(Number) : [null, null]
  const occasion = $("#filter-occasion").value
  const palette = $("#filter-palette").value
  const date = $("#filter-date").value
  $("#collection").classList.toggle("has-products", state.catalog.products.length > 0)
  const matches = availableProducts().filter(product =>
    (!occasion || product.occasionTags.includes(occasion))
    && (!palette || product.paletteTags.includes(palette))
    && (priceMin === null || (startingEstimate(product) >= priceMin && startingEstimate(product) < priceMax))
    && (!date || (date >= product.availableFrom && date <= product.availableUntil)))
  $("#catalog-count").textContent = matches.length + " " + (matches.length === 1 ? "bouquet" : "bouquets")
  $("#catalog-grid").innerHTML = matches.map((product, index) => {
    const art = bouquetSvg(product, product.recipe, defaultFinishing(product), "", "signature")
    const selected = state.compareIds.includes(product.id)
    return '<article class="product-card">' +
      '<div class="product-art product-art-tone-' + (index % 3 + 1) + '">' + art +
      '<span class="product-art-badge">' + escapeHtml(state.previewOnly ? "Local sample" : product.occasionTags[0] || "Studio design") + "</span></div>" +
      '<div class="product-card-body"><h3>' + escapeHtml(product.name) +
      '</h3><p class="product-description">' + escapeHtml(product.description) +
      '</p><span class="product-price">From ' + money(startingEstimate(product)) +
      '</span><div class="product-card-actions"><button class="product-icon-action" type="button" data-compare="' +
      escapeHtml(product.id) + '" aria-pressed="' + selected + '" aria-label="' +
      (selected ? "Remove " + escapeHtml(product.name) + " from comparison" : "Compare " + escapeHtml(product.name)) +
      '" title="' + (selected ? "Remove from comparison" : state.compareIds.length >= 3
        ? "Remove a design before adding another" : "Add to comparison") + '"' +
      (!selected && state.compareIds.length >= 3 ? " disabled" : "") + '>' + (selected ? "✓" : "+") +
      '</button><button class="product-icon-action" type="button" data-customize="' + escapeHtml(product.id) +
      '" aria-label="Customize ' + escapeHtml(product.name) + '" title="Customize this design">✎</button>' +
      (state.previewOnly
        ? '<button class="product-request-action" type="button" data-customize="' + escapeHtml(product.id) +
          '" aria-label="Preview ' + escapeHtml(product.name) + '" title="Explore this sample in the editor; requests are disabled in the local preview">Preview design</button>'
        : '<button class="product-request-action" type="button" data-request-design="' + escapeHtml(product.id) +
          '">Start request</button>') + '</div></div></article>'
  }).join("")
  $("#catalog-empty").hidden = state.catalog.products.length > 0
  const noAvailable = state.catalog.products.length > 0 && availableProducts().length === 0
  $("#catalog-unavailable").hidden = !noAvailable
  const noMatches = availableProducts().length > 0 && matches.length === 0
  $("#catalog-error").hidden = !noMatches
  if (noMatches) $("#catalog-error-message").textContent = "No current designs match those filters. Try widening your choices."
  $("#catalog-grid").querySelectorAll("[data-customize], [data-request-design]").forEach(button => {
    button.addEventListener("click", () => openBuilder(button.dataset.customize || button.dataset.requestDesign))
  })
  $("#catalog-grid").querySelectorAll("[data-compare]").forEach(button => {
    button.addEventListener("click", () => toggleCompare(button.dataset.compare))
  })
  renderCompareButton()
}

function clearFilters() {
  const moveFocusToPrice = document.activeElement?.id === "clear-no-match-filters"
  $("#filter-occasion").value = ""
  $("#filter-palette").value = ""
  $("#filter-price").value = ""
  $("#filter-date").value = ""
  renderCatalog()
  if (moveFocusToPrice) $("#filter-price").focus({ preventScroll: true })
}

function renderCompareButton() {
  const compare = $("#compare-open")
  const count = state.compareIds.length
  $("#compare-count").textContent = "Compare (" + count + ")"
  $("#compare-limit-note").hidden = count < 3
  compare.disabled = false
  compare.setAttribute("aria-label", count === 0 ? "Open design comparison; no designs selected"
    : "Compare " + count + " design" + (count === 1 ? "; choose one more" : "s"))
  compare.title = count < 2 ? "Open comparison and choose at least two designs" : "Compare selected designs"
}

function toggleCompare(productId) {
  const compareDialog = $("#compare-dialog")
  const activeRemoveButton = document.activeElement instanceof HTMLElement
    ? document.activeElement.closest("#compare-content [data-remove-compare]")
    : null
  const focusIndex = activeRemoveButton
    ? [...document.querySelectorAll("#compare-content [data-remove-compare]")].indexOf(activeRemoveButton)
    : -1
  if (state.compareIds.includes(productId)) {
    state.compareIds = state.compareIds.filter(id => id !== productId)
  } else if (state.compareIds.length < 3) {
    state.compareIds.push(productId)
  } else {
    $("#global-status").textContent = "You can compare up to three designs at a time."
    return
  }
  $("#catalog-grid").querySelectorAll("[data-compare]").forEach(button => {
    const selected = state.compareIds.includes(button.dataset.compare)
    const name = state.catalog.products.find(product => product.id === button.dataset.compare)?.name ?? "design"
    button.setAttribute("aria-pressed", String(selected))
    button.setAttribute("aria-label", selected ? "Remove " + name + " from comparison" : "Compare " + name)
    button.disabled = !selected && state.compareIds.length >= 3
    button.title = selected ? "Remove from comparison" : button.disabled
      ? "Remove a design before adding another" : "Add to comparison"
    button.textContent = selected ? "✓" : "+"
  })
  if (compareDialog.open) {
    renderCompare()
    if (activeRemoveButton) {
      const removeButtons = [...document.querySelectorAll("#compare-content [data-remove-compare]")]
      const focusTarget = removeButtons[Math.min(focusIndex, removeButtons.length - 1)] ?? $("#compare-close")
      focusTarget.focus({ preventScroll: true })
    }
  } else {
    renderCompareButton()
  }
}

function renderCompare() {
  const products = state.compareIds
    .map(id => availableProducts().find(product => product.id === id))
    .filter(Boolean)
  const guidance = $("#compare-guidance")
  $("#compare-content").dataset.count = String(products.length)
  guidance.hidden = products.length >= 2
  guidance.textContent = products.length === 0
    ? "Choose two or three designs from the collection to compare their estimates and details."
    : "Choose one more design to start comparing. You can compare up to three."
  $("#compare-content").innerHTML = products.map(product =>
    '<article class="compare-item"><div class="compare-art">' +
    bouquetSvg(product, product.recipe, defaultFinishing(product), "", "signature") + "</div>" +
    '<p class="eyebrow">' + escapeHtml(product.occasionTags.join(" · ") || "Florist design") + "</p>" +
    "<h3>" + escapeHtml(product.name) + "</h3><p>" + escapeHtml(product.description) + "</p>" +
    '<p><strong>From ' + money(startingEstimate(product)) + "</strong></p>" +
    '<p>Available ' + escapeHtml(product.availableFrom) + " to " + escapeHtml(product.availableUntil) + "</p>" +
    '<div class="compare-item-actions"><button class="button button-dark" type="button" data-compare-customize="' +
    escapeHtml(product.id) + '">Customize</button><button class="outline-button" type="button" data-remove-compare="' +
    escapeHtml(product.id) + '">Remove</button></div></article>',
  ).join("")
  $("#compare-content").querySelectorAll("[data-compare-customize]").forEach(button => {
    button.addEventListener("click", () => {
      $("#compare-dialog").close()
      $("#arrangement-dialog").showModal()
      openBuilder(button.dataset.compareCustomize, true)
    })
  })
  $("#compare-content").querySelectorAll("[data-remove-compare]").forEach(button => {
    button.addEventListener("click", () => {
      toggleCompare(button.dataset.removeCompare)
    })
  })
  renderCompareButton()
}

function renderCustomChooser() {
  const products = availableProducts()
  $("#custom-design-description").textContent = state.previewOnly
    ? "Choose a synthetic sample to explore its editing controls. No request can be submitted from this preview."
    : "Choose a florist-published design as your starting point. Only the catalog options shown in the editor are available."
  $("#custom-design-list").innerHTML = products.map(product =>
    '<article class="custom-design-choice"><div class="custom-design-art">' +
    bouquetSvg(product, product.recipe, defaultFinishing(product), "", "signature") +
    '</div><div class="custom-design-copy">' +
    '<p class="eyebrow">' + escapeHtml(product.occasionTags.join(" · ") || (state.previewOnly ? "Local sample" : "Florist design")) + "</p>" +
    "<h3>" + escapeHtml(product.name) + "</h3><p>" + escapeHtml(product.description) + "</p>" +
    '<div class="custom-design-tags">' + product.paletteTags.slice(0, 3).map(tag =>
      '<span class="tag">' + escapeHtml(tag) + "</span>").join("") + "</div></div>" +
    '<div class="custom-design-action"><strong>From ' + money(startingEstimate(product)) +
    '</strong><button class="button button-dark" type="button" data-custom-start="' +
    escapeHtml(product.id) + '">Start with this design</button></div></article>',
  ).join("")
  $("#custom-design-list").querySelectorAll("[data-custom-start]").forEach(button => {
    button.addEventListener("click", () => {
      const productId = button.dataset.customStart
      $("#custom-design-dialog").close()
      openBuilder(productId)
    })
  })
}
