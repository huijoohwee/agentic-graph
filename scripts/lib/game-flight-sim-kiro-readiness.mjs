import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const FLIGHT_SIM_KIRO_ROOT = '.kiro/specs/agentic-graph-game-flight-sim'
export const FLIGHT_SIM_KIRO_INVENTORY = Object.freeze([
  '.config.kiro',
  'requirements.md',
  'design.md',
  'tasks.md',
])
export const FLIGHT_SIM_KIRO_TRACKED_REFERENCES = Object.freeze([
  'docs/documents/agentic-graph-agentic-entity-component-system-prd-tad.md',
  'docs/documents/agentic-graph-game-flight-sim-prd-tad.md',
  'docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md',
])

const REQUIRED_SOURCE_MARKERS = Object.freeze({
  'requirements.md': Object.freeze([
    'repository-tracked Kiro package at `.kiro/specs/agentic-graph-game-flight-sim` is the normative requirements/design source of truth',
    'are derived implementation/proof projections',
    'byte-identical local projection only, never a second authority',
    'exact fixed timestep of `1 / 60` second (approximately 16.667 milliseconds, 60 ticks per second)',
    'repository-owned deterministic offline generator',
    'fallback has no external-generator dependency',
    'External references inform conceptual principles only.',
    'external project identity and URL are forbidden in product source and runtime metadata',
    'there is no external project dependency',
    'source-authored provenance attestation remains required',
    'cannot prove the absence of arbitrary derived code',
    '### Requirement 24: Mission-based flight training and measurable outcomes',
  ]),
  'design.md': Object.freeze([
    'repository-tracked design is part of the normative `.kiro/specs/agentic-graph-game-flight-sim` source of truth',
    'are derived implementation/proof projections',
    'workspace-root Kiro copy is a byte-identical local projection only',
    '`docs/documents/agentic-graph-agentic-entity-component-system-prd-tad.md`',
    '`docs/documents/agentic-graph-game-flight-sim-prd-tad.md`',
    '`docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md`',
    'Exact fixed `1 / 60` second (approximately 16.667 ms, 60 Hz) timestep',
    '| 1 | `InputIntegrationSystem` |',
    '| 2 | `FlightModelSystem` |',
    '| 3 | `CollisionResolverSystem` |',
    '| 4 | `ObjectiveSystem` |',
    'The Agentic ECS harness emits exactly one canonical `Cost_Log` after the four systems',
    'These are required post-system owners, not journaled systems and not no-op aliases.',
    'No TRELLIS.2 or other external-generator dependency is present.',
    'cannot prove the absence of arbitrary derived code',
    '**Systems-first training.**',
  ]),
  'tasks.md': Object.freeze([
    'repository-tracked Kiro package is the normative source of truth',
    'PRD/TAD and workspace seed are derived implementation/proof projections',
    'workspace-root Kiro copy is byte-identical local projection only',
    'Run exactly four meaningful journaled systems in order',
    'repository-owned deterministic offline GLB generator',
    'Require the tracked Kiro authority inventory and hash it during Flight Sim readiness.',
    'Add mission-based training across the six existing FloatingPanel owners',
    'no exact-HEAD browser, protected integration, production, or deployment claim follows from source completion alone',
  ]),
})

function exactValues(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} must be exactly ${expected.join(', ')}; received ${actual.join(', ')}`,
    )
  }
}

function decodeUtf8(bytes, relativePath) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${relativePath} must be valid UTF-8`)
  }
}

async function assertTracked(repositoryRoot, relativePath) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--error-unmatch', '--', relativePath],
      { cwd: repositoryRoot },
    )
    if (stdout.trim() !== relativePath) throw new Error('unexpected tracked path')
  } catch {
    throw new Error(`${relativePath} must be git-tracked Kiro authority`)
  }
}

async function assertTrackedReferences(repositoryRoot) {
  for (const relativePath of FLIGHT_SIM_KIRO_TRACKED_REFERENCES) {
    try {
      const metadata = await lstat(path.join(repositoryRoot, relativePath))
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not a regular file')
    } catch {
      throw new Error(`Flight Sim Kiro authority requires tracked reference ${relativePath}`)
    }
    await assertTracked(repositoryRoot, relativePath)
  }
}

function assertRequiredMarkers(source, markers, relativePath) {
  const missing = markers.filter(marker => !source.includes(marker))
  if (missing.length > 0) {
    throw new Error(
      `${relativePath} is missing reconciled Kiro markers: ${missing.join(', ')}`,
    )
  }
}

