export type StoreSettingsRow = {
  store_name: string
  service_area: string
  price_note: string
  privacy_notice_version: string
  privacy_notice: string
  retention_days: number | null
  pickup_enabled: number
  delivery_enabled: number
  delivery_fee_minor: number | null
  order_intake_enabled: number
  catalog_revision: number
}

export type CatalogOption = { id: string; label: string; priceDeltaMinor: number; available: boolean }
export type CatalogFinish = CatalogOption & { colorHex: string }
export type CatalogFlower = { id: string; label: string; pricePerStemMinor: number; colorHex: string; available: boolean }
export type CatalogProduct = {
  id: string
  name: string
  description: string
  basePriceMinor: number
  occasionTags: string[]
  paletteTags: string[]
  available: boolean
  availableFrom: string
  availableUntil: string
  choices: { size: CatalogOption[]; stems: CatalogOption[] }
  finishing: { ribbon: CatalogFinish[]; outerWrap: CatalogFinish[]; innerWrap: CatalogFinish[] }
  flowers: CatalogFlower[]
  recipe: Array<{ id: string; quantity: number }>
}
export type CatalogSnapshot = { revision: number; products: CatalogProduct[] }
export type FlowerLayerLayout = { offsetX: number; offsetY: number; scale: number; rotation?: number; mirrored?: boolean }
export type RequestPayload = {
  productId: string
  choices: { size: string; stems: string }
  finishing: { ribbon: string; outerWrap: string; innerWrap: string }
  flowers: Array<{ id: string; quantity: number; layers?: FlowerLayerLayout[] }>
  serviceDate: string
  fulfillment: 'pickup' | 'delivery'
  buyerName: string
  contactMethod: 'email' | 'phone'
  contactValue: string
  deliveryAddress: string
  note: string
  consent: boolean
}

export const MAX_JSON_BYTES = 32 * 1024
export const MAX_CATALOG_BYTES = 256 * 1024
export const MAX_CATALOG_PRODUCTS = 40
export const MAX_QUEUE_ROWS = 50
export const RATE_WINDOW_MS = 10 * 60 * 1000
export const RATE_LIMIT_PER_WINDOW = 5
export const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u
export const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{1,47}$/u
export const REQUEST_ID = /^[0-9a-f-]{36}$/u
export const OPTION_ID = /^[a-z0-9][a-z0-9-]{0,31}$/u
export const STATUSES = new Set(['submitted', 'accepted', 'declined', 'fulfilled', 'cancelled'])

export const json = (status: number, value: unknown): Response => Response.json(value, {
  status,
  headers: {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  },
})

export const safeResponse = (response: Response, html = false): Response => {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('x-frame-options', 'DENY')
  headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  )
  if (html) headers.set('cache-control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const names = new Set(allowed)
  return Object.keys(value).every(key => names.has(key))
}

export const text = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean.length >= min && clean.length <= max && !CONTROL_CHARACTERS.test(clean) ? clean : null
}

export const validDate = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00.000Z'))
  && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value

export const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')

export const sha256 = async (value: string): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

export const secretConfigured = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length >= 32
  && value.length <= 1024
  && !value.startsWith('replace-with-')

export const approvalEnabled = (value: unknown): boolean =>
  typeof value === 'string' && value === 'true'

export const constantTimeEqual = (left: string, right: string): boolean => {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export const readJson = async (request: Request, maxBytes = MAX_JSON_BYTES): Promise<Record<string, unknown> | null> => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  const length = request.headers.get('content-length')
  if (!contentType.includes('application/json')
    || (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes))) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(part.value)
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

export const readSettings = (db: D1Database): Promise<StoreSettingsRow | null> =>
  db.prepare(
    'SELECT store_name, service_area, price_note, privacy_notice_version, privacy_notice, ' +
    'retention_days, pickup_enabled, delivery_enabled, delivery_fee_minor, order_intake_enabled, catalog_revision ' +
    'FROM store_settings WHERE id = 1',
  ).first<StoreSettingsRow>()

export const readCatalog = async (db: D1Database, revision: number): Promise<CatalogSnapshot> => {
  if (revision <= 0) return { revision: 0, products: [] }
  const row = await db.prepare(
    'SELECT snapshot_json FROM catalog_revisions WHERE revision = ?',
  ).bind(revision).first<{ snapshot_json: string }>()
  if (!row) return { revision: 0, products: [] }
  try {
    const snapshot: unknown = JSON.parse(row.snapshot_json)
    return isRecord(snapshot) && Array.isArray(snapshot.products)
      ? { revision, products: snapshot.products as CatalogProduct[] }
      : { revision: 0, products: [] }
  } catch {
    return { revision: 0, products: [] }
  }
}

