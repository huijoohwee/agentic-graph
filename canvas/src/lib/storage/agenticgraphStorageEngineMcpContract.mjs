export const KNOWGRPH_STORAGE_GIT_INVOCATION_PREFIX = Object.freeze([
  '/git.run',
  '@local-git-repository',
  '@git-remote',
  '#git-remote',
])

export const KNOWGRPH_FILE_SYNC_INVOCATION_PREFIX = Object.freeze([
  '/file.sync',
  '@persisted-cache',
  '@file-sync-provider',
  '#multi-provider-file-sync',
])

export const KNOWGRPH_STORAGE_BROWSER_TOOL_IDS = Object.freeze({
  inspectLocalGitRepository: 'inspect_local_git_repository',
  controlLocalGitRepository: 'control_local_git_repository',
  inspectLocalFileSync: 'inspect_local_file_sync',
  controlLocalFileSync: 'control_local_file_sync',
})

export const KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES = Object.freeze({
  gitRun: 'knowgrph.git.run',
  fileSyncRun: 'knowgrph.file.sync',
})

export const KNOWGRPH_STORAGE_GIT_OPERATIONS = Object.freeze([
  'clone',
  'fetch',
  'commit',
  'push',
])

export const KNOWGRPH_FILE_SYNC_DIRECTIONS = Object.freeze(['pull', 'push'])

const ID_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 80,
  pattern: '^[a-z0-9][a-z0-9._-]*$',
})

const CANONICAL_PATH_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 1024,
  pattern: '^(?!.*[\\u0000-\\u001F\\u007F])(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//).+$',
})

const GIT_REF_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 12,
  maxLength: 255,
  pattern: '^refs/heads/(?!.*(?:\\.\\.|//))[A-Za-z0-9._/-]+$',
})

const INVOCATION_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 4096,
  pattern: '^(?!.*[\\u0000-\\u001F\\u007F])(?=\\s*\\S)[\\s\\S]+$',
})

const gitStructuredSchema = (operation, required = []) => Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'remoteId', 'canonicalPathScope', 'baseRef', ...required],
  properties: {
    operation: { const: operation },
    remoteId: ID_SCHEMA,
    canonicalPathScope: CANONICAL_PATH_SCHEMA,
    baseRef: GIT_REF_SCHEMA,
    ...(operation === 'commit'
      ? { message: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' } }
      : {}),
  },
})

export const KNOWGRPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    invocation: INVOCATION_SCHEMA,
    operation: { type: 'string', enum: KNOWGRPH_STORAGE_GIT_OPERATIONS },
    remoteId: ID_SCHEMA,
    canonicalPathScope: CANONICAL_PATH_SCHEMA,
    baseRef: GIT_REF_SCHEMA,
    message: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
  },
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['invocation'],
      properties: { invocation: INVOCATION_SCHEMA },
    },
    gitStructuredSchema('clone'),
    gitStructuredSchema('fetch'),
    gitStructuredSchema('commit', ['message']),
    gitStructuredSchema('push'),
  ],
})

export const KNOWGRPH_FILE_SYNC_CONTROL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    invocation: INVOCATION_SCHEMA,
    direction: { type: 'string', enum: KNOWGRPH_FILE_SYNC_DIRECTIONS },
    providerId: ID_SCHEMA,
    prefix: CANONICAL_PATH_SCHEMA,
  },
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['invocation'],
      properties: { invocation: INVOCATION_SCHEMA },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['direction', 'providerId', 'prefix'],
      properties: {
        direction: { type: 'string', enum: KNOWGRPH_FILE_SYNC_DIRECTIONS },
        providerId: ID_SCHEMA,
        prefix: CANONICAL_PATH_SCHEMA,
      },
    },
  ],
})

const normalize = value => String(value || '').trim()
const isSafeId = value => /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)
const hasControlCharacters = value => Array.from(value).some(character => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 31 || codePoint === 127
})
const isSafeCanonicalPath = value => {
  if (
    !value
    || value.length > 1024
    || value.startsWith('/')
    || value.includes('//')
    || hasControlCharacters(value)
  ) return false
  return !value.split('/').some(part => !part || part === '.' || part === '..')
}
const isSafeGitRef = value => {
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value)) return false
  return value.length <= 255
    && !value.includes('..')
    && !value.includes('//')
    && !value.endsWith('/')
    && !value.endsWith('.')
    && !value.endsWith('.lock')
}

