import { deepFreezeGameOsValue } from './canonical.js'
import { GameOsError } from './types.js'

export const GAME_OS_COMMAND_ROUTE = '/world' as const
export const GAME_OS_BINDING = '@game-os' as const
export const GAME_OS_TAG = '#persistent-world' as const
export const GAME_OS_OPERATIONS = ['open', 'resume', 'order', 'commit', 'reset', 'close'] as const

export type GameOsOperation = typeof GAME_OS_OPERATIONS[number]

export type GameOsInvocation = {
  route: typeof GAME_OS_COMMAND_ROUTE
  binding: typeof GAME_OS_BINDING
  tag: typeof GAME_OS_TAG
  arguments: { operation: GameOsOperation }
}

export const formatCanonicalGameOsInvocation = (operation: GameOsOperation): string => {
  if (!GAME_OS_OPERATIONS.includes(operation)) {
    throw invalidInvocation('undeclared operation', String(operation))
  }
  return `${GAME_OS_COMMAND_ROUTE} ${GAME_OS_BINDING} ${GAME_OS_TAG} operation=${operation}`
}

const invalidInvocation = (reason: string, token = ''): GameOsError =>
  new GameOsError('invocation-invalid', `Game OS invocation is invalid: ${reason}.`, {
    reason,
    token,
  })

const assertSingleSigil = (tokens: string[], sigil: string, label: string): string => {
  const matches = tokens.filter(token => token.startsWith(sigil))
  if (matches.length !== 1) {
    throw invalidInvocation(matches.length === 0 ? `missing ${label}` : `duplicate ${label}`, matches.join(' '))
  }
  return matches[0]
}

export const parseGameOsInvocation = (input: string): GameOsInvocation => {
  if (typeof input !== 'string') throw invalidInvocation('input must be a string')
  const normalized = input.trim()
  if (!normalized) throw invalidInvocation('empty input')
  const tokens = normalized.split(/\s+/u)
  const route = assertSingleSigil(tokens, '/', 'command route')
  const binding = assertSingleSigil(tokens, '@', 'binding')
  const tag = assertSingleSigil(tokens, '#', 'tag')
  if (route !== GAME_OS_COMMAND_ROUTE) throw invalidInvocation('unknown command route', route)
  if (binding !== GAME_OS_BINDING) throw invalidInvocation('unknown binding', binding)
  if (tag !== GAME_OS_TAG) throw invalidInvocation('unknown tag', tag)

  const argumentTokens = tokens.filter(token => !token.startsWith('/') && !token.startsWith('@') && !token.startsWith('#'))
  if (argumentTokens.length !== 1) {
    throw invalidInvocation(argumentTokens.length === 0 ? 'missing operation' : 'duplicate or extra arguments')
  }
  const separator = argumentTokens[0].indexOf('=')
  if (separator < 1 || separator === argumentTokens[0].length - 1) {
    throw invalidInvocation('argument must use key=value syntax', argumentTokens[0])
  }
  const key = argumentTokens[0].slice(0, separator)
  const value = argumentTokens[0].slice(separator + 1)
  if (key !== 'operation') throw invalidInvocation('unknown argument key', key)
  if (!GAME_OS_OPERATIONS.includes(value as GameOsOperation)) {
    throw invalidInvocation('undeclared operation', value)
  }
  if (normalized !== formatCanonicalGameOsInvocation(value as GameOsOperation)) {
    throw invalidInvocation('non-canonical invocation', normalized)
  }
  return deepFreezeGameOsValue({
    route: GAME_OS_COMMAND_ROUTE,
    binding: GAME_OS_BINDING,
    tag: GAME_OS_TAG,
    arguments: { operation: value as GameOsOperation },
  }) as GameOsInvocation
}
