const KIRO_POLICY_DOCUMENT_PATHS = Object.freeze([
  '.kiro/specs/knowgrph-game-flight-sim/requirements.md',
  '.kiro/specs/knowgrph-game-flight-sim/design.md',
])

const POLICY_DOCUMENT_PATHS = new Set([
  'docs/documents/knowgrph-game-flight-sim-prd-tad.md',
  'docs/workspace-seeds/knowgrph-game-flight-sim-demo.md',
  ...KIRO_POLICY_DOCUMENT_PATHS,
])

const EXTERNAL_LOCATOR_PATTERN = /(?:https?:\/\/|git\+|github:|gitlab:|bitbucket:)/gi
const ADMITTED_OPAQUE_ASSET_PATHS = new Set([
  'canvas/src/features/game-flight-sim/assetSpec/fallbacks/optional-beacon.glb',
])

function isFlightOwnedPath(relativePath) {
  return (
    POLICY_DOCUMENT_PATHS.has(relativePath)
    || relativePath.startsWith('.kiro/specs/knowgrph-game-flight-sim/')
    || relativePath.startsWith('canvas/src/features/game-flight-sim/')
    || relativePath.startsWith('canvas/src/lib/three/flightSim')
  )
}

function policyDocumentRetainsNoCopyBoundary(source) {
  const normalized = source.toLowerCase()
  const conceptualOnly = normalized.includes('conceptual principles only')
    || normalized.includes('concepts and architecture only')
  const provenance = normalized.includes('source-authored')
    && (normalized.includes('attest') || normalized.includes('provenance'))
  const noMention = normalized.includes('external project identity')
    && normalized.includes('url')
    && (normalized.includes('forbidden') || normalized.includes('prohibited'))
  const boundedGate = normalized.includes('cannot prove the absence of arbitrary derived code')
    || normalized.includes('unable to prove the absence of arbitrary derived code')
    || normalized.includes('does not prove the absence of arbitrary derived code')
  const noDependency = normalized.includes('no external project dependency')
    || normalized.includes('zero external-project dependency')
    || normalized.includes('zero build-time, external, or runtime dependency')
  return conceptualOnly && provenance && noMention && boundedGate && noDependency
}

function externalLocators(value) {
  return [...new Set(String(value).match(EXTERNAL_LOCATOR_PATTERN) || [])]
}

function isBinary(bytes) {
  if (bytes.includes(0)) return true
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return false
  } catch {
    return true
  }
}

export function findFlightSimBoundaryViolations(entries) {
  const violations = []
  for (const entry of entries) {
    const relativePath = String(entry.relativePath || '').replaceAll('\\', '/')
    if (!isFlightOwnedPath(relativePath)) continue
    const bytes = Buffer.isBuffer(entry.bytes)
      ? entry.bytes
      : Buffer.from(entry.bytes || entry.source || '', 'utf8')
    const source = bytes.toString('utf8')
    const locators = externalLocators(`${relativePath}\n${source}`)

    if (relativePath.includes('/vendor/')) {
      violations.push({
        relativePath,
        identifiers: ['vendor'],
        reason: 'Flight-owned path creates a vendored external-project surface',
      })
    }
    if (isBinary(bytes) && !ADMITTED_OPAQUE_ASSET_PATHS.has(relativePath)) {
      violations.push({
        relativePath,
        identifiers: ['binary'],
        reason: 'Flight-owned source or policy path contains opaque binary content',
      })
    }
    if (locators.length > 0) {
      violations.push({
        relativePath,
        identifiers: locators,
        reason: 'Flight-owned content or path contains an external repository locator',
      })
    }
    if (
      POLICY_DOCUMENT_PATHS.has(relativePath)
      && !policyDocumentRetainsNoCopyBoundary(source)
    ) {
      violations.push({
        relativePath,
        identifiers: ['policy'],
        reason: 'canonical policy file lacks the source-authored no-copy, no-mention, no-dependency boundary',
      })
    }
  }
  return violations
}

export function assertFlightSimBoundary(entries) {
  const violations = findFlightSimBoundaryViolations(entries)
  if (violations.length === 0) return
  const details = violations.map(violation => (
    `${violation.relativePath}: ${violation.reason} (${violation.identifiers.join(', ')})`
  ))
  throw new Error(
    `Flight Sim clean-room provenance boundary failed:\n${details.join('\n')}`,
  )
}