export const settingsReady = (settings: StoreSettingsRow): boolean =>
  !!text(settings.store_name, 1, 120)
  && !!text(settings.service_area, 1, 240)
  && !!text(settings.price_note, 1, 240)
  && !!text(settings.privacy_notice_version, 1, 80)
  && !!text(settings.privacy_notice, 20, 1200)
  && typeof settings.retention_days === 'number'
  && settings.retention_days >= 1
  && settings.retention_days <= 365
  && (settings.delivery_enabled !== 1 || (
    typeof settings.delivery_fee_minor === 'number'
    && Number.isInteger(settings.delivery_fee_minor)
    && settings.delivery_fee_minor >= 0
    && settings.delivery_fee_minor <= 200_000
  ))
  && (settings.pickup_enabled === 1 || settings.delivery_enabled === 1)

export const intakeReady = (settings: StoreSettingsRow, env: Env, hasProducts: boolean): boolean =>
  settings.order_intake_enabled === 1
  && settingsReady(settings)
  && hasProducts
  && approvalEnabled(env.PRIVACY_BASELINE_APPROVED)
  && approvalEnabled(env.DATA_REGION_APPROVED)
  && approvalEnabled(env.BACKUP_RESTORE_APPROVED)
  && approvalEnabled(env.RATE_LIMIT_REVIEW_APPROVED)
  && secretConfigured(env.OPERATOR_ACCESS_TOKEN)
  && secretConfigured(env.RATE_LIMIT_HMAC_SECRET)

export const publicStore = (settings: StoreSettingsRow, env: Env, hasProducts: boolean) => ({
  storeName: settings.store_name,
  serviceArea: settings.service_area,
  priceNote: settings.price_note,
  privacyNoticeVersion: settings.privacy_notice_version,
  privacyNotice: settings.privacy_notice,
  currency: 'SGD',
  pickupEnabled: settings.pickup_enabled === 1,
  deliveryEnabled: settings.delivery_enabled === 1,
  deliveryFeeMinor: settings.delivery_enabled === 1 ? settings.delivery_fee_minor : null,
  catalogRevision: settings.catalog_revision,
  intakeEnabled: intakeReady(settings, env, hasProducts),
})

export const parseOptionList = (value: unknown): CatalogOption[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return null
  const seen = new Set<string>()
  const options: CatalogOption[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || !exactKeys(candidate, ['id', 'label', 'priceDeltaMinor', 'available'])) return null
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const label = text(candidate.label, 1, 80)
    const delta = candidate.priceDeltaMinor
    if (!OPTION_ID.test(id) || seen.has(id) || !label || typeof delta !== 'number'
      || !Number.isSafeInteger(delta) || Math.abs(delta) > 1_000_000
      || typeof candidate.available !== 'boolean') return null
    seen.add(id)
    options.push({ id, label, priceDeltaMinor: delta, available: candidate.available })
  }
  if (!options.some(option => option.available)) return null
  return options
}

export const parseFinishList = (value: unknown): CatalogFinish[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null
  const seen = new Set<string>()
  const options: CatalogFinish[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || !exactKeys(candidate, ['id', 'label', 'priceDeltaMinor', 'available', 'colorHex'])) return null
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const label = text(candidate.label, 1, 80)
    const delta = candidate.priceDeltaMinor
    const colorHex = typeof candidate.colorHex === 'string' ? candidate.colorHex : ''
    if (!OPTION_ID.test(id) || seen.has(id) || !label || typeof delta !== 'number'
      || !Number.isSafeInteger(delta) || Math.abs(delta) > 1_000_000
      || typeof candidate.available !== 'boolean' || !/^#[0-9a-f]{6}$/iu.test(colorHex)) return null
    seen.add(id)
    options.push({ id, label, priceDeltaMinor: delta, available: candidate.available, colorHex })
  }
  if (!options.some(option => option.available)) return null
  return options
}

export const parseFlowerList = (value: unknown): CatalogFlower[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 24) return null
  const seen = new Set<string>()
  const flowers: CatalogFlower[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || !exactKeys(candidate, ['id', 'label', 'pricePerStemMinor', 'colorHex', 'available'])) return null
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const label = text(candidate.label, 1, 80)
    const price = candidate.pricePerStemMinor
    const colorHex = typeof candidate.colorHex === 'string' ? candidate.colorHex : ''
    if (!OPTION_ID.test(id) || seen.has(id) || !label || typeof price !== 'number'
      || !Number.isSafeInteger(price) || price < 1 || price > 100_000
      || !/^#[0-9a-f]{6}$/iu.test(colorHex) || typeof candidate.available !== 'boolean') return null
    seen.add(id)
    flowers.push({ id, label, pricePerStemMinor: price, colorHex, available: candidate.available })
  }
  if (!flowers.some(flower => flower.available)) return null
  return flowers
}

