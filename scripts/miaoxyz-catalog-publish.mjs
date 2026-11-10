import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  digest, gitText, readJson, repoRootFrom, requireText, writeAtomicJson,
} from './miaoxyz-production-release-core.mjs'

export const CATALOG_SCHEMA = 'agentic-miaoxyz-catalog-publication-candidate/v1'
export const RECEIPT_SCHEMA = 'agentic-miaoxyz-catalog-publication-receipt/v1'
export const CATALOG_SOURCE = 'cloudflare/workers/miaoxyz/catalog/miaoxyz-florist-catalog-draft.json'
export const PUBLIC_CATALOG_URL = 'https://airvio.co/MiaoXYZ/api/catalog'
export const OPERATOR_CATALOG_URL = 'https://airvio.co/MiaoXYZ/api/operator/catalog'

const shaPattern = /^[0-9a-f]{40}$/u
const productIds = products => products.map(product => product.id)
const productsDigest = products => digest({ products })
const fail = message => { throw new Error(message) }

export const readApprovedCatalog = repoRoot => {
  const value = readJson(path.join(repoRoot, CATALOG_SOURCE))
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'products' || !Array.isArray(value.products)) {
    fail('MiaoXYZ catalog source must contain only a products array')
  }
  if (value.products.length !== 8) fail('MiaoXYZ catalog candidate must contain the eight owner-approved offers')
  const ids = new Set()
  const names = new Set()
  for (const product of value.products) {
    if (!product || typeof product !== 'object' || Array.isArray(product)
      || typeof product.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(product.id)
      || typeof product.name !== 'string' || !product.name.trim()
      || !Number.isSafeInteger(product.basePriceMinor) || product.basePriceMinor <= 0
      || product.available !== true
      || typeof product.availableFrom !== 'string' || Number.isNaN(Date.parse(product.availableFrom))
      || typeof product.availableUntil !== 'string' || Number.isNaN(Date.parse(product.availableUntil))
      || Date.parse(product.availableUntil) < Date.parse(product.availableFrom)) {
      fail('MiaoXYZ catalog source contains an invalid approved offer')
    }
    if (ids.has(product.id) || names.has(product.name)) fail('MiaoXYZ catalog source contains duplicate offer identity')
    ids.add(product.id)
    names.add(product.name)
  }
  return { products: value.products }
}

const readPublicCatalog = async () => {
  let response
  try {
    response = await fetch(PUBLIC_CATALOG_URL, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    fail('MiaoXYZ public catalog could not be read')
  }
  if (!response.ok) fail(`MiaoXYZ public catalog returned HTTP ${response.status}`)
  let value
  try { value = await response.json() } catch { fail('MiaoXYZ public catalog returned invalid JSON') }
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !Array.isArray(value.products) || value.store?.intakeEnabled !== false) {
    fail('MiaoXYZ public catalog state is not in the expected safe shape')
  }
  return {
    revision: value.revision,
    products: value.products,
    productsDigest: productsDigest(value.products),
    intakeEnabled: value.store.intakeEnabled,
  }
}

const assertExactMainSource = (repoRoot, sourceRevision) => {
  const workflowRef = requireText(process.env.GITHUB_REF, 'GITHUB_REF')
  const workflowSha = requireText(process.env.GITHUB_SHA, 'GITHUB_SHA')
  if (workflowRef !== 'refs/heads/main' || !shaPattern.test(sourceRevision)
    || workflowSha !== sourceRevision || gitText(repoRoot, ['rev-parse', 'HEAD']) !== sourceRevision) {
    fail('MiaoXYZ catalog publication requires the exact workflow_dispatch source on protected main')
  }
  let remoteHead
  try {
    remoteHead = gitText(repoRoot, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/u)[0]
  } catch {
    fail('MiaoXYZ catalog publication could not verify the protected main tip')
  }
  if (remoteHead !== sourceRevision) fail('MiaoXYZ catalog source is no longer the protected main tip')
}

const makeCandidate = async ({ repoRoot, sourceRevision }) => {
  assertExactMainSource(repoRoot, sourceRevision)
  const catalog = readApprovedCatalog(repoRoot)
  const live = await readPublicCatalog()
  const catalogDigest = productsDigest(catalog.products)
  const alreadyPublished = live.productsDigest === catalogDigest
  if (!alreadyPublished && (live.revision !== 0 || live.products.length !== 0)) {
    fail('MiaoXYZ catalog changed from the expected empty production baseline; refusing to overwrite it')
  }
  const candidate = {
    schema: CATALOG_SCHEMA,
    action: alreadyPublished ? 'already-published' : 'publish',
    sourceRevision,
    target: OPERATOR_CATALOG_URL,
    publicReadback: PUBLIC_CATALOG_URL,
    baseline: {
      revision: live.revision,
      productsDigest: live.productsDigest,
      productCount: live.products.length,
      intakeEnabled: live.intakeEnabled,
    },
    catalogDigest,
    productCount: catalog.products.length,
    productIds: productIds(catalog.products),
    products: catalog.products,
  }
  candidate.candidateDigest = digest(candidate)
  return candidate
}

