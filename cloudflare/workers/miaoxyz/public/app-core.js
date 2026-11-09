const $ = selector => document.querySelector(selector)
const apiUrl = path => new URL("./api/" + path, document.baseURI)
const formatMoney = new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = minor => "S$" + formatMoney.format(minor / 100)
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/gu, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]))
const clone = value => JSON.parse(JSON.stringify(value))
const requestKey = () => crypto.randomUUID()
const today = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}
const previewMode = new URLSearchParams(location.search).get("preview")
const localDemoPreview = ["localhost", "127.0.0.1", "::1"].includes(location.hostname)
  && (previewMode === null || previewMode === "demo")
const dayAfter = days => {
  const date = new Date(today() + "T00:00:00Z")
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const demoFlowers = [
  { id: "ivory-rose", label: "Ivory garden rose", pricePerStemMinor: 360, colorHex: "#F1DCC7", available: true },
  { id: "coral-ranunculus", label: "Coral ranunculus", pricePerStemMinor: 340, colorHex: "#E86F5C", available: true },
  { id: "rose-tulip", label: "Rose tulip", pricePerStemMinor: 320, colorHex: "#D9577A", available: true },
  { id: "blue-delphinium", label: "Blue delphinium", pricePerStemMinor: 300, colorHex: "#547FC5", available: true },
  { id: "cream-daisy", label: "Cream daisy", pricePerStemMinor: 220, colorHex: "#F3E6AB", available: true },
  { id: "golden-mum", label: "Golden mum", pricePerStemMinor: 250, colorHex: "#DFA020", available: true },
  { id: "lilac-stock", label: "Lilac stock", pricePerStemMinor: 310, colorHex: "#9270BB", available: true },
  { id: "eucalyptus", label: "Silver eucalyptus", pricePerStemMinor: 240, colorHex: "#718A6F", available: true },
  { id: "berry-scabiosa", label: "Berry scabiosa", pricePerStemMinor: 330, colorHex: "#AA3458", available: true },
]
const demoDesigns = [
  { id: "still-garden", name: "Still Garden", description: "Soft garden roses with a little movement and plenty of green.", price: 7200, occasion: ["Birthday", "Thank you"], palette: ["Blush", "Green"], wrap: ["#BFA99B", "#F0E5DC", "#713B52"], recipe: [{ id: "ivory-rose", quantity: 4 }, { id: "rose-tulip", quantity: 5 }, { id: "coral-ranunculus", quantity: 3 }, { id: "cream-daisy", quantity: 2 }, { id: "eucalyptus", quantity: 3 }] },
  { id: "warm-current", name: "Warm Current", description: "Apricot and coral tones gathered in a relaxed round shape.", price: 8200, occasion: ["Birthday", "Congratulations"], palette: ["Coral", "Apricot"], wrap: ["#C88D77", "#F5E6D5", "#8E414B"], recipe: [{ id: "coral-ranunculus", quantity: 4 }, { id: "ivory-rose", quantity: 3 }, { id: "cream-daisy", quantity: 3 }, { id: "rose-tulip", quantity: 2 }] },
  { id: "moss-morning", name: "Moss Morning", description: "A bright, leafy mix with small blooms and airy stems.", price: 9300, occasion: ["Thank you", "Just because"], palette: ["Yellow", "Green"], wrap: ["#A4AA91", "#F0E8D5", "#6F5543"], recipe: [{ id: "golden-mum", quantity: 5 }, { id: "cream-daisy", quantity: 5 }, { id: "eucalyptus", quantity: 4 }, { id: "berry-scabiosa", quantity: 3 }] },
  { id: "open-sky", name: "Open Sky", description: "Cool blue stems and cream flowers with an easy, open silhouette.", price: 10400, occasion: ["Congratulations", "New home"], palette: ["Blue", "Cream"], wrap: ["#8795A6", "#E5E9E7", "#41566B"], recipe: [{ id: "blue-delphinium", quantity: 5 }, { id: "cream-daisy", quantity: 4 }, { id: "ivory-rose", quantity: 3 }, { id: "eucalyptus", quantity: 2 }] },
  { id: "paper-lantern", name: "Paper Lantern", description: "Rounded coral blooms with a quiet touch of lilac.", price: 11500, occasion: ["Celebration", "Birthday"], palette: ["Coral", "Lilac"], wrap: ["#CDA895", "#F1E3D8", "#5B354B"], recipe: [{ id: "coral-ranunculus", quantity: 4 }, { id: "lilac-stock", quantity: 4 }, { id: "berry-scabiosa", quantity: 3 }, { id: "cream-daisy", quantity: 3 }] },
  { id: "cloud-study", name: "Cloud Study", description: "Ivory, pale rose, and delicate stems for a gentle gesture.", price: 12500, occasion: ["Sympathy", "Thank you"], palette: ["Cream", "Rose"], wrap: ["#C5B8AA", "#F6EEE6", "#776A68"], recipe: [{ id: "ivory-rose", quantity: 5 }, { id: "rose-tulip", quantity: 4 }, { id: "lilac-stock", quantity: 3 }, { id: "coral-ranunculus", quantity: 2 }] },
  { id: "field-notes", name: "Field Notes", description: "Textured golden flowers and greenery with a natural finish.", price: 13500, occasion: ["New home", "Congratulations"], palette: ["Yellow", "Green"], wrap: ["#B99D7D", "#EFE3D1", "#78523E"], recipe: [{ id: "golden-mum", quantity: 5 }, { id: "cream-daisy", quantity: 5 }, { id: "eucalyptus", quantity: 4 }, { id: "lilac-stock", quantity: 3 }] },
  { id: "bright-assembly", name: "Bright Assembly", description: "A fuller mix of rose, berry, and blue for a big day.", price: 14500, occasion: ["Celebration", "Anniversary"], palette: ["Berry", "Blue"], wrap: ["#A77869", "#F0E5DA", "#603249"], recipe: [{ id: "berry-scabiosa", quantity: 4 }, { id: "blue-delphinium", quantity: 4 }, { id: "coral-ranunculus", quantity: 4 }, { id: "ivory-rose", quantity: 4 }] },
]
const demoProducts = demoDesigns.map((design, index) => {
  const [outerColor, innerColor, ribbonColor] = design.wrap
  const finish = (id, label, priceDeltaMinor, colorHex) => ({ id, label, priceDeltaMinor, colorHex, available: true })
  return {
    id: design.id,
    name: design.name,
    description: design.description,
    basePriceMinor: design.price,
    occasionTags: design.occasion,
    paletteTags: design.palette,
    available: true,
    availableFrom: today(),
    availableUntil: dayAfter(60 + index),
    choices: {
      size: [
        { id: "petite", label: "Small", priceDeltaMinor: -800, available: true },
        { id: "signature", label: "Medium", priceDeltaMinor: 0, available: true },
        { id: "abundant", label: "Large", priceDeltaMinor: 1800, available: true },
      ],
      stems: [
        { id: "airy", label: "Airy", priceDeltaMinor: -300, available: true },
        { id: "garden", label: "Garden", priceDeltaMinor: 0, available: true },
        { id: "full", label: "Full", priceDeltaMinor: 1200, available: true },
      ],
    },
    finishing: {
      ribbon: [finish("satin", "Satin", 0, ribbonColor), finish("linen", "Linen", 200, "#9A846B")],
      outerWrap: [finish("soft-paper", "Soft paper", 0, outerColor), finish("recycled-paper", "Recycled paper", 300, "#AAB1A2")],
      innerWrap: [finish("warm-ivory", "Warm ivory", 0, innerColor), finish("rose-tint", "Rose tint", 150, "#D9A8A7")],
    },
    flowers: clone(demoFlowers),
    recipe: design.recipe,
  }
})

const state = {
  store: null,
  catalog: { revision: 0, products: [] },
  previewOnly: localDemoPreview,
  product: null,
  editor: null,
  history: [],
  historyIndex: -1,
  canvasView: { centerX: 320, centerY: 340, zoom: 1 },
  compareIds: [],
  idempotencyKey: "",
  token: sessionStorage.getItem("miaoxyz-operator-token") ?? "",
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {})
  if (options.body !== undefined) headers.set("content-type", "application/json")
  if (state.token) headers.set("authorization", "Bearer " + state.token)
  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ").")
  return data
}