const parseKeyValues = (tokens, allowedKeys) => {
  const values = {}
  for (const token of tokens) {
    const separator = token.indexOf('=')
    if (separator <= 0) throw new Error(`Invalid invocation field: ${token || '(empty)'}.`)
    const key = token.slice(0, separator)
    const value = token.slice(separator + 1)
    if (!allowedKeys.has(key)) throw new Error(`Unknown invocation field: ${key}.`)
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate invocation field: ${key}.`)
    if (!value) throw new Error(`Invocation field ${key} cannot be empty.`)
    values[key] = value
  }
  return values
}

const requirePrefix = (tokens, expectedPrefix) => {
  if (tokens.length < expectedPrefix.length) throw new Error('Invocation is incomplete.')
  expectedPrefix.forEach((expected, index) => {
    if (tokens[index] !== expected) {
      throw new Error(`Invocation token ${index + 1} must be ${expected}.`)
    }
  })
}

const decodeInvocationValue = (value, field) => {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error(`Invocation field ${field} is not valid percent-encoded text.`)
  }
}

export const parseKnowgrphGitInvocation = invocation => {
  const tokens = normalize(invocation).split(/\s+/).filter(Boolean)
  requirePrefix(tokens, KNOWGRPH_STORAGE_GIT_INVOCATION_PREFIX)
  const values = parseKeyValues(
    tokens.slice(KNOWGRPH_STORAGE_GIT_INVOCATION_PREFIX.length),
    new Set(['operation', 'remote', 'path', 'base-ref', 'message']),
  )
  const operation = normalize(values.operation)
  const remoteId = normalize(values.remote)
  const canonicalPathScope = decodeInvocationValue(normalize(values.path), 'path')
  const baseRef = decodeInvocationValue(normalize(values['base-ref']), 'base-ref')
  const message = values.message == null
    ? undefined
    : decodeInvocationValue(normalize(values.message), 'message')
  if (!KNOWGRPH_STORAGE_GIT_OPERATIONS.includes(operation)) {
    throw new Error(`Unsupported git operation: ${operation || '(missing)'}.`)
  }
  if (!isSafeId(remoteId)) throw new Error('Git remote id is invalid.')
  if (!isSafeCanonicalPath(canonicalPathScope)) throw new Error('Git canonical path scope is invalid.')
  if (!isSafeGitRef(baseRef)) throw new Error('Git base ref is invalid.')
  if (operation === 'commit' && !normalize(message)) throw new Error('Git commit message is required.')
  if (operation !== 'commit' && message !== undefined) {
    throw new Error('Git message is accepted only for commit operations.')
  }
  return {
    operation,
    remoteId,
    canonicalPathScope,
    baseRef,
    ...(message === undefined ? {} : { message }),
  }
}

export const parseKnowgrphFileSyncInvocation = invocation => {
  const tokens = normalize(invocation).split(/\s+/).filter(Boolean)
  requirePrefix(tokens, KNOWGRPH_FILE_SYNC_INVOCATION_PREFIX)
  const values = parseKeyValues(
    tokens.slice(KNOWGRPH_FILE_SYNC_INVOCATION_PREFIX.length),
    new Set(['direction', 'provider', 'prefix']),
  )
  const direction = normalize(values.direction)
  const providerId = normalize(values.provider)
  const prefix = decodeInvocationValue(normalize(values.prefix), 'prefix')
  if (!KNOWGRPH_FILE_SYNC_DIRECTIONS.includes(direction)) {
    throw new Error(`Unsupported file-sync direction: ${direction || '(missing)'}.`)
  }
  if (!isSafeId(providerId)) throw new Error('File-sync provider id is invalid.')
  if (!isSafeCanonicalPath(prefix)) throw new Error('File-sync prefix is invalid.')
  return { direction, providerId, prefix }
}

export const normalizeKnowgrphGitControlInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Git control input must be an object.')
  }
  const keys = Object.keys(input)
  if (keys.includes('invocation')) {
    if (keys.length !== 1 || typeof input.invocation !== 'string') {
      throw new Error('Git invocation input cannot be mixed with structured fields.')
    }
    return parseKnowgrphGitInvocation(input.invocation)
  }
  const allowed = new Set(['operation', 'remoteId', 'canonicalPathScope', 'baseRef', 'message'])
  if (keys.some(key => !allowed.has(key))) throw new Error('Git control input contains an unknown field.')
  const operation = normalize(input.operation)
  const remoteId = normalize(input.remoteId)
  if (hasControlCharacters(String(input.canonicalPathScope || ''))) {
    throw new Error('Git canonical path scope is invalid.')
  }
  const canonicalPathScope = normalize(input.canonicalPathScope)
  const baseRef = normalize(input.baseRef)
  const message = input.message == null ? undefined : normalize(input.message)
  if (!KNOWGRPH_STORAGE_GIT_OPERATIONS.includes(operation)) throw new Error('Git operation is invalid.')
  if (!isSafeId(remoteId)) throw new Error('Git remote id is invalid.')
  if (!isSafeCanonicalPath(canonicalPathScope)) throw new Error('Git canonical path scope is invalid.')
  if (!isSafeGitRef(baseRef)) throw new Error('Git base ref is invalid.')
  if (operation === 'commit' && !message) throw new Error('Git commit message is required.')
  if (operation !== 'commit' && message !== undefined) {
    throw new Error('Git message is accepted only for commit operations.')
  }
  return { operation, remoteId, canonicalPathScope, baseRef, ...(message ? { message } : {}) }
}

export const normalizeKnowgrphFileSyncControlInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('File-sync control input must be an object.')
  }
  const keys = Object.keys(input)
  if (keys.includes('invocation')) {
    if (keys.length !== 1 || typeof input.invocation !== 'string') {
      throw new Error('File-sync invocation input cannot be mixed with structured fields.')
    }
    return parseKnowgrphFileSyncInvocation(input.invocation)
  }
  const allowed = new Set(['direction', 'providerId', 'prefix'])
  if (keys.some(key => !allowed.has(key))) throw new Error('File-sync input contains an unknown field.')
  const direction = normalize(input.direction)
  const providerId = normalize(input.providerId)
  if (hasControlCharacters(String(input.prefix || ''))) {
    throw new Error('File-sync prefix is invalid.')
  }
  const prefix = normalize(input.prefix)
  if (!KNOWGRPH_FILE_SYNC_DIRECTIONS.includes(direction)) throw new Error('File-sync direction is invalid.')
  if (!isSafeId(providerId)) throw new Error('File-sync provider id is invalid.')
  if (!isSafeCanonicalPath(prefix)) throw new Error('File-sync prefix is invalid.')
  return { direction, providerId, prefix }
}
