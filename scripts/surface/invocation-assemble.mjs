import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile as defaultReadFile } from 'node:fs/promises'

export const INVOCATION_PREFIX_ROLES = Object.freeze([
  'mcp-tool-id',
  'action',
  'binding',
  'semantic',
])

const SURFACE_TIERS = new Set([
  'private',
  'gated',
  'public-artifact',
  'public-discoverable',
])
const HOSTED_PREFIX_ROLES = new Set(['action', 'binding', 'semantic'])
const MAX_SOURCE_CATALOGS = 1_000
const MAX_SOURCE_BYTES = 500_000
const MAX_SOURCE_TIMEOUT_MS = 10_000
const URL_PATTERN = /\b(?:https?|wss?):\/\/\S+/iu

const PREFIX_ROLE_ALIASES = new Map([
  ['mcp', 'mcp-tool-id'],
  ['mcp-tool', 'mcp-tool-id'],
  ['mcp-tool-id', 'mcp-tool-id'],
  ['/', 'action'],
  ['action', 'action'],
  ['command', 'action'],
  ['command route', 'action'],
  ['slash', 'action'],
  ['slash-command', 'action'],
  ['slash-command-token', 'action'],
  ['@', 'binding'],
  ['at', 'binding'],
  ['binding', 'binding'],
  ['at-binding', 'binding'],
  ['at-binding-token', 'binding'],
  ['#', 'semantic'],
  ['hash', 'semantic'],
  ['semantic', 'semantic'],
  ['hash-semantic', 'semantic'],
  ['hash-semantic-token', 'semantic'],
])

const byteCompare = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(byteCompare)
        .map(key => [key, canonicalize(value[key])]),
    )
  }
  return value
}

export const serializeCatalogDigestInput = entries => (
  `${JSON.stringify(canonicalize(entries))}\n`
)

export const calculateCatalogDigest = entries => (
  createHash('sha256')
    .update(serializeCatalogDigestInput(entries))
    .digest('hex')
)

const catalogName = source => {
  const declared = source?.catalogId ?? source?.id ?? source?.name
  if (typeof declared === 'string' && declared.trim()) return declared.trim()
  if (typeof source?.path === 'string' && source.path) return path.basename(source.path)
  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalize(source ?? null)))
    .digest('hex')
    .slice(0, 12)
  return `catalog-${digest}`
}

const asEntries = source => {
  if (Array.isArray(source)) return source
  if (Array.isArray(source?.entries)) return source.entries
  if (Array.isArray(source?.tokens)) return source.tokens
  if (Array.isArray(source?.catalog?.entries)) return source.catalog.entries
  return null
}

const characterCount = value => Array.from(String(value)).length

const normalizePrefixRole = value => PREFIX_ROLE_ALIASES.get(String(value ?? '').trim()) ?? null

const expectedPrefix = prefixRole => ({
  action: '/',
  binding: '@',
  semantic: '#',
})[prefixRole]

const directlyInvocableAddress = entry => {
  const addressFields = [
    entry?.directEndpoint,
    entry?.publicEndpoint,
    entry?.endpoint,
    entry?.endpointUrl,
    entry?.url,
  ]
  return addressFields.some(value => typeof value === 'string' && value.trim())
    || URL_PATTERN.test(String(entry?.label ?? entry?.displayLabel ?? ''))
    || URL_PATTERN.test(String(entry?.intentSummary ?? entry?.summary ?? ''))
}

