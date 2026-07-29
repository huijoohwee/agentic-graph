import { assembleCatalog } from './invocation-assemble.mjs'

const ENTRY_FIELDS = Object.freeze([
  'executionRouteTier',
  'ingressRoute',
  'intentSummary',
  'label',
  'prefixRole',
  'readOnly',
  'sourceCatalogs',
  'spendBearing',
  'targetExecutionRoute',
  'token',
])

const byteCompare = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)

const isPlainObject = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const structuralFailure = (token, fields) => ({
  code: 'INVALID_PUBLISHED_CATALOG',
  sourceCatalog: 'published-catalog',
  token,
  fields: [...new Set(fields)].sort(byteCompare),
})

const sanitizeFailure = failure => ({
  code: typeof failure?.code === 'string' ? failure.code : 'INVALID_INVOCATION_ENTRY',
  sourceCatalog: typeof failure?.sourceCatalog === 'string'
    ? failure.sourceCatalog
    : 'published-catalog',
  token: typeof failure?.token === 'string' ? failure.token : '<catalog>',
  fields: Array.isArray(failure?.fields)
    ? failure.fields.filter(field => typeof field === 'string').sort(byteCompare)
    : [],
})

const diagnosticSort = (left, right) => byteCompare(
  `${left.sourceCatalog}\u0000${left.token}\u0000${left.code}\u0000${left.fields.join(',')}`,
  `${right.sourceCatalog}\u0000${right.token}\u0000${right.code}\u0000${right.fields.join(',')}`,
)

const sourceDocumentsFor = entries => {
  const sources = new Map()
  for (const entry of entries) {
    for (const sourceCatalog of entry.sourceCatalogs) {
      const source = sources.get(sourceCatalog) ?? { catalogId: sourceCatalog, entries: [] }
      source.entries.push(Object.fromEntries(
        ENTRY_FIELDS
          .filter(field => field !== 'sourceCatalogs')
          .map(field => [field, entry[field]]),
      ))
      sources.set(sourceCatalog, source)
    }
  }
  return [...sources.values()].sort((left, right) => (
    byteCompare(left.catalogId, right.catalogId)
  ))
}

const validateEntryShape = entry => {
  if (!isPlainObject(entry)) return ['entry']
  const actualFields = Object.keys(entry).sort(byteCompare)
  const expectedFields = [...ENTRY_FIELDS].sort(byteCompare)
  const invalidFields = actualFields.length === expectedFields.length
    && actualFields.every((field, index) => field === expectedFields[index])
    ? []
    : ['entryFields']
  if (
    !Array.isArray(entry.sourceCatalogs)
    || entry.sourceCatalogs.length === 0
    || entry.sourceCatalogs.some(source => (
      typeof source !== 'string' || !source || source.trim() !== source
    ))
    || new Set(entry.sourceCatalogs).size !== entry.sourceCatalogs.length
  ) {
    invalidFields.push('sourceCatalogs')
  }
  return invalidFields
}

export function resolvePublishedInvocationCatalog(registry, suppliedCatalog) {
  if (suppliedCatalog === undefined) {
    return assembleCatalog([
      registry?.invocationRegistry ?? { catalogId: 'mcp', entries: [] },
    ])
  }

  if (!isPlainObject(suppliedCatalog) || !Array.isArray(suppliedCatalog.entries)) {
    const empty = assembleCatalog([])
    return {
      ...empty,
      validationFailures: [structuralFailure('<catalog>', ['entries'])],
    }
  }

  const structuralFailures = suppliedCatalog.entries.flatMap((entry, index) => {
    const fields = validateEntryShape(entry)
    return fields.length === 0
      ? []
      : [structuralFailure(
          typeof entry?.token === 'string' ? entry.token : `<entry:${index}>`,
          fields,
        )]
  })
  const validEntries = suppliedCatalog.entries.filter(entry => (
    validateEntryShape(entry).length === 0
  ))
  const normalized = assembleCatalog(sourceDocumentsFor(validEntries))
  const unreachableSources = Array.isArray(suppliedCatalog.unreachableSources)
    ? [...new Set(suppliedCatalog.unreachableSources.filter(source => (
        typeof source === 'string' && source && source.trim() === source
      )))].sort(byteCompare)
    : []
  if (
    !Array.isArray(suppliedCatalog.unreachableSources)
    || unreachableSources.length !== suppliedCatalog.unreachableSources.length
  ) {
    structuralFailures.push(structuralFailure('<catalog>', ['unreachableSources']))
  }
  const suppliedFailures = Array.isArray(suppliedCatalog.validationFailures)
    ? suppliedCatalog.validationFailures.map(sanitizeFailure)
    : []
  if (!Array.isArray(suppliedCatalog.validationFailures)) {
    structuralFailures.push(structuralFailure('<catalog>', ['validationFailures']))
  }
  if (suppliedCatalog.digest !== normalized.digest) {
    structuralFailures.push(structuralFailure('<catalog>', ['digest']))
  }

  return {
    entries: normalized.entries,
    digest: normalized.digest,
    unreachableSources,
    validationFailures: [
      ...normalized.validationFailures.map(sanitizeFailure),
      ...suppliedFailures,
      ...structuralFailures,
    ].sort(diagnosticSort),
  }
}