export const parseRecipe = (value: unknown, flowers: CatalogFlower[]): Array<{ id: string; quantity: number }> | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 24) return null
  const seen = new Set<string>()
  const recipe: Array<{ id: string; quantity: number }> = []
  let totalQuantity = 0
  for (const candidate of value) {
    if (!isRecord(candidate) || !exactKeys(candidate, ['id', 'quantity'])) return null
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const quantity = candidate.quantity
    const flower = flowers.find(item => item.id === id && item.available)
    if (!flower || seen.has(id) || typeof quantity !== 'number'
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 12) return null
    seen.add(id)
    totalQuantity += quantity
    if (totalQuantity > 30) return null
    recipe.push({ id, quantity })
  }
  return recipe
}

export const parseCatalog = (value: unknown): CatalogProduct[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CATALOG_PRODUCTS) return null
  const seen = new Set<string>()
  const products: CatalogProduct[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || !exactKeys(candidate, [
      'id', 'name', 'description', 'basePriceMinor', 'occasionTags', 'paletteTags',
      'available', 'availableFrom', 'availableUntil', 'choices', 'finishing', 'flowers', 'recipe',
    ])) return null
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const name = text(candidate.name, 1, 80)
    const description = text(candidate.description, 1, 500)
    const price = candidate.basePriceMinor
    const from = candidate.availableFrom
    const until = candidate.availableUntil
    const tagsOk = (input: unknown): input is string[] =>
      Array.isArray(input) && input.length <= 8
      && input.every(tag => typeof tag === 'string' && !!text(tag, 1, 40))
    if (!PRODUCT_ID.test(id) || seen.has(id) || !name || !description
      || typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > 2_000_000
      || typeof candidate.available !== 'boolean' || !validDate(from) || !validDate(until)
      || from > until || !tagsOk(candidate.occasionTags) || !tagsOk(candidate.paletteTags)
      || !isRecord(candidate.choices) || !exactKeys(candidate.choices, ['size', 'stems'])
      || !isRecord(candidate.finishing) || !exactKeys(candidate.finishing, ['ribbon', 'outerWrap', 'innerWrap'])) return null
    const size = parseOptionList(candidate.choices.size)
    const stems = parseOptionList(candidate.choices.stems)
    const ribbon = parseFinishList(candidate.finishing.ribbon)
    const outerWrap = parseFinishList(candidate.finishing.outerWrap)
    const innerWrap = parseFinishList(candidate.finishing.innerWrap)
    const flowers = parseFlowerList(candidate.flowers)
    if (!size || !stems || !ribbon || !outerWrap || !innerWrap || !flowers) return null
    const recipe = parseRecipe(candidate.recipe, flowers)
    if (!recipe) return null
    const baseRecipeMinor = recipe.reduce((total, stem) => total
      + (flowers.find(flower => flower.id === stem.id)?.pricePerStemMinor ?? 0) * stem.quantity, 0)
    const minimumPrice = price
      + Math.min(...size.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.min(...stems.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.min(...ribbon.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.min(...outerWrap.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.min(...innerWrap.filter(option => option.available).map(option => option.priceDeltaMinor))
      - baseRecipeMinor
    const maximumPrice = price
      + Math.max(...size.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.max(...stems.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.max(...ribbon.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.max(...outerWrap.filter(option => option.available).map(option => option.priceDeltaMinor))
      + Math.max(...innerWrap.filter(option => option.available).map(option => option.priceDeltaMinor))
      + 30 * Math.max(...flowers.filter(flower => flower.available).map(flower => flower.pricePerStemMinor))
      - baseRecipeMinor
    if (!Number.isSafeInteger(minimumPrice) || !Number.isSafeInteger(maximumPrice)
      || minimumPrice < 1 || maximumPrice > 2_800_000) return null
    seen.add(id)
    products.push({
      id,
      name,
      description,
      basePriceMinor: price,
      occasionTags: candidate.occasionTags.map(tag => String(tag).trim()),
      paletteTags: candidate.paletteTags.map(tag => String(tag).trim()),
      available: candidate.available,
      availableFrom: from,
      availableUntil: until,
      choices: { size, stems },
      finishing: { ribbon, outerWrap, innerWrap },
      flowers,
      recipe,
    })
  }
  return products
}