const validateCandidate = (
  entry,
  source,
  sourceCatalog,
  approvedCatalogIds,
) => {
  const metadata = entry?.invocation ?? entry
  const token = typeof metadata?.token === 'string' ? metadata.token.trim() : ''
  const prefixRole = normalizePrefixRole(metadata?.prefixRole ?? metadata?.role)
  const label = typeof (metadata?.label ?? metadata?.displayLabel) === 'string'
    ? String(metadata.label ?? metadata.displayLabel).trim()
    : ''
  const intentSummary = typeof (metadata?.intentSummary ?? metadata?.summary) === 'string'
    ? String(metadata.intentSummary ?? metadata.summary).trim()
    : ''
  const executionRouteTier = String(
    metadata?.executionRouteTier
      ?? entry?.executionRouteTier
      ?? (entry?.targetExecutionRoute === 'control-plane-mcp' ? 'gated' : entry?.surfaceTier)
      ?? '',
  ).trim()
  const spendBearing = entry?.spendBearing === true
  const invalidFields = []

  if (!token) invalidFields.push('token')
  if (!prefixRole) invalidFields.push('prefixRole')
  if (characterCount(label) < 1 || characterCount(label) > 60) invalidFields.push('label')
  if (
    characterCount(intentSummary) < 1
    || characterCount(intentSummary) > 120
    || /[\r\n]/u.test(String(metadata?.intentSummary ?? metadata?.summary ?? ''))
  ) {
    invalidFields.push('intentSummary')
  }
  if (!SURFACE_TIERS.has(executionRouteTier)) invalidFields.push('executionRouteTier')

  const hostedToken = HOSTED_PREFIX_ROLES.has(prefixRole)
  const prefix = expectedPrefix(prefixRole)
  if (prefix && !token.startsWith(prefix)) invalidFields.push('token')
  if (hostedToken && directlyInvocableAddress(metadata)) invalidFields.push('directEndpoint')

  const declaredIngress = entry?.ingressRoute
    ?? metadata?.ingressRoute
    ?? metadata?.executionRoute
    ?? null
  const declaredTarget = entry?.targetExecutionRoute
    ?? metadata?.targetExecutionRoute
    ?? (
      !hostedToken && metadata?.executionRoute === 'control-plane-mcp'
        ? metadata.executionRoute
        : null
    )
  if (hostedToken && declaredIngress && declaredIngress !== 'invocation-forwarder') {
    invalidFields.push('ingressRoute')
  }
  if (hostedToken && declaredTarget && declaredTarget !== 'control-plane-mcp') {
    invalidFields.push('targetExecutionRoute')
  }
  if (
    spendBearing
    && !hostedToken
    && declaredTarget
    && declaredTarget !== 'control-plane-mcp'
  ) {
    invalidFields.push('targetExecutionRoute')
  }

  const sourcePolicy = entry?.publishPolicy
    ?? metadata?.publishPolicy
    ?? source?.publishPolicy
    ?? source?.publish_policy
  const inlineApprovalClaim = metadata?.approved === true
    || metadata?.operatorApproved === true
    || entry?.approved === true
    || entry?.operatorApproved === true
    || source?.approved === true
    || source?.operatorApproved === true
    || source?.untrustedInlineApproval === true
  if (/^dev-only\b/iu.test(String(sourcePolicy ?? ''))) {
    if (inlineApprovalClaim) {
      return {
        failure: {
          code: 'UNTRUSTED_INLINE_APPROVAL',
          sourceCatalog,
          token: token || '<missing>',
          fields: ['operatorApprovalRecord'],
        },
      }
    }
    if (!approvedCatalogIds.has(sourceCatalog)) {
      return { excludedDevOnly: true }
    }
  }

  if (invalidFields.length > 0) {
    return {
      failure: {
        code: 'INVALID_INVOCATION_ENTRY',
        sourceCatalog,
        token: token || '<missing>',
        fields: [...new Set(invalidFields)].sort(byteCompare),
      },
    }
  }

  const ingressRoute = hostedToken
    ? 'invocation-forwarder'
    : String(declaredIngress ?? (
      spendBearing ? 'control-plane-mcp' : 'public-read-mcp'
    ))
  const targetExecutionRoute = hostedToken || spendBearing
    ? 'control-plane-mcp'
    : String(declaredTarget ?? 'public-read-mcp')

  return {
    candidate: {
      token,
      prefixRole,
      label,
      intentSummary,
      executionRouteTier,
      ingressRoute,
      targetExecutionRoute,
      spendBearing,
      readOnly: entry?.readOnly === true || metadata?.readOnly === true,
      sourceCatalog,
    },
  }
}

const publishedProjection = (candidate, sourceCatalogs) => ({
  token: candidate.token,
  prefixRole: candidate.prefixRole,
  label: candidate.label,
  intentSummary: candidate.intentSummary,
  executionRouteTier: candidate.executionRouteTier,
  ingressRoute: candidate.ingressRoute,
  targetExecutionRoute: candidate.targetExecutionRoute,
  spendBearing: candidate.spendBearing,
  readOnly: candidate.readOnly,
  sourceCatalogs,
})

