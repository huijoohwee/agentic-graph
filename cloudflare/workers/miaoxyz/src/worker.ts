type StoreSettingsRow = {
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

type CatalogOption = { id: string; label: string; priceDeltaMinor: number; available: boolean }
type CatalogFinish = CatalogOption & { colorHex: string }
type CatalogFlower = { id: string; label: string; pricePerStemMinor: number; colorHex: string; available: boolean }
type CatalogProduct = {
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
type CatalogSnapshot = { revision: number; products: CatalogProduct[] }
type FlowerLayerLayout = { offsetX: number; offsetY: number; scale: number; rotation?: number; mirrored?: boolean }
type RequestPayload = {
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

const MAX_JSON_BYTES = 32 * 1024
const MAX_CATALOG_BYTES = 256 * 1024
const MAX_CATALOG_PRODUCTS = 40
const MAX_QUEUE_ROWS = 50
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_PER_WINDOW = 5
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u
const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{1,47}$/u
const REQUEST_ID = /^[0-9a-f-]{36}$/u
const OPTION_ID = /^[a-z0-9][a-z0-9-]{0,31}$/u
const STATUSES = new Set(['submitted', 'accepted', 'declined', 'fulfilled', 'cancelled'])

const json = (status: number, value: unknown): Response => Response.json(value, {
  status,
  headers: {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  },
})

const safeResponse = (response: Response, html = false): Response => {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const names = new Set(allowed)
  return Object.keys(value).every(key => names.has(key))
}

const text = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean.length >= min && clean.length <= max && !CONTROL_CHARACTERS.test(clean) ? clean : null
}

const validDate = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00.000Z'))
  && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')

const sha256 = async (value: string): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

const secretConfigured = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length >= 32
  && value.length <= 1024
  && !value.startsWith('replace-with-')

const approvalEnabled = (value: unknown): boolean =>
  typeof value === 'string' && value === 'true'

const constantTimeEqual = (left: string, right: string): boolean => {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const readJson = async (request: Request, maxBytes = MAX_JSON_BYTES): Promise<Record<string, unknown> | null> => {
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

const readSettings = (db: D1Database): Promise<StoreSettingsRow | null> =>
  db.prepare(
    'SELECT store_name, service_area, price_note, privacy_notice_version, privacy_notice, ' +
    'retention_days, pickup_enabled, delivery_enabled, delivery_fee_minor, order_intake_enabled, catalog_revision ' +
    'FROM store_settings WHERE id = 1',
  ).first<StoreSettingsRow>()

const readCatalog = async (db: D1Database, revision: number): Promise<CatalogSnapshot> => {
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

const settingsReady = (settings: StoreSettingsRow): boolean =>
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

const intakeReady = (settings: StoreSettingsRow, env: Env, hasProducts: boolean): boolean =>
  settings.order_intake_enabled === 1
  && settingsReady(settings)
  && hasProducts
  && approvalEnabled(env.PRIVACY_BASELINE_APPROVED)
  && approvalEnabled(env.DATA_REGION_APPROVED)
  && approvalEnabled(env.BACKUP_RESTORE_APPROVED)
  && approvalEnabled(env.RATE_LIMIT_REVIEW_APPROVED)
  && secretConfigured(env.OPERATOR_ACCESS_TOKEN)
  && secretConfigured(env.RATE_LIMIT_HMAC_SECRET)

const publicStore = (settings: StoreSettingsRow, env: Env, hasProducts: boolean) => ({
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

const parseOptionList = (value: unknown): CatalogOption[] | null => {
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

const parseFinishList = (value: unknown): CatalogFinish[] | null => {
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

const parseFlowerList = (value: unknown): CatalogFlower[] | null => {
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

const parseRecipe = (value: unknown, flowers: CatalogFlower[]): Array<{ id: string; quantity: number }> | null => {
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

const parseCatalog = (value: unknown): CatalogProduct[] | null => {
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

const operatorAuthorized = (request: Request, env: Env): boolean => {
  if (!secretConfigured(env.OPERATOR_ACCESS_TOKEN)) return false
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  return constantTimeEqual(header.slice(7), env.OPERATOR_ACCESS_TOKEN)
}

const operatorEvent = (db: D1Database, action: string, objectId: string, occurredAt: string) =>
  db.prepare(
    'INSERT INTO operator_events (event_id, action, object_id, occurred_at) VALUES (?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), action, objectId, occurredAt)

const handleSettingsRead = async (env: Env): Promise<Response> => {
  const settings = await readSettings(env.DB)
  if (!settings) return json(503, { error: 'Store setup is unavailable.' })
  const catalog = await readCatalog(env.DB, settings.catalog_revision)
  return json(200, {
    store: publicStore(settings, env, catalog.products.some(product => product.available)),
  })
}

const handleCatalogRead = async (env: Env): Promise<Response> => {
  const settings = await readSettings(env.DB)
  if (!settings) return json(503, { error: 'Catalog is not available yet.' })
  const snapshot = await readCatalog(env.DB, settings.catalog_revision)
  const store = publicStore(settings, env, snapshot.products.some(product => product.available))
  return json(200, { ...snapshot, store })
}

const handleSettingsUpdate = async (request: Request, env: Env): Promise<Response> => {
  if (!operatorAuthorized(request, env)) return json(401, { error: 'Florist access is required.' })
  const value = await readJson(request)
  if (!value || !exactKeys(value, [
    'storeName', 'serviceArea', 'priceNote', 'privacyNoticeVersion', 'privacyNotice',
    'retentionDays', 'pickupEnabled', 'deliveryEnabled', 'deliveryFeeMinor', 'orderIntakeEnabled',
  ])) return json(400, { error: 'Check the store settings and try again.' })
  const storeName = text(value.storeName, 1, 120)
  const serviceArea = text(value.serviceArea, 1, 240)
  const priceNote = text(value.priceNote, 1, 240)
  const noticeVersion = text(value.privacyNoticeVersion, 1, 80)
  const notice = text(value.privacyNotice, 20, 1200)
  const retention = value.retentionDays
  const pickup = value.pickupEnabled
  const delivery = value.deliveryEnabled
  const deliveryFee = value.deliveryFeeMinor
  const intake = value.orderIntakeEnabled
  if (!storeName || !serviceArea || !priceNote || !noticeVersion || !notice
    || typeof retention !== 'number' || !Number.isInteger(retention) || retention < 1 || retention > 365
    || typeof pickup !== 'boolean' || typeof delivery !== 'boolean'
    || !(deliveryFee === null || (typeof deliveryFee === 'number'
      && Number.isInteger(deliveryFee) && deliveryFee >= 0 && deliveryFee <= 200_000))
    || (delivery && deliveryFee === null)
    || typeof intake !== 'boolean' || (!pickup && !delivery)) {
    return json(422, { error: 'Complete the required store, service, privacy, retention, and fulfillment fields.' })
  }
  const settings = await readSettings(env.DB)
  if (!settings) return json(503, { error: 'Store settings are unavailable.' })
  const catalog = await readCatalog(env.DB, settings.catalog_revision)
  const hasProducts = catalog.products.some(product => product.available)
  if (intake && (!hasProducts || !approvalEnabled(env.PRIVACY_BASELINE_APPROVED)
    || !approvalEnabled(env.DATA_REGION_APPROVED)
    || !approvalEnabled(env.BACKUP_RESTORE_APPROVED)
    || !approvalEnabled(env.RATE_LIMIT_REVIEW_APPROVED)
    || !secretConfigured(env.OPERATOR_ACCESS_TOKEN) || !secretConfigured(env.RATE_LIMIT_HMAC_SECRET))) {
    return json(422, {
      error: 'Intake cannot be enabled until an available catalog is published and privacy, data-region, backup/restore, rate-limit review, operator access, and rate-limit secrets are approved.',
    })
  }
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE store_settings SET store_name = ?, service_area = ?, price_note = ?, ' +
      'privacy_notice_version = ?, privacy_notice = ?, retention_days = ?, pickup_enabled = ?, ' +
      'delivery_enabled = ?, delivery_fee_minor = ?, order_intake_enabled = ?, updated_at = ? WHERE id = 1',
    ).bind(
      storeName, serviceArea, priceNote, noticeVersion, notice, retention,
      pickup ? 1 : 0, delivery ? 1 : 0, deliveryFee, intake ? 1 : 0, now,
    ),
    operatorEvent(env.DB, 'store-settings-updated', 'store', now),
  ])
  return json(200, { ok: true, intakeEnabled: intake })
}

const handleCatalogUpdate = async (request: Request, env: Env): Promise<Response> => {
  if (!operatorAuthorized(request, env)) return json(401, { error: 'Florist access is required.' })
  const value = await readJson(request, MAX_CATALOG_BYTES)
  if (!value || !exactKeys(value, ['products'])) return json(400, { error: 'Check the catalog format and try again.' })
  const products = parseCatalog(value.products)
  if (!products) return json(422, { error: 'The catalog contains an invalid item, date, price, tag, wrapping finish, or flower recipe.' })
  const settings = await readSettings(env.DB)
  if (!settings) return json(503, { error: 'Catalog settings are unavailable.' })
  const revision = settings.catalog_revision + 1
  const publishedAt = new Date().toISOString()
  const snapshot = JSON.stringify({ revision, products })
  const batch = await env.DB.batch([
    env.DB.prepare(
      'UPDATE store_settings SET catalog_revision = ?, updated_at = ? WHERE id = 1 AND catalog_revision = ?',
    ).bind(revision, publishedAt, settings.catalog_revision),
    env.DB.prepare(
      'INSERT INTO catalog_revisions (revision, snapshot_json, published_at) ' +
      'SELECT ?, ?, ? WHERE (SELECT catalog_revision FROM store_settings WHERE id = 1) = ?',
    ).bind(revision, snapshot, publishedAt, revision),
    operatorEvent(env.DB, 'catalog-published', String(revision), publishedAt),
  ])
  if ((batch[0]?.meta?.changes ?? 0) !== 1 || (batch[1]?.meta?.changes ?? 0) !== 1) {
    return json(409, { error: 'The catalog changed in another operator session. Reload and try again.' })
  }
  return json(200, { ok: true, revision, productCount: products.length })
}

const normalizeRequest = (value: Record<string, unknown>): RequestPayload | null => {
  if (!exactKeys(value, [
    'productId', 'choices', 'finishing', 'flowers', 'serviceDate', 'fulfillment', 'buyerName',
    'contactMethod', 'contactValue', 'deliveryAddress', 'note', 'consent',
  ]) || !isRecord(value.choices) || !exactKeys(value.choices, ['size', 'stems'])
    || !isRecord(value.finishing) || !exactKeys(value.finishing, ['ribbon', 'outerWrap', 'innerWrap'])
    || !Array.isArray(value.flowers) || value.flowers.length > 24) return null
  const productId = typeof value.productId === 'string' ? value.productId : ''
  const serviceDate = value.serviceDate
  const fulfillment = value.fulfillment
  const buyerName = text(value.buyerName, 1, 100)
  const contactMethod = value.contactMethod
  const contactValue = text(value.contactValue, 3, 240)
  const deliveryAddress = value.deliveryAddress === '' ? '' : text(value.deliveryAddress, 4, 300)
  const note = value.note === '' ? '' : text(value.note, 0, 500)
  const size = typeof value.choices.size === 'string' ? value.choices.size : ''
  const stems = typeof value.choices.stems === 'string' ? value.choices.stems : ''
  const ribbon = typeof value.finishing.ribbon === 'string' ? value.finishing.ribbon : ''
  const outerWrap = typeof value.finishing.outerWrap === 'string' ? value.finishing.outerWrap : ''
  const innerWrap = typeof value.finishing.innerWrap === 'string' ? value.finishing.innerWrap : ''
  const flowerSelections: RequestPayload['flowers'] = []
  const seenFlowers = new Set<string>()
  let totalStems = 0
  for (const candidate of value.flowers) {
    if (!isRecord(candidate)) return null
    const hasLayerLayout = Object.prototype.hasOwnProperty.call(candidate, 'layers')
    if (!exactKeys(candidate, hasLayerLayout ? ['id', 'quantity', 'layers'] : ['id', 'quantity'])) return null
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    const quantity = candidate.quantity
    if (!OPTION_ID.test(id) || seenFlowers.has(id) || typeof quantity !== 'number'
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 12) return null
    let layers: FlowerLayerLayout[] | undefined
    if (hasLayerLayout) {
      if (!Array.isArray(candidate.layers) || candidate.layers.length !== quantity) return null
      layers = []
      for (const placement of candidate.layers) {
        if (!isRecord(placement)) return null
        const hasOrientation = Object.prototype.hasOwnProperty.call(placement, 'rotation')
          || Object.prototype.hasOwnProperty.call(placement, 'mirrored')
        if (!exactKeys(placement, hasOrientation
          ? ['offsetX', 'offsetY', 'scale', 'rotation', 'mirrored']
          : ['offsetX', 'offsetY', 'scale'])
          || typeof placement.offsetX !== 'number' || !Number.isFinite(placement.offsetX)
          || Math.abs(placement.offsetX) > 240
          || typeof placement.offsetY !== 'number' || !Number.isFinite(placement.offsetY)
          || Math.abs(placement.offsetY) > 240
          || typeof placement.scale !== 'number' || !Number.isFinite(placement.scale)
          || placement.scale < 0.5 || placement.scale > 2
          || (hasOrientation && (typeof placement.rotation !== 'number' || !Number.isFinite(placement.rotation)
            || Math.abs(placement.rotation) > 180 || typeof placement.mirrored !== 'boolean'))) return null
        layers.push({
          offsetX: placement.offsetX,
          offsetY: placement.offsetY,
          scale: placement.scale,
          rotation: hasOrientation ? placement.rotation as number : 0,
          mirrored: hasOrientation ? placement.mirrored as boolean : false,
        })
      }
    }
    seenFlowers.add(id)
    totalStems += quantity
    if (totalStems > 30) return null
    flowerSelections.push(layers ? { id, quantity, layers } : { id, quantity })
  }
  if (totalStems < 1) return null
  if (!PRODUCT_ID.test(productId) || !validDate(serviceDate)
    || (fulfillment !== 'pickup' && fulfillment !== 'delivery')
    || !buyerName || (contactMethod !== 'email' && contactMethod !== 'phone')
    || !contactValue || !size || !stems || !ribbon || !outerWrap || !innerWrap
    || deliveryAddress === null || note === null
    || typeof value.consent !== 'boolean' || value.consent !== true) return null
  if (contactMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactValue)) return null
  if (contactMethod === 'phone' && !/^[+0-9 ()-]{7,24}$/u.test(contactValue)) return null
  return {
    productId,
    choices: { size, stems },
    finishing: { ribbon, outerWrap, innerWrap },
    flowers: flowerSelections,
    serviceDate,
    fulfillment,
    buyerName,
    contactMethod,
    contactValue,
    deliveryAddress: deliveryAddress ?? '',
    note: note ?? '',
    consent: true,
  }
}

const selectedOption = (options: CatalogOption[], id: string): CatalogOption | null =>
  options.find(option => option.id === id && option.available) ?? null

const rateLimit = async (request: Request, env: Env): Promise<boolean> => {
  const secret = env.RATE_LIMIT_HMAC_SECRET
  const ip = request.headers.get('cf-connecting-ip')
  if (!secretConfigured(secret) || !ip || ip.length > 100) return false
  const now = Date.now()
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = hex(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(ip + ':' + String(windowStart)),
  ))
  const expiresAt = new Date(windowStart + RATE_WINDOW_MS * 2).toISOString()
  const row = await env.DB.prepare(
    'INSERT INTO request_rate_limits (bucket_digest, request_count, expires_at) ' +
    'VALUES (?, 1, ?) ON CONFLICT(bucket_digest) DO UPDATE SET request_count = request_count + 1 ' +
    'RETURNING request_count',
  ).bind(digest, expiresAt).first<{ request_count: number }>()
  return !!row && row.request_count <= RATE_LIMIT_PER_WINDOW
}

const createRequest = async (request: Request, env: Env): Promise<Response> => {
  const origin = request.headers.get('origin')
  if (origin !== new URL(request.url).origin) return json(403, { error: 'Request origin is not allowed.' })
  const idempotencyKey = request.headers.get('idempotency-key') ?? ''
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128 || CONTROL_CHARACTERS.test(idempotencyKey)) {
    return json(400, { error: 'A valid request key is required. Reload the form and try again.' })
  }
  const value = await readJson(request)
  const payload = value ? normalizeRequest(value) : null
  if (!payload) return json(422, { error: 'Check the request details and explicit consent before submitting.' })
  const settings = await readSettings(env.DB)
  if (!settings) return json(503, { error: 'Request intake is not available.' })
  const snapshot = await readCatalog(env.DB, settings.catalog_revision)
  const product = snapshot.products.find(item => item.id === payload.productId)
  const today = new Date().toISOString().slice(0, 10)
  if (!product || !product.available || payload.serviceDate < today || payload.serviceDate < product.availableFrom
    || payload.serviceDate > product.availableUntil) {
    return json(409, { error: 'That design or service date is no longer available. Review the current catalog.' })
  }
  if ((payload.fulfillment === 'pickup' && settings.pickup_enabled !== 1)
    || (payload.fulfillment === 'delivery' && settings.delivery_enabled !== 1)
    || (payload.fulfillment === 'delivery' && typeof settings.delivery_fee_minor !== 'number')
    || (payload.fulfillment === 'delivery' && payload.deliveryAddress.length === 0)) {
    return json(422, { error: 'The selected fulfillment method needs a valid store option and details.' })
  }
  const size = selectedOption(product.choices.size, payload.choices.size)
  const stems = selectedOption(product.choices.stems, payload.choices.stems)
  const ribbon = selectedOption(product.finishing.ribbon, payload.finishing.ribbon)
  const outerWrap = selectedOption(product.finishing.outerWrap, payload.finishing.outerWrap)
  const innerWrap = selectedOption(product.finishing.innerWrap, payload.finishing.innerWrap)
  const selectedFlowers = payload.flowers.map(selection => ({
    selection,
    flower: product.flowers.find(item => item.id === selection.id && item.available) ?? null,
  }))
  if (!size || !stems || !ribbon || !outerWrap || !innerWrap
    || selectedFlowers.some(item => !item.flower)) {
    return json(409, { error: 'One of those arrangement choices changed. Review the current design.' })
  }
  const includedFlowersMinor = product.recipe.reduce((total, item) => total
    + (product.flowers.find(flower => flower.id === item.id)?.pricePerStemMinor ?? 0) * item.quantity, 0)
  const selectedFlowersMinor = selectedFlowers.reduce((total, item) => total
    + (item.flower?.pricePerStemMinor ?? 0) * item.selection.quantity, 0)
  const flowerDetails = selectedFlowers.map(item => ({
    id: item.selection.id,
    label: item.flower!.label,
    colorHex: item.flower!.colorHex,
    quantity: item.selection.quantity,
    layers: item.selection.layers ?? Array.from({ length: item.selection.quantity }, () => ({
      offsetX: 0, offsetY: 0, scale: 1, rotation: 0, mirrored: false,
    })),
    pricePerStemMinor: item.flower!.pricePerStemMinor,
    subtotalMinor: item.flower!.pricePerStemMinor * item.selection.quantity,
  }))
  const deliveryFeeMinor = payload.fulfillment === 'delivery' ? Number(settings.delivery_fee_minor) : 0
  const totalMinor = product.basePriceMinor + size.priceDeltaMinor
    + stems.priceDeltaMinor + ribbon.priceDeltaMinor + outerWrap.priceDeltaMinor + innerWrap.priceDeltaMinor
    + selectedFlowersMinor - includedFlowersMinor + deliveryFeeMinor
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 1 || totalMinor > 3_000_000) {
    return json(422, { error: 'The florist catalog has an invalid price for this combination.' })
  }
  if (!intakeReady(settings, env, true)) {
    return json(503, { error: 'The florist has not enabled order requests yet.' })
  }
  if (!(await rateLimit(request, env))) {
    return json(429, { error: 'Too many requests from this connection. Wait a few minutes before trying again.' })
  }

  const now = new Date()
  const createdAt = now.toISOString()
  const retentionDays = Number(settings.retention_days)
  const retainUntil = new Date(now.getTime() + retentionDays * 86_400_000).toISOString()
  const requestId = crypto.randomUUID()
  const idempotencyDigest = await sha256(idempotencyKey)
  const priceSnapshot = {
    schema: 'miaoxyz/order-request/v1',
    catalogRevision: snapshot.revision,
    product: { id: product.id, name: product.name, basePriceMinor: product.basePriceMinor },
    choices: {
      size: { id: size.id, label: size.label, priceDeltaMinor: size.priceDeltaMinor },
      stems: { id: stems.id, label: stems.label, priceDeltaMinor: stems.priceDeltaMinor },
    },
    finishing: {
      ribbon: { id: ribbon.id, label: ribbon.label, priceDeltaMinor: ribbon.priceDeltaMinor },
      outerWrap: { id: outerWrap.id, label: outerWrap.label, priceDeltaMinor: outerWrap.priceDeltaMinor },
      innerWrap: { id: innerWrap.id, label: innerWrap.label, priceDeltaMinor: innerWrap.priceDeltaMinor },
    },
    includedFlowersMinor,
    selectedFlowersMinor,
    flowers: flowerDetails,
    deliveryFeeMinor,
    totalMinor,
    currency: 'SGD',
  }
  const savedRequest = {
    priceSnapshot,
    serviceDate: payload.serviceDate,
    fulfillment: payload.fulfillment,
    buyerName: payload.buyerName,
    contactMethod: payload.contactMethod,
    contactValue: payload.contactValue,
    deliveryAddress: payload.fulfillment === 'delivery' ? payload.deliveryAddress : '',
    note: payload.note,
    privacyNoticeVersion: settings.privacy_notice_version,
  }
  const requestJson = JSON.stringify(savedRequest)
  const fingerprint = await sha256(requestJson)
  const insert = env.DB.prepare(
    'INSERT INTO order_requests ' +
    '(request_id, idempotency_digest, request_fingerprint, request_json, status, created_at, updated_at, retain_until) ' +
    "VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?)",
  ).bind(requestId, idempotencyDigest, fingerprint, requestJson, createdAt, createdAt, retainUntil)
  const history = env.DB.prepare(
    'INSERT INTO request_status_history ' +
    "(event_id, request_id, previous_status, next_status, actor, occurred_at) VALUES (?, ?, NULL, 'submitted', 'buyer', ?)",
  ).bind(crypto.randomUUID(), requestId, createdAt)
  try {
    await env.DB.batch([insert, history])
    return json(201, {
      requestId,
      status: 'submitted',
      message: 'Request received. The florist will confirm availability and next steps. No payment has been taken and stock is not reserved.',
    })
  } catch {
    const existing = await env.DB.prepare(
      'SELECT request_id, request_fingerprint FROM order_requests WHERE idempotency_digest = ?',
    ).bind(idempotencyDigest).first<{ request_id: string; request_fingerprint: string }>()
    if (existing?.request_fingerprint === fingerprint) {
      return json(200, {
        requestId: existing.request_id,
        status: 'submitted',
        message: 'This request was already received. No payment has been taken and stock is not reserved.',
      })
    }
    if (existing) return json(409, { error: 'That request key was used for different details. Reload the form to start a new request.' })
    return json(503, { error: 'The request could not be confirmed. Keep this form open and retry once.' })
  }
}

const listOperatorRequests = async (env: Env): Promise<Response> => {
  const result = await env.DB.prepare(
    'SELECT request_id, request_json, status, created_at, updated_at, retain_until ' +
    'FROM order_requests ORDER BY created_at DESC LIMIT ?',
  ).bind(MAX_QUEUE_ROWS).all<{
    request_id: string
    request_json: string
    status: string
    created_at: string
    updated_at: string
    retain_until: string
  }>()
  return json(200, {
    requests: (result.results ?? []).map(row => ({
      requestId: row.request_id,
      request: JSON.parse(row.request_json),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      retainUntil: row.retain_until,
    })),
  })
}

const validTransition = (previous: string, next: string): boolean => {
  const allowed: Record<string, string[]> = {
    submitted: ['accepted', 'declined', 'cancelled'],
    accepted: ['fulfilled', 'cancelled'],
    declined: [],
    fulfilled: [],
    cancelled: [],
  }
  return allowed[previous]?.includes(next) ?? false
}

const changeRequestStatus = async (
  requestId: string,
  request: Request,
  env: Env,
): Promise<Response> => {
  if (!REQUEST_ID.test(requestId)) return json(404, { error: 'Request not found.' })
  if (!operatorAuthorized(request, env)) return json(401, { error: 'Florist access is required.' })
  const value = await readJson(request)
  if (!value || !exactKeys(value, ['status']) || typeof value.status !== 'string' || !STATUSES.has(value.status)) {
    return json(400, { error: 'Choose a supported request status.' })
  }
  const current = await env.DB.prepare(
    'SELECT status FROM order_requests WHERE request_id = ?',
  ).bind(requestId).first<{ status: string }>()
  if (!current) return json(404, { error: 'Request not found.' })
  if (!validTransition(current.status, value.status)) {
    return json(409, { error: 'That request cannot move to the selected status.' })
  }
  const now = new Date().toISOString()
  const result = await env.DB.batch([
    env.DB.prepare(
      'UPDATE order_requests SET status = ?, updated_at = ? WHERE request_id = ? AND status = ?',
    ).bind(value.status, now, requestId, current.status),
    env.DB.prepare(
      'INSERT INTO request_status_history ' +
      '(event_id, request_id, previous_status, next_status, actor, occurred_at) ' +
      "SELECT ?, ?, ?, ?, 'operator', ? WHERE (SELECT status FROM order_requests WHERE request_id = ?) = ?",
    ).bind(crypto.randomUUID(), requestId, current.status, value.status, now, requestId, value.status),
    operatorEvent(env.DB, 'request-status-changed', requestId, now),
  ])
  if ((result[0]?.meta?.changes ?? 0) !== 1 || (result[1]?.meta?.changes ?? 0) !== 1) {
    return json(409, { error: 'Another operator changed this request. Reload the queue.' })
  }
  return json(200, { ok: true, requestId, status: value.status })
}

const operatorRoute = async (request: Request, env: Env, path: string): Promise<Response> => {
  if (path === '/api/operator/settings' && request.method === 'GET') {
    if (!operatorAuthorized(request, env)) return json(401, { error: 'Florist access is required.' })
    const settings = await readSettings(env.DB)
    if (!settings) return json(503, { error: 'Store settings are unavailable.' })
    const catalog = await readCatalog(env.DB, settings.catalog_revision)
    return json(200, {
          settings: publicStore(settings, env, catalog.products.some(product => product.available)),
          orderIntakeEnabled: settings.order_intake_enabled === 1,
          retentionDays: settings.retention_days,
        })
  }
  if (path === '/api/operator/settings' && request.method === 'PUT') return handleSettingsUpdate(request, env)
  if (path === '/api/operator/catalog' && request.method === 'GET') {
    if (!operatorAuthorized(request, env)) return json(401, { error: 'Florist access is required.' })
    const settings = await readSettings(env.DB)
    if (!settings) return json(503, { error: 'Catalog is unavailable.' })
    return json(200, await readCatalog(env.DB, settings.catalog_revision))
  }
  if (path === '/api/operator/catalog' && request.method === 'PUT') return handleCatalogUpdate(request, env)
  if (path === '/api/operator/requests' && request.method === 'GET') {
    if (!operatorAuthorized(request, env)) return json(401, { error: 'Florist access is required.' })
    return listOperatorRequests(env)
  }
  const statusMatch = path.match(/^\/api\/operator\/requests\/([^/]+)\/status$/u)
  if (statusMatch && request.method === 'POST') return changeRequestStatus(statusMatch[1], request, env)
  return json(404, { error: 'Operator endpoint not found.' })
}

const apiRoute = async (request: Request, env: Env, path: string): Promise<Response> => {
  if (request.method === 'GET' && path === '/api/health') {
    return json(200, {
      ok: true,
      service: 'miaoxyz',
      environment: env.DEPLOYMENT_ENV ?? 'unknown',
      sourceRevision: env.RELEASE_SOURCE_REVISION,
      candidateDigest: env.RELEASE_CANDIDATE_DIGEST,
      versionId: env.CF_VERSION_METADATA.id,
    })
  }
  if (request.method === 'GET' && path === '/api/store') return handleSettingsRead(env)
  if (request.method === 'GET' && path === '/api/catalog') return handleCatalogRead(env)
  if (path.startsWith('/api/operator/')) return operatorRoute(request, env, path)
  if (request.method === 'POST' && path === '/api/requests') return createRequest(request, env)
  return json(404, { error: 'API endpoint not found.' })
}

const purgeExpired = async (db: D1Database): Promise<void> => {
  const now = new Date().toISOString()
  for (let batch = 0; batch < 10; batch++) {
    const rows = await db.prepare(
      'SELECT request_id FROM order_requests WHERE retain_until <= ? ORDER BY retain_until LIMIT 100',
    ).bind(now).all<{ request_id: string }>()
    const ids = (rows.results ?? []).map(row => row.request_id)
    if (ids.length === 0) break
    const placeholders = ids.map(() => '?').join(', ')
    await db.batch([
      db.prepare(
        'DELETE FROM request_status_history WHERE request_id IN (' + placeholders + ')',
      ).bind(...ids),
      db.prepare(
        'DELETE FROM order_requests WHERE request_id IN (' + placeholders + ')',
      ).bind(...ids),
    ])
  }
  await db.prepare('DELETE FROM request_rate_limits WHERE expires_at <= ?').bind(now).run()
}

const appPath = (pathname: string, basePath: string): string | null => {
  if (!basePath) return pathname
  if (pathname === basePath) return '/'
  if (pathname.startsWith(basePath + '/')) return pathname.slice(basePath.length) || '/'
  return null
}

const assetResponse = async (request: Request, env: Env, path: string): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(404, { error: 'Page not found.' })
  const assetPath = path === '/' ? '/index.html' : path
  const url = new URL(request.url)
  url.pathname = assetPath
  const assetRequest = new Request(url, request)
  const response = await env.ASSETS.fetch(assetRequest)
  return safeResponse(response, response.headers.get('content-type')?.includes('text/html') ?? false)
}

const fetchHandler = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  const basePath = (env.APP_BASE_PATH ?? '').replace(/\/+$/u, '')
  const path = appPath(url.pathname, basePath)
  if (path === null) return fetch(request)
  if (basePath && url.pathname === basePath) {
    url.pathname = basePath + '/'
    return Response.redirect(url.toString(), 308)
  }
  try {
    if (path.startsWith('/api/')) return await apiRoute(request, env, path)
    return await assetResponse(request, env, path)
  } catch {
    return json(503, { error: 'The shop is temporarily unavailable. Try again later.' })
  }
}

export default {
  fetch: fetchHandler,
  scheduled(_event: ScheduledEvent, env: Env, context: ExecutionContext) {
    context.waitUntil(purgeExpired(env.DB))
  },
}
