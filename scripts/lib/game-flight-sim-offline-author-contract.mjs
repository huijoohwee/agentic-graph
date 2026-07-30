export const FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL = new URL(
  './game-flight-sim-optional-prop-author.mjs',
  import.meta.url,
)
export const FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT =
  'authorFlightSimOptionalProp'

const SOURCE_BLOCKS = Object.freeze([
  Object.freeze({
    operation: 'network-fetch',
    pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|undici|axios|node:(?:http|https|net|tls|dgram|dns|child_process))\b|['"]f['"]\s*,\s*['"]etch['"]/i,
  }),
  Object.freeze({
    operation: 'image-to-3d-model-call',
    pattern: /\b(?:trellis\w*|image[-_ ]?to[-_ ]?3d\w*|text[-_ ]?to[-_ ]?3d\w*|remote3dmodel\w*)\b/i,
  }),
  Object.freeze({
    operation: 'cloudflare-resource-request',
    pattern: /@cloudflare(?:\/[\w.-]+)?|\bcloudflare(?:Workers|Resource|AI|R2|D1|KV)\w*\b|\bwrangler\w*\b/i,
  }),
])

const CANONICAL_STATIC_IMPORT =
  "import { createHash } from 'node:crypto'"
const AUTHORITY_BYPASS_PATTERN =
  /\bimport\s*\(|\b(?:eval|Function|AsyncFunction|GeneratorFunction|require|createRequire|globalThis|global|process|module|Module)\b/
const REEXPORT_BYPASS_PATTERN =
  /\bexport(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*[{\*]/

function authoringError(message, code, details = {}) {
  return Object.assign(new Error(message), {
    name: code === 'FLIGHT_SIM_OFFLINE_AUTHORING_OPERATION_BLOCKED'
      ? 'FlightSimOfflineAuthoringBlockedError'
      : 'FlightSimOfflineAuthorAuthorityError',
    code,
    beforeCommit: true,
    ...details,
  })
}

function collectStaticImports(source) {
  return source
    .split(/\r?\n/)
    .filter(line => /\bimport\b/.test(line))
    .map(line => (
      line.trim() === CANONICAL_STATIC_IMPORT
        ? 'node:crypto'
        : `non-canonical:${line.trim()}`
    ))
}

export function assertFlightSimOfflineAuthorSource({
  authorExport,
  authorModuleUrl,
  source,
}) {
  if (
    String(authorModuleUrl) !== FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL.href
    || authorExport !== FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT
  ) {
    throw authoringError(
      'Flight Sim offline authoring rejected a non-canonical author authority',
      'FLIGHT_SIM_OFFLINE_AUTHOR_AUTHORITY_VIOLATION',
    )
  }
  for (const contract of SOURCE_BLOCKS) {
    if (!contract.pattern.test(source)) continue
    throw authoringError(
      `Flight Sim offline authoring blocked disallowed operation before commit: ${contract.operation}`,
      'FLIGHT_SIM_OFFLINE_AUTHORING_OPERATION_BLOCKED',
      { operation: contract.operation },
    )
  }
  const imports = collectStaticImports(source)
  if (
    JSON.stringify(imports) !== JSON.stringify(['node:crypto'])
    || AUTHORITY_BYPASS_PATTERN.test(source)
    || REEXPORT_BYPASS_PATTERN.test(source)
  ) {
    throw authoringError(
      'Flight Sim offline authoring rejected an unaudited import or dynamic execution seam',
      'FLIGHT_SIM_OFFLINE_AUTHOR_AUTHORITY_VIOLATION',
    )
  }
}