const candidateIdentity = candidate => JSON.stringify(canonicalize({
  prefixRole: candidate.prefixRole,
  label: candidate.label,
  intentSummary: candidate.intentSummary,
  executionRouteTier: candidate.executionRouteTier,
  ingressRoute: candidate.ingressRoute,
  targetExecutionRoute: candidate.targetExecutionRoute,
  spendBearing: candidate.spendBearing,
  readOnly: candidate.readOnly,
}))

const sortFailures = failures => [...failures].sort((left, right) => byteCompare(
  `${left.sourceCatalog ?? ''}\u0000${left.token ?? ''}\u0000${left.code}\u0000${(left.fields ?? []).join(',')}`,
  `${right.sourceCatalog ?? ''}\u0000${right.token ?? ''}\u0000${right.code}\u0000${(right.fields ?? []).join(',')}`,
))

export const assembleCatalog = (sources = [], options = {}) => {
  const grouped = new Map()
  const unreachableSources = []
  const validationFailures = []
  const approvedCatalogIds = new Set(
    Array.isArray(options.approvedCatalogIds)
      ? options.approvedCatalogIds.filter(value => typeof value === 'string')
      : [],
  )

  for (const source of sources) {
    const sourceCatalog = catalogName(source)
    if (source?.unreachable === true || source?.error === 'unreachable') {
      unreachableSources.push(sourceCatalog)
      continue
    }
    const entries = asEntries(source)
    if (!entries) {
      validationFailures.push({
        code: 'INVALID_SOURCE_CATALOG',
        sourceCatalog,
        token: '<catalog>',
        fields: ['entries'],
      })
      continue
    }
    for (const entry of entries) {
      const result = validateCandidate(
        entry,
        source,
        sourceCatalog,
        approvedCatalogIds,
      )
      if (result.excludedDevOnly) continue
      if (result.failure) {
        validationFailures.push(result.failure)
        continue
      }
      const tokenEntries = grouped.get(result.candidate.token) ?? []
      tokenEntries.push(result.candidate)
      grouped.set(result.candidate.token, tokenEntries)
    }
  }

  const entries = []
  for (const token of [...grouped.keys()].sort(byteCompare)) {
    const candidates = grouped.get(token)
      .sort((left, right) => byteCompare(candidateIdentity(left), candidateIdentity(right)))
    const retained = candidates[0]
    const sourceCatalogs = [...new Set(candidates.map(candidate => candidate.sourceCatalog))]
      .sort(byteCompare)
    entries.push(publishedProjection(retained, sourceCatalogs))
  }

  return {
    entries,
    digest: calculateCatalogDigest(entries),
    unreachableSources: [...new Set(unreachableSources)].sort(byteCompare),
    validationFailures: sortFailures(validationFailures),
  }
}

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    const error = new Error('source catalog read timed out')
    error.code = 'SOURCE_TIMEOUT'
    reject(error)
  }, timeoutMs)
  Promise.resolve(promise).then(
    value => {
      clearTimeout(timer)
      resolve(value)
    },
    error => {
      clearTimeout(timer)
      reject(error)
    },
  )
})