const verifyCandidate = (value, { repoRoot, sourceRevision, expectedDigest }) => {
  if (!value || value.schema !== CATALOG_SCHEMA || !['publish', 'already-published'].includes(value.action)
    || value.sourceRevision !== sourceRevision || value.target !== OPERATOR_CATALOG_URL
    || value.publicReadback !== PUBLIC_CATALOG_URL || !Array.isArray(value.products)
    || value.productCount !== value.products.length || value.productCount !== 8
    || value.catalogDigest !== productsDigest(value.products)
    || JSON.stringify(value.productIds) !== JSON.stringify(productIds(value.products))) {
    fail('MiaoXYZ catalog publication candidate is invalid')
  }
  const { candidateDigest, ...body } = value
  if (candidateDigest !== digest(body) || candidateDigest !== expectedDigest) {
    fail('MiaoXYZ catalog publication candidate digest changed')
  }
  assertExactMainSource(repoRoot, sourceRevision)
  const source = readApprovedCatalog(repoRoot)
  if (productsDigest(source.products) !== value.catalogDigest) {
    fail('MiaoXYZ catalog source differs from the authorized publication candidate')
  }
}

const publishCandidate = async ({ repoRoot, candidatePath, receiptPath }) => {
  const candidate = readJson(candidatePath)
  const sourceRevision = requireText(process.env.SOURCE_SHA, 'SOURCE_SHA')
  const expectedDigest = requireText(process.env.EXPECTED_CANDIDATE_DIGEST, 'EXPECTED_CANDIDATE_DIGEST')
  verifyCandidate(candidate, { repoRoot, sourceRevision, expectedDigest })

  const live = await readPublicCatalog()
  if (live.intakeEnabled !== false) fail('MiaoXYZ request intake is enabled; refusing to change the catalog')
  let status = 'already-published'
  let revision = live.revision
  if (live.productsDigest !== candidate.catalogDigest) {
    if (candidate.action !== 'publish'
      || live.revision !== candidate.baseline.revision
      || live.productsDigest !== candidate.baseline.productsDigest
      || live.products.length !== 0 || live.revision !== 0) {
      fail('MiaoXYZ production catalog drifted after candidate preparation; no catalog write was made')
    }
    const operatorToken = requireText(process.env.MIAOXYZ_OPERATOR_ACCESS_TOKEN, 'MIAOXYZ_OPERATOR_ACCESS_TOKEN')
    if (operatorToken.length < 32) fail('MiaoXYZ operator access secret is not configured correctly')
    let response
    try {
      response = await fetch(OPERATOR_CATALOG_URL, {
        method: 'PUT',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${operatorToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          expectedRevision: candidate.baseline.revision,
          products: candidate.products,
        }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      fail('MiaoXYZ catalog publication request failed; inspect production state before retrying')
    }
    let result
    try { result = await response.json() } catch { fail(`MiaoXYZ catalog publication returned HTTP ${response.status}`) }
    if (!response.ok || result?.ok !== true || result?.revision !== candidate.baseline.revision + 1
      || result?.productCount !== candidate.productCount) {
      fail(`MiaoXYZ catalog publication was rejected with HTTP ${response.status}`)
    }
    status = 'published'
    revision = result.revision
  }

  const readback = await readPublicCatalog()
  if (readback.revision !== revision || readback.productsDigest !== candidate.catalogDigest
    || readback.products.length !== candidate.productCount || readback.intakeEnabled !== false) {
    fail('MiaoXYZ catalog publication readback did not match the authorized candidate')
  }
  const receipt = {
    schema: RECEIPT_SCHEMA,
    status,
    sourceRevision,
    candidateDigest: candidate.candidateDigest,
    catalogDigest: candidate.catalogDigest,
    previousRevision: candidate.baseline.revision,
    revision,
    productCount: candidate.productCount,
    productIds: candidate.productIds,
    intakeEnabled: false,
    recordedAt: new Date().toISOString(),
  }
  receipt.receiptDigest = digest(receipt)
  writeAtomicJson(receiptPath, receipt, 0o600)
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export const main = async () => {
  const [command, ...args] = process.argv.slice(2)
  const { values } = parseArgs({
    args,
    options: {
      'repo-root': { type: 'string' },
      'source-sha': { type: 'string' },
      output: { type: 'string' },
      candidate: { type: 'string' },
      receipt: { type: 'string' },
    },
    strict: true,
  })
  const repoRoot = repoRootFrom(values['repo-root'])
  if (command === 'prepare') {
    const candidate = await makeCandidate({
      repoRoot,
      sourceRevision: requireText(values['source-sha'], '--source-sha'),
    })
    writeAtomicJson(requireText(values.output, '--output'), candidate, 0o600)
    process.stdout.write(`${JSON.stringify({
      candidateDigest: candidate.candidateDigest,
      catalogDigest: candidate.catalogDigest,
      action: candidate.action,
      productCount: candidate.productCount,
      productIds: candidate.productIds,
      baselineRevision: candidate.baseline.revision,
      baselineProductCount: candidate.baseline.productCount,
      intakeEnabled: candidate.baseline.intakeEnabled,
    })}\n`)
    return
  }
  if (command === 'publish') {
    await publishCandidate({
      repoRoot,
      candidatePath: requireText(values.candidate, '--candidate'),
      receiptPath: requireText(values.receipt, '--receipt'),
    })
    return
  }
  fail('Use prepare or publish')
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch(error => {
    process.stderr.write(`${error?.message || 'MiaoXYZ catalog publication failed'}\n`)
    process.exitCode = 1
  })
}
