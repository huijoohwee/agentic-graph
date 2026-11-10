import { createRequest } from './requests'
import {
  MAX_CATALOG_BYTES, MAX_QUEUE_ROWS, REQUEST_ID, STATUSES, approvalEnabled, constantTimeEqual,
  exactKeys, json, publicStore, readCatalog, readJson, readSettings, secretConfigured, text,
} from './validation'

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
    || retention !== 30
    || typeof pickup !== 'boolean' || typeof delivery !== 'boolean'
    || !(deliveryFee === null || (typeof deliveryFee === 'number'
      && Number.isInteger(deliveryFee) && deliveryFee >= 0 && deliveryFee <= 200_000))
    || (delivery && deliveryFee === null)
    || typeof intake !== 'boolean' || (!pickup && !delivery)) {
    return json(422, { error: 'Complete the required store, service, privacy, 30-day retention, and fulfillment fields.' })
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
  if (!value || !exactKeys(value, ['products', 'expectedRevision'])) return json(400, { error: 'Check the catalog format and try again.' })
  const expectedRevision = value.expectedRevision
  if (expectedRevision !== undefined && (typeof expectedRevision !== 'number'
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
    return json(400, { error: 'The expected catalog revision is invalid.' })
  }
  const products = parseCatalog(value.products)
  if (!products) return json(422, { error: 'The catalog contains an invalid item, date, price, tag, wrapping finish, or flower recipe.' })
  const settings = await readSettings(env.DB)
  if (!settings) return json(503, { error: 'Catalog settings are unavailable.' })
  if (expectedRevision !== undefined && expectedRevision !== settings.catalog_revision) {
    return json(409, { error: 'The catalog changed after this update was prepared. Reload and try again.' })
  }
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

export const apiRoute = async (request: Request, env: Env, path: string): Promise<Response> => {
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
