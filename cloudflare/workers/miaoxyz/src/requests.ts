import type { CatalogOption, FlowerLayerLayout, RequestPayload } from './validation'
import {
  CONTROL_CHARACTERS, OPTION_ID, PRODUCT_ID, RATE_LIMIT_PER_WINDOW, RATE_WINDOW_MS,
  exactKeys, hex, intakeReady, isRecord, json, readCatalog, readJson, readSettings,
  secretConfigured, sha256, text, validDate,
} from './validation'

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

export const createRequest = async (request: Request, env: Env): Promise<Response> => {
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
