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