function setStatus(selector, message, isError = false) {
  const element = $(selector)
  element.textContent = message
  element.classList.toggle("is-error", isError)
  element.hidden = !message
}

function availableProducts() {
  return state.catalog.products.filter(product => product.available && product.availableUntil >= today())
}

function optionById(options, id) {
  return options.find(option => option.id === id && option.available) ?? options.find(option => option.id === id) ?? null
}

function includedFlowerCost(product) {
  return product.recipe.reduce((total, stem) => {
    const flower = product.flowers.find(item => item.id === stem.id)
    return total + (flower ? flower.pricePerStemMinor * stem.quantity : 0)
  }, 0)
}

function startingEstimate(product) {
  const choiceGroups = Object.values(product.choices)
  const finishGroups = Object.values(product.finishing)
  return product.basePriceMinor
    + choiceGroups.reduce((sum, options) => sum + Math.min(...options.filter(option => option.available).map(option => option.priceDeltaMinor)), 0)
    + finishGroups.reduce((sum, options) => sum + Math.min(...options.filter(option => option.available).map(option => option.priceDeltaMinor)), 0)
}

function editorEstimate(product = state.product, editor = state.editor, fulfillment = $("#fulfillment").value) {
  if (!product || !editor) return 0
  const choices = Object.entries(editor.choices).reduce((sum, [group, id]) => {
    return sum + (optionById(product.choices[group], id)?.priceDeltaMinor ?? 0)
  }, 0)
  const finishing = Object.entries(editor.finishing).reduce((sum, [group, id]) => {
    return sum + (optionById(product.finishing[group], id)?.priceDeltaMinor ?? 0)
  }, 0)
  const flowerCost = editor.flowers.reduce((sum, stem) => {
    const flower = product.flowers.find(item => item.id === stem.id)
    return sum + (flower ? flower.pricePerStemMinor * (stem.quantity ?? 1) : 0)
  }, 0)
  const delivery = fulfillment === "delivery" ? (state.store?.deliveryFeeMinor ?? 0) : 0
  return product.basePriceMinor + choices + finishing + flowerCost - includedFlowerCost(product) + delivery
}

