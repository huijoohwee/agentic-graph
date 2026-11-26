import { createHash } from 'node:crypto'

const MAX_PAGES = 11
const MAX_OBJECTS = 10000

const requireText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export const inventoryR2Bucket = async ({ accountId, bucketName, token, fetchImpl = fetch }) => {
  requireText(accountId, 'Cloudflare account ID')
  requireText(bucketName, 'R2 bucket name')
  requireText(token, 'Cloudflare API token')
  const objects = [], cursors = new Set()
  let cursor = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects`)
    url.searchParams.set('per_page', '1000')
    if (cursor) url.searchParams.set('cursor', cursor)
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`R2 inventory request failed with HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.success !== true || !Array.isArray(payload.result)) throw new Error('R2 inventory response is malformed')
    for (const object of payload.result) {
      if (typeof object?.key !== 'string' || !object.key || !Number.isSafeInteger(object.size) || object.size < 0
        || typeof object.etag !== 'string' || !object.etag) throw new Error('R2 object metadata is incomplete')
      objects.push({ key: object.key, size: object.size, etag: object.etag,
        lastModified: typeof object.last_modified === 'string' ? object.last_modified : null })
      if (objects.length > MAX_OBJECTS) throw new Error('R2 inventory exceeds the bounded migration preflight')
    }
    const info = payload.result_info || {}
    if (info.is_truncated === false) break
    if (info.is_truncated !== true) {
      if (payload.result.length < 1000) break
      throw new Error('R2 inventory pagination state is ambiguous')
    }
    cursor = requireText(info.cursor, 'R2 inventory cursor')
    if (cursors.has(cursor)) throw new Error('R2 inventory cursor repeated')
    cursors.add(cursor)
    if (page === MAX_PAGES - 1) throw new Error('R2 inventory exceeded the bounded page limit')
  }
  const sorted = objects.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  if (new Set(sorted.map(object => object.key)).size !== sorted.length) throw new Error('R2 inventory contains duplicate object keys')
  const totalBytes = sorted.reduce((total, object) => total + object.size, 0)
  if (!Number.isSafeInteger(totalBytes)) throw new Error('R2 inventory byte total exceeds the safe integer range')
  return { accountId, bucketName, objectCount: sorted.length, totalBytes, inventoryDigest: digest(sorted) }
}

export const requireEmptyR2Inventory = (inventory, expected) => {
  if (!inventory || inventory.objectCount !== 0 || inventory.totalBytes !== 0
    || !/^[0-9a-f]{64}$/.test(inventory.inventoryDigest || '')
    || !expected || inventory.accountId !== expected.accountId || inventory.bucketName !== expected.bucketName) {
    throw new Error('legacy R2 inventory is non-empty or unverified; preserve it and stop the D1 cutover')
  }
  return { schema: 'agentic-graph/r2-empty-inventory/v1', accountId: inventory.accountId,
    bucketName: inventory.bucketName, objectCount: 0, totalBytes: 0,
    inventoryDigest: inventory.inventoryDigest, observedAt: new Date().toISOString(),
    disposition: 'already-empty-no-copy-required' }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [command] = process.argv.slice(2)
  if (command !== 'inventory-empty') throw new Error('usage: node scripts/graph-r2-d1-migration.mjs inventory-empty')
  const inventory = await inventoryR2Bucket({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    bucketName: process.env.AGENTIC_OS_STORAGE_R2_BUCKET, token: process.env.CLOUDFLARE_API_TOKEN })
  console.log(JSON.stringify(requireEmptyR2Inventory(inventory, { accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    bucketName: process.env.AGENTIC_OS_STORAGE_R2_BUCKET })))
}