function assertExactSystemTopology(source, relativePath) {
  const rows = [...source.matchAll(/^\|\s*(\d+)\s*\|\s*`([^`]+System)`\s*\|/gm)]
    .map(match => `${match[1]}:${match[2]}`)
  exactValues(rows, [
    '1:InputIntegrationSystem',
    '2:FlightModelSystem',
    '3:CollisionResolverSystem',
    '4:ObjectiveSystem',
  ], `${relativePath} transactional system topology`)
}

function assertConfig(source, relativePath) {
  let config
  try {
    config = JSON.parse(source)
  } catch {
    throw new Error(`${relativePath} must contain valid JSON`)
  }
  exactValues(
    Object.keys(config).sort(),
    ['specId', 'specType', 'workflowType'],
    `${relativePath} keys`,
  )
  if (
    config.specId !== 'd3ea9686-9b14-4722-b253-54ff6f6d8615'
    || config.workflowType !== 'requirements-first'
    || config.specType !== 'feature'
  ) {
    throw new Error(`${relativePath} must retain the canonical Flight Sim spec identity`)
  }
}

function hashInventory(files) {
  const authorityHash = createHash('sha256')
  for (const file of files) {
    authorityHash.update(file.path)
    authorityHash.update('\0')
    authorityHash.update(file.sha256)
    authorityHash.update('\n')
  }
  return authorityHash.digest('hex')
}

async function readKiroPackage({
  absoluteRoot,
  label,
  repositoryRoot,
  requireTracked,
  validateSource,
}) {
  const entries = await readdir(absoluteRoot, { withFileTypes: true })
  const inventory = entries.map(entry => entry.name).sort()
  exactValues(
    inventory,
    [...FLIGHT_SIM_KIRO_INVENTORY].sort(),
    `${label} inventory`,
  )

  const hashedFiles = []
  for (const basename of FLIGHT_SIM_KIRO_INVENTORY) {
    const relativePath = path.posix.join(FLIGHT_SIM_KIRO_ROOT, basename)
    const absolutePath = path.join(absoluteRoot, basename)
    const metadata = await lstat(absolutePath)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${relativePath} must be a regular non-symlink file`)
    }
    const bytes = await readFile(absolutePath)
    const source = decodeUtf8(bytes, relativePath)
    if (validateSource) {
      if (basename === '.config.kiro') assertConfig(source, relativePath)
      else assertRequiredMarkers(source, REQUIRED_SOURCE_MARKERS[basename], relativePath)
      if (basename === 'design.md') {
        assertExactSystemTopology(source, relativePath)
        if (source.split(/\r?\n/).length >= 600) {
          throw new Error(`${relativePath} must remain below the 600-line source limit`)
        }
      }
    }
    if (requireTracked) await assertTracked(repositoryRoot, relativePath)
    hashedFiles.push(Object.freeze({
      path: relativePath,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      content: bytes,
    }))
  }
  return Object.freeze({
    files: Object.freeze(hashedFiles),
    sha256: hashInventory(hashedFiles),
  })
}

async function resolveWorkspaceProjectionRoot(repositoryRoot) {
  const { stdout } = await execFileAsync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: repositoryRoot },
  )
  const commonGitDirectory = path.resolve(repositoryRoot, stdout.trim())
  const canonicalRepositoryRoot = path.dirname(commonGitDirectory)
  const externalKiroRoot = path.join(path.dirname(canonicalRepositoryRoot), '.kiro')
  try {
    const metadata = await lstat(externalKiroRoot)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('workspace-root .kiro projection owner must be a regular directory')
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  return path.join(externalKiroRoot, 'specs', 'agentic-graph-game-flight-sim')
}

function assertProjectionParity(authority, projection) {
  if (authority.sha256 !== projection.sha256) {
    throw new Error(
      `workspace-root Kiro projection hash ${projection.sha256} does not match tracked authority ${authority.sha256}`,
    )
  }
  for (let index = 0; index < authority.files.length; index += 1) {
    if (!authority.files[index].content.equals(projection.files[index].content)) {
      throw new Error(
        `workspace-root Kiro projection differs from tracked authority at ${authority.files[index].path}`,
      )
    }
  }
}

export async function assertFlightSimKiroReadiness({ repositoryRoot }) {
  await assertTrackedReferences(repositoryRoot)
  const authority = await readKiroPackage({
    absoluteRoot: path.join(repositoryRoot, FLIGHT_SIM_KIRO_ROOT),
    label: 'Flight Sim tracked Kiro authority',
    repositoryRoot,
    requireTracked: true,
    validateSource: true,
  })
  const projectionRoot = await resolveWorkspaceProjectionRoot(repositoryRoot)
  let projection = null
  if (projectionRoot) {
    projection = await readKiroPackage({
      absoluteRoot: projectionRoot,
      label: 'Flight Sim workspace-root Kiro projection',
      repositoryRoot,
      requireTracked: false,
      validateSource: false,
    })
    assertProjectionParity(authority, projection)
  }
  return Object.freeze({
    files: Object.freeze(authority.files.map(({ content: _content, ...file }) => file)),
    sha256: authority.sha256,
    projection: Object.freeze({
      checked: projection !== null,
      sha256: projection?.sha256 || null,
    }),
  })
}