function defaultFinishing(product) {
  return Object.fromEntries(Object.entries(product.finishing).map(([group, options]) => [
    group, options.find(option => option.available)?.id ?? "",
  ]))
}

function expandFlowerRecipe(recipe = []) {
  return recipe.flatMap(stem => Array.from({ length: stem.quantity }, () => ({
    id: stem.id,
    key: requestKey(),
    quantity: 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: 0,
    mirrored: false,
  })))
}

function groupFlowerLayers(layers = []) {
  const grouped = new Map()
  for (const layer of layers) {
    const quantity = layer.quantity ?? 1
    const selection = grouped.get(layer.id) ?? { id: layer.id, quantity: 0, layers: [] }
    selection.quantity += quantity
    for (let index = 0; index < quantity; index += 1) {
      selection.layers.push({
        offsetX: Number.isFinite(layer.offsetX) ? layer.offsetX : 0,
        offsetY: Number.isFinite(layer.offsetY) ? layer.offsetY : 0,
        scale: Number.isFinite(layer.scale) ? layer.scale : 1,
        rotation: Number.isFinite(layer.rotation) ? layer.rotation : 0,
        mirrored: layer.mirrored === true,
      })
    }
    grouped.set(layer.id, selection)
  }
  return [...grouped.values()]
}

function normalizeComposition(composition) {
  if (!composition || !Array.isArray(composition.flowers)) return composition
  const flowers = composition.flowers.flatMap(stem => {
    const normalizeLayer = (key = requestKey()) => ({
      id: stem.id,
      key,
      quantity: 1,
      offsetX: Number.isFinite(stem.offsetX) ? Math.max(-240, Math.min(240, stem.offsetX)) : 0,
      offsetY: Number.isFinite(stem.offsetY) ? Math.max(-240, Math.min(240, stem.offsetY)) : 0,
      scale: Number.isFinite(stem.scale) ? Math.max(0.5, Math.min(2, stem.scale)) : 1,
      rotation: Number.isFinite(stem.rotation) ? Math.max(-180, Math.min(180, stem.rotation)) : 0,
      mirrored: stem.mirrored === true,
    })
    if (stem.key) return [normalizeLayer(stem.key)]
    return Array.from({ length: stem.quantity }, () => normalizeLayer())
  })
  const oldSelection = composition.selectedFlowerId
  const selectedLayer = flowers.find(stem => stem.key === oldSelection)
    ?? flowers.find(stem => stem.id === oldSelection)
  return { ...composition, flowers, selectedFlowerId: selectedLayer?.key ?? "" }
}

function safeColor(color, fallback = "#829181") {
  return /^#[0-9a-f]{6}$/iu.test(color ?? "") ? color : fallback
}

function mixColor(first, second, amount) {
  const a = safeColor(first).slice(1).match(/.{2}/gu).map(value => Number.parseInt(value, 16))
  const b = safeColor(second).slice(1).match(/.{2}/gu).map(value => Number.parseInt(value, 16))
  return "#" + a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount)
    .toString(16).padStart(2, "0")).join("")
}