const unquoteFrontmatter = value => {
  const trimmed = String(value).trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const parseMarkdownCatalog = source => {
  const lines = source.split(/\r?\n/u)
  if (lines[0] !== '---') throw new SyntaxError('source catalog frontmatter is missing')
  const frontmatterEnd = lines.indexOf('---', 1)
  if (frontmatterEnd === -1) throw new SyntaxError('source catalog frontmatter is unclosed')
  const frontmatter = {}
  for (const line of lines.slice(1, frontmatterEnd)) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/u)
    if (match) frontmatter[match[1]] = unquoteFrontmatter(match[2])
  }
  const prefixRole = normalizePrefixRole(frontmatter.prefix)
  if (!prefixRole) throw new SyntaxError('source catalog prefix is invalid')

  const entries = []
  for (const line of lines.slice(frontmatterEnd + 1)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/u)
    if (!match || !match[1].startsWith(expectedPrefix(prefixRole))) continue
    const token = match[1].trim()
    const label = token
      .slice(1)
      .replaceAll(/[._:-]+/gu, ' ')
      .replaceAll(/\s+/gu, ' ')
      .trim()
    entries.push({
      token,
      prefixRole,
      label: label ? `${label[0].toUpperCase()}${label.slice(1)}` : token,
      intentSummary: match[2].replaceAll(/`([^`]+)`/gu, '$1').trim(),
      executionRouteTier: 'gated',
      ingressRoute: 'invocation-forwarder',
      targetExecutionRoute: 'control-plane-mcp',
      spendBearing: false,
    })
  }
  return {
    entries,
    publishPolicy: /^dev-only\b/iu.test(frontmatter.publish_policy ?? '')
      ? 'dev-only'
      : frontmatter.publish_policy,
  }
}

const parseSourceBytes = bytes => {
  if (
    bytes
    && typeof bytes === 'object'
    && !Buffer.isBuffer(bytes)
    && !(bytes instanceof Uint8Array)
  ) {
    return bytes
  }
  const buffer = Buffer.from(bytes)
  if (buffer.byteLength > MAX_SOURCE_BYTES) {
    const error = new Error(`source catalog exceeds ${MAX_SOURCE_BYTES} bytes`)
    error.code = 'SOURCE_TOO_LARGE'
    throw error
  }
  const source = buffer.toString('utf8')
  return source.trimStart().startsWith('{') || source.trimStart().startsWith('[')
    ? JSON.parse(source)
    : parseMarkdownCatalog(source)
}

export const assembleCatalogFromFiles = async (
  sourceDescriptors,
  {
    approvedCatalogIds = [],
    readFile = defaultReadFile,
    timeoutMs = MAX_SOURCE_TIMEOUT_MS,
    maxSources = MAX_SOURCE_CATALOGS,
  } = {},
) => {
  if (!Array.isArray(sourceDescriptors)) throw new TypeError('sourceDescriptors must be an array')
  if (sourceDescriptors.length > maxSources) {
    throw new Error(`source catalog limit exceeded: ${maxSources}`)
  }
  const boundedTimeoutMs = Math.min(
    MAX_SOURCE_TIMEOUT_MS,
    Math.max(1, Number(timeoutMs) || MAX_SOURCE_TIMEOUT_MS),
  )
  const loaded = await Promise.all(sourceDescriptors.map(async descriptor => {
    const source = typeof descriptor === 'string' ? { path: descriptor } : descriptor
    const sourceCatalog = catalogName(source)
    try {
      const bytes = Object.hasOwn(source ?? {}, 'content')
        ? source.content
        : await withTimeout(readFile(source.path, source), boundedTimeoutMs)
      const document = parseSourceBytes(bytes)
      return {
        ...document,
        catalogId: sourceCatalog,
        publishPolicy: source.publishPolicy ?? document.publishPolicy,
        untrustedInlineApproval: (
          source.approved === true
          || source.operatorApproved === true
          || document.approved === true
          || document.operatorApproved === true
        ),
      }
    } catch (error) {
      return {
        catalogId: sourceCatalog,
        unreachable: error?.code !== 'SOURCE_TOO_LARGE' && error instanceof SyntaxError === false,
        loadFailure: error?.code === 'SOURCE_TOO_LARGE' ? 'sourceSize' : 'sourceDocument',
      }
    }
  }))

  const assemblyInputs = loaded.map(source => (
    source.loadFailure && !source.unreachable
      ? { ...source, entries: [] }
      : source
  ))
  const result = assembleCatalog(assemblyInputs, { approvedCatalogIds })
  const loadFailures = loaded
    .filter(source => source.loadFailure && !source.unreachable)
    .map(source => ({
      code: 'INVALID_SOURCE_CATALOG',
      sourceCatalog: source.catalogId,
      token: '<catalog>',
      fields: [source.loadFailure],
    }))
  return {
    ...result,
    sourceDocuments: assemblyInputs,
    validationFailures: sortFailures([...result.validationFailures, ...loadFailures]),
  }
}