function flowerThumbnail(flower) {
  const color = safeColor(flower.colorHex)
  const light = mixColor(color, "#fff8ec", 0.3)
  const shade = mixColor(color, "#425749", 0.36)
  const name = flower.label.toLowerCase()
  if (name.includes("eucalyptus")) {
    return '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 27C16 20 15 12 16 5" fill="none" stroke="' + shade + '" stroke-width="1.4"/><path d="M15 11C8 5 5 9 11 14Q14 15 15 11ZM17 16C24 10 27 14 21 19Q18 20 17 16ZM15 21C8 15 5 19 11 24Q14 25 15 21Z" fill="' + light + '" stroke="' + shade + '" stroke-width=".8"/></svg>'
  }
  const count = name.includes("daisy") ? 8 : name.includes("tulip") ? 6 : 10
  const petals = Array.from({ length: count }, (_, index) => {
    const angle = index * 360 / count
    const scale = 0.9 + (index % 3) * 0.06
    return '<ellipse cx="16" cy="8.5" rx="3.15" ry="6.4" transform="rotate(' + angle + ' 16 16) scale(' + scale + ' 1)" fill="' + (index % 2 ? color : light) + '" stroke="' + shade + '" stroke-opacity=".2" stroke-width=".55"/>'
  }).join("")
  const center = name.includes("daisy") || name.includes("mum") ? "#cfaa62" : shade
  return '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="15" fill="#fbfaf5"/>' + petals + '<circle cx="16" cy="16" r="3.15" fill="' + center + '"/><circle cx="15" cy="15" r="1" fill="#fff4d7" opacity=".82"/></svg>'
}

let bouquetArtSequence = 0

function bouquetSvg(product, flowerLayers, finishing, selectedFlowerId = "", sizeId = "signature", interactive = false, applyLayerTransforms = false) {
  const chosenFinishes = Object.fromEntries(Object.entries(product.finishing).map(([group, options]) => [
    group, optionById(options, finishing?.[group]) ?? options.find(option => option.available),
  ]))
  const outer = safeColor(chosenFinishes.outerWrap?.colorHex, "#d5c7ba")
  const inner = safeColor(chosenFinishes.innerWrap?.colorHex, "#eee4da")
  const ribbon = safeColor(chosenFinishes.ribbon?.colorHex, "#77364b")
  const artId = "bouquet-art-" + (++bouquetArtSequence)
  const flowerStems = []
  const flowerHeads = []
  const interactiveFlowerLayers = []
  const flowerGradients = []
  let ordinal = 0
  let visualIndex = 0
  const seed = [...String(product.id)].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  const layoutSeed = [...String(product.id)].reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261,
  ) >>> 0
  const bouquetProfiles = [
    { width: 1.24, height: 0.8, lean: -0.12, irregularity: 7, bloomWidth: 1.02, bloomHeight: 0.95, tilt: -4, wrapWidth: 1.05 },
    { width: 0.86, height: 1.3, lean: 0.06, irregularity: 5, bloomWidth: 0.9, bloomHeight: 1.12, tilt: 2, wrapWidth: 0.92 },
    { width: 1, height: 0.92, lean: 0, irregularity: 4, bloomWidth: 1.04, bloomHeight: 1.04, tilt: 0, wrapWidth: 0.96 },
    { width: 1.15, height: 1.02, lean: 0.25, irregularity: 10, bloomWidth: 1.03, bloomHeight: 0.98, tilt: 6, wrapWidth: 1.08 },
  ]
  const profile = bouquetProfiles[layoutSeed % bouquetProfiles.length]
  const petalPaths = {
    rose: "M0 2 C-5-2-13-2-14-9 C-15-16-8-21-3-17 C-1-23 5-24 10-19 C16-13 11-5 4 0 C2 1 1 2 0 2Z",
    ranunculus: "M0 2 C-6-2-13-4-12-11 C-11-18-5-20-1-15 C2-22 8-22 12-16 C16-9 9-2 2 2Z",
    tulip: "M0 3 C-8-2-13-10-9-18 C-6-24-2-21 0-14 C3-21 8-24 12-17 C16-9 8-1 0 3Z",
    daisy: "M0 2 C-4-2-5-11-3-18 C-1-23 2-23 4-18 C7-10 4-2 0 2Z",
    mum: "M0 2 C-3-3-4-13-2-20 C-1-25 2-25 3-20 C6-11 3-3 0 2Z",
    scabiosa: "M0 2 C-7-1-10-9-6-15 C-3-21 2-19 4-14 C9-9 7-1 0 2Z",
    simple: "M0 2 C-5-1-8-9-5-15 C-2-20 2-18 4-13 C8-7 5-1 0 2Z",
  }
  for (const layer of flowerLayers ?? []) {
    const flower = product.flowers.find(item => item.id === layer.id)
    if (!flower || !flower.available) continue
    const layerQuantity = layer.quantity ?? 1
    for (let unit = 0; unit < layerQuantity && ordinal < 30; unit += 1) {
      const flowerName = flower.label.toLowerCase()
      const greenery = flowerName.includes("eucalyptus")
      const seedAngle = (seed % 360) * Math.PI / 180
      const angle = ordinal * 2.399963 + seedAngle
      const radius = (greenery ? 9 : 18) + Math.sqrt(ordinal) * (greenery ? 15 : 25)
      const looseOffset = Math.sin(ordinal * 1.71 + seedAngle) * profile.irregularity
      const x = 320 + Math.cos(angle) * radius * profile.width
        + Math.sin(angle * 0.62 + seedAngle) * radius * profile.lean + looseOffset
      const y = (greenery ? 207 : 222) + Math.sin(angle) * radius * 0.58 * profile.height
        + Math.cos(angle * 1.37 + seedAngle) * profile.irregularity * 0.7
      const color = safeColor(flower.colorHex)
      const flowerId = escapeHtml(flower.id)
      const focus = layer.key ? layer.key === selectedFlowerId : flower.id === selectedFlowerId
      const layerOccurrence = (flowerLayers ?? []).slice(visualIndex).filter(item => item.id === layer.id).length
      const layerLabel = flower.label + " layer " + layerOccurrence
      const isDaisy = flowerName.includes("daisy")
      const isMum = flowerName.includes("mum")
      const isTulip = flowerName.includes("tulip")
      const isRose = flowerName.includes("rose") && !isTulip
      const isRanunculus = flowerName.includes("ranunculus")
      const isScabiosa = flowerName.includes("scabiosa")
      const isTallFlower = flowerName.includes("delphinium") || flowerName.includes("stock")
      const petalCount = isDaisy ? 13 : isMum ? 19 : isRose ? 12 : isTulip ? 6 : isRanunculus ? 14 : isScabiosa ? 15 : 10
      const bloomId = artId + "-bloom-" + ordinal
      const lightPetal = mixColor(color, "#fff8ec", 0.16)
      const shadePetal = mixColor(color, "#523f48", 0.28)
      if (!greenery) {
        flowerGradients.push('<radialGradient id="' + bloomId + '" cx=".32" cy=".22" r=".82"><stop stop-color="' + mixColor(color, "#fffdf5", 0.62) + '"/><stop offset=".28" stop-color="' + lightPetal + '"/><stop offset=".68" stop-color="' + color + '"/><stop offset="1" stop-color="' + shadePetal + '"/></radialGradient>')
      }
      const flowerMarkup = []
      if (greenery) {
        for (let leaf = 0; leaf < 7; leaf += 1) {
          const side = leaf % 2 ? 1 : -1
          const leafY = -24 + Math.floor(leaf / 2) * 11
          const leafX = side * (5 + (leaf % 3) * 2)
        flowerMarkup.push('<g transform="translate(' + leafX + ' ' + leafY + ') rotate(' + side * 33 + ') scale(' + (0.82 + (leaf % 3) * 0.08) + ')"><path d="M0 0 C8-10 18-10 23-4 C17 3 8 5 0 0Z" fill="' + mixColor(color, "#ffffff", 0.16) + '" stroke="' + shadePetal + '" stroke-opacity=".28" stroke-width=".75"/><path d="M1 0 Q11-2 21-4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".65"/></g>')
        }
        flowerMarkup.unshift('<path d="M0 31 C2 16-3-5 0-39" fill="none" stroke="' + shadePetal + '" stroke-width="1.2"/>')
      } else if (isTallFlower) {
        for (let floret = 0; floret < 7; floret += 1) {
          const floretY = -33 + floret * 9
          const side = floret % 2 ? 1 : -1
          const floretX = side * (2 + floret * 0.5)
          const petals = []
          for (let petal = 0; petal < 5; petal += 1) {
            petals.push('<path d="' + petalPaths.simple + '" transform="rotate(' + (petal * 72) + ') scale(.32)" fill="url(#' + bloomId + ')" stroke="#fffaf1" stroke-opacity=".48" stroke-width="1.1"/>')
          }
          flowerMarkup.push('<g transform="translate(' + floretX + ' ' + floretY + ')">' + petals.join("") + '<circle r="1.15" fill="' + shadePetal + '"/></g>')
        }
        flowerMarkup.unshift('<path d="M0 35 C-2 14 3-12 0-43" fill="none" stroke="#536e55" stroke-width="1.45"/>')
      } else {
        const petalPath = isRose ? petalPaths.rose : isRanunculus ? petalPaths.ranunculus : isTulip ? petalPaths.tulip : isDaisy ? petalPaths.daisy : isMum ? petalPaths.mum : isScabiosa ? petalPaths.scabiosa : petalPaths.simple
        const ringCount = isRanunculus ? 3 : isRose ? 3 : isTulip ? 2 : isDaisy || isMum ? 2 : 2
        for (let ring = 0; ring < ringCount; ring += 1) {
          const count = ring === 0 ? petalCount : Math.max(5, Math.round(petalCount * (ring === 1 ? 0.74 : 0.48)))
          const scale = ring === 0 ? 1.02 : ring === 1 ? 0.74 : 0.48
          const offset = ring * (isTulip ? 30 : 19) + ((ordinal * 13 + ring * 7) % 11) - 5
          for (let petal = 0; petal < count; petal += 1) {
            const rotation = petal * 360 / count + offset + (ordinal % 3) * 4 + ((petal * 17 + ordinal * 5) % 9) - 4
            const variation = 0.9 + ((petal * 7 + ordinal * 3 + ring) % 11) * 0.018
            const petalOpacity = 0.84 + ((petal * 5 + ordinal + ring) % 8) * 0.02
            flowerMarkup.push('<path d="' + petalPath + '" transform="rotate(' + rotation + ') scale(' + (scale * variation) + ' ' + (scale * (0.91 + variation * 0.09)) + ')" fill="url(#' + bloomId + ')" fill-opacity="' + petalOpacity + '" stroke="' + lightPetal + '" stroke-opacity=".3" stroke-width=".75"/>')
            if (ring === 0 && (petal + ordinal) % 3 === 0 && !isDaisy && !isMum) {
              flowerMarkup.push('<path d="' + petalPath + '" transform="rotate(' + rotation + ') translate(0 1) scale(' + (scale * variation * 0.72) + ')" fill="none" stroke="#fffaf2" stroke-opacity=".24" stroke-width=".65"/>')
            }
          }
        }
        if (isScabiosa) {
          for (let dot = 0; dot < 16; dot += 1) {
            const dotAngle = dot * 2.399963
            const dotRadius = 2 + (dot % 3) * 0.8
            flowerMarkup.push('<circle cx="' + (Math.cos(dotAngle) * dotRadius) + '" cy="' + (Math.sin(dotAngle) * dotRadius) + '" r=".72" fill="' + (dot % 2 ? lightPetal : shadePetal) + '"/>')
          }
        }
      }
      const center = greenery || isTallFlower ? ""
        : isRose ? '<circle r="4.8" fill="' + shadePetal + '"/><path d="M0-4 C6-6 6 1 2 3 C-2 5-5 1-2-2 C1-5 4-2 2 0" fill="' + lightPetal + '" stroke="' + color + '" stroke-width=".8"/>'
          : isDaisy || isMum ? '<circle r="5.3" fill="#d7aa58"/><circle r="3.4" fill="#8c673d"/><circle r="1.35" cx="-1" cy="-1" fill="#fff1ce"/>'
            : isScabiosa ? '<circle r="5.3" fill="' + shadePetal + '"/><circle r="3.7" fill="' + color + '"/>'
              : isTulip ? '<path d="M-5 2 Q-6-5 0-8 Q7-5 5 2 Q1 5-5 2Z" fill="' + lightPetal + '" stroke="' + shadePetal + '" stroke-width=".8"/>'
                : '<circle r="3.7" fill="' + lightPetal + '"/><circle r="1.45" fill="' + shadePetal + '"/>'
      const baseBloomScale = isTallFlower ? 0.92 : isDaisy || isMum ? 1.06 : 1.14
      const bloomScale = baseBloomScale * (0.88 + ((ordinal * 5 + seed) % 8) * 0.035)
      const bloomTilt = ((ordinal * 19 + seed) % 27) - 13 + profile.tilt
      const bloomWidth = (0.94 + ((ordinal * 7 + seed) % 10) * 0.012) * profile.bloomWidth
      const bloomHeight = (0.94 + ((ordinal * 11 + seed) % 9) * 0.014) * profile.bloomHeight
      const leaves = greenery ? "" : [0, 1, 2].map(leaf => {
        const side = leaf % 2 ? 1 : -1
        const leafY = 31 + leaf * 21
        const rotation = side * (leaf === 1 ? 32 : 46)
        return '<g transform="translate(' + (x + side * (4 + leaf * 2)) + ' ' + (y + leafY) + ') rotate(' + rotation + ')"><path d="M0 0 C8-10 18-11 24-4 C17 4 8 5 0 0Z" fill="#829b77" stroke="#536e55" stroke-opacity=".32" stroke-width=".65"/><path d="M1 0 Q11-2 22-4" fill="none" stroke="#e4e8d7" stroke-opacity=".64" stroke-width=".65"/></g>'
      }).join("")
      const stemBase = 492 + ((ordinal % 3) - 1) * 5
      const stemControl = x + ((ordinal % 2 ? 1 : -1) * (15 + ordinal % 4 * 3))
      const stemStartY = interactive && !greenery
        ? y + (isTallFlower ? 36 : 24)
        : y + (isTallFlower ? -15 : 8)
      const stemMarkup =
        '<g class="bouquet-stem" data-flower-id="' + flowerId + '">' +
        '<path d="M' + x + " " + stemStartY + " C" + (x - 7) + " " + (y + 91) + " " + stemControl + " " + (stemBase - 49) + " " + (320 + stemControl * 0.08) + " " + stemBase + '" fill="none" stroke="#536e55" stroke-opacity=".9" stroke-width="2.25" stroke-linecap="round"/>' +
        leaves + '</g>'
      const headMarkup =
        '<g class="bouquet-bloom' + (focus ? " is-selected" : "") + '" data-flower-id="' + flowerId + '" transform="translate(' + x + " " + y + ') rotate(' + bloomTilt + ') scale(' + (bloomScale * bloomWidth) + " " + (bloomScale * bloomHeight) + ')">' +
        flowerMarkup.join("") + center + '</g>'
      if (interactive && layer.key) {
        const layerKey = escapeHtml(layer.key)
        const layerScale = Number.isFinite(layer.scale) ? Math.max(0.5, Math.min(2, layer.scale)) : 1
        const offsetX = Number.isFinite(layer.offsetX) ? Math.max(-240, Math.min(240, layer.offsetX)) : 0
        const offsetY = Number.isFinite(layer.offsetY) ? Math.max(-240, Math.min(240, layer.offsetY)) : 0
        const rotation = Number.isFinite(layer.rotation) ? Math.max(-180, Math.min(180, layer.rotation)) : 0
        const mirrorX = layer.mirrored === true ? -1 : 1
        const transform = 'translate(' + offsetX + ' ' + offsetY + ') translate(' + x + ' ' + y + ') rotate(' + rotation + ') scale(' + layerScale + ' ' + layerScale + ') scale(' + mirrorX + ' 1) translate(' + -x + ' ' + -y + ')'
        const positionLabel = Math.round(offsetX) + ", " + Math.round(offsetY)
        const stateLabel = layerLabel + ", position " + positionLabel + ", size " + Math.round(layerScale * 100) +
          " percent, rotation " + Math.round(rotation) + " degrees" + (layer.mirrored ? ", mirrored horizontally" : "")
        const selectedRing = '<circle class="bouquet-layer-selection-ring" cx="' + x + '" cy="' + y + '" r="33" fill="none" pointer-events="none"/>'
        const scaleHandle = focus
          ? '<circle class="bouquet-layer-scale-handle" data-layer-scale-handle="' + layerKey + '" cx="' + (x + 44 / layerScale) + '" cy="' + (y - 44 / layerScale) + '" r="' + (22 / layerScale) + '" role="slider" tabindex="0" aria-label="Scale ' + escapeHtml(layerLabel) + '" aria-orientation="horizontal" aria-valuemin="50" aria-valuemax="200" aria-valuenow="' + Math.round(layerScale * 100) + '" aria-valuetext="' + Math.round(layerScale * 100) + ' percent" aria-keyshortcuts="ArrowUp ArrowDown + - Home"/>' : ""
        interactiveFlowerLayers.push(
          '<g class="bouquet-layer' + (focus ? " is-selected" : "") + '" data-layer-key="' + layerKey + '" data-layer-label="' + escapeHtml(layerLabel) + '" data-flower-id="' + flowerId + '" data-base-x="' + x + '" data-base-y="' + y + '" role="group" aria-label="' + escapeHtml(stateLabel) + '" transform="' + transform + '">' +
          '<g class="bouquet-layer-move-target" data-layer-move-key="' + layerKey + '" role="button" tabindex="0" aria-label="Move ' + escapeHtml(layerLabel) + '; current position ' + positionLabel + '" aria-pressed="' + (focus ? "true" : "false") + '" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - Home Enter Space">' +
          '<circle class="bouquet-layer-hit-target" cx="' + x + '" cy="' + y + '" r="32" fill="transparent" pointer-events="all"/>' + stemMarkup + headMarkup + selectedRing + '</g>' + scaleHandle + '</g>',
        )
      } else {
        const transform = applyLayerTransforms ? ' transform="' + layerSvgTransform(layer, x, y) + '"' : ""
        flowerStems.push(transform ? '<g' + transform + '>' + stemMarkup + '</g>' : stemMarkup)
        flowerHeads.push(transform ? '<g' + transform + '>' + headMarkup + '</g>' : headMarkup)
      }
      ordinal += 1
      visualIndex += 1
    }
  }
  const count = ordinal
  const stemSource = state.previewOnly ? "synthetic sample" : "florist-approved"
  const sizeChoice = product.choices.size.find(option => option.id === sizeId)
  const sizeName = (String(sizeId) + " " + (sizeChoice?.label ?? "")).toLowerCase()
  const sizeScale = /\b(small|petite)\b/u.test(sizeName) ? 0.88
    : /\b(large|abundant)\b/u.test(sizeName) ? 1.12 : 1
  return '<svg viewBox="0 0 640 680" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bouquet preview with ' + count + " " + stemSource + ' stems">' +
    '<defs><linearGradient id="' + artId + '-paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + mixColor(outer, "#fff", 0.08) + '"/><stop offset=".47" stop-color="' + inner + '"/><stop offset="1" stop-color="' + mixColor(outer, "#5d514a", 0.16) + '"/></linearGradient>' +
    '<linearGradient id="' + artId + '-fold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".72"/><stop offset="1" stop-color="#66564b" stop-opacity=".16"/></linearGradient>' +
    '<pattern id="' + artId + '-paper-texture" width="31" height="23" patternUnits="userSpaceOnUse" patternTransform="rotate(13)"><path d="M3 0 C4 5 2 13 3 23 M21 0 C20 7 22 15 21 23" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".45"/><circle cx="27" cy="5" r=".55" fill="#75685f" fill-opacity=".08"/><circle cx="10" cy="18" r=".4" fill="#75685f" fill-opacity=".07"/></pattern>' +
    flowerGradients.join("") + '<filter id="' + artId + '-shadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="13"/></filter></defs>' +
    '<g transform="translate(320 450) scale(' + sizeScale + ') translate(-320 -450)"><g transform="translate(320 335) scale(' + (1.13 * profile.wrapWidth) + ' 1.13) translate(-320 -335)">' +
    '<ellipse cx="320" cy="594" rx="162" ry="24" fill="#858b83" opacity=".22" filter="url(#' + artId + '-shadow)"/>' +
    '<path d="M190 366 C174 329 158 286 143 247 C188 274 228 313 267 361 C287 380 305 393 320 399 C335 393 353 380 373 361 C412 313 452 274 497 247 C482 286 466 329 450 366 Q320 429 190 366Z" fill="url(#' + artId + '-paper)" opacity=".82"/>' +
    '<path d="M148 253 Q201 330 307 393 M492 253 Q439 330 333 393" fill="none" stroke="url(#' + artId + '-fold)" stroke-width="3" opacity=".64"/>' +
    (interactive ? interactiveFlowerLayers.join("") : flowerStems.join("") + flowerHeads.join("")) +
    '<path d="M178 344 C224 378 270 395 320 401 C370 395 416 378 462 344 L411 542 Q320 572 229 542 Z" fill="url(#' + artId + '-paper)" opacity=".97"/>' +
    '<path d="M215 343 Q320 389 425 343 L387 478 Q320 459 253 478Z" fill="' + inner + '" opacity=".97"/>' +
    '<path d="M177 351 C221 381 267 407 320 419 C373 407 419 381 463 351 C441 410 411 479 380 558 Q320 526 260 558 C229 479 199 410 177 351Z" fill="url(#' + artId + '-paper)" opacity=".98"/>' +
    '<path d="M177 351 C221 381 267 407 320 419 C373 407 419 381 463 351 C441 410 411 479 380 558 Q320 526 260 558 C229 479 199 410 177 351Z" fill="url(#' + artId + '-paper-texture)" opacity=".48"/>' +
    '<path d="M188 357 C220 389 265 416 316 433 C289 451 275 493 250 545 M452 357 C420 389 375 416 324 433 C351 451 365 493 390 545" fill="none" stroke="url(#' + artId + '-fold)" stroke-width="3.4" opacity=".78"/>' +
    '<path d="M214 368 Q268 412 320 424 Q372 412 426 368 M232 381 Q278 420 319 431 M408 381 Q362 420 321 431" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2"/>' +
    '<path d="M320 479 C310 465 298 466 297 473 C296 480 306 485 319 482 C321 481 321 480 320 479Z M320 479 C330 465 342 466 343 473 C344 480 334 485 321 482 C319 481 319 480 320 479Z" fill="' + ribbon + '" stroke="#543541" stroke-opacity=".38" stroke-width="1.1"/>' +
    '<path d="M316 482 L304 547 Q310 548 317 541 L322 484 M324 482 L336 547 Q330 548 323 541 L318 484" fill="' + ribbon + '" stroke="#543541" stroke-opacity=".55" stroke-width="1.35"/>' +
    '<path d="M319 477 Q311 470 306 472 M321 477 Q329 470 334 472" fill="none" stroke="' + mixColor(ribbon, "#fff", 0.2) + '" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="320" cy="480" r="4.8" fill="' + ribbon + '" stroke="#543541" stroke-width="1.1"/><path d="M180 354 Q320 427 460 354" fill="none" stroke="#fff" stroke-opacity=".58" stroke-width="1.7"/></g></g></svg>'
}
