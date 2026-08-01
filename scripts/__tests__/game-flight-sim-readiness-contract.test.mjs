import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  assertFlightSimKiroReadiness,
  FLIGHT_SIM_KIRO_ROOT,
  FLIGHT_SIM_KIRO_TRACKED_REFERENCES,
} from '../lib/game-flight-sim-kiro-readiness.mjs'

const execFileAsync = promisify(execFile)
const KIRO_FIXTURE = Object.freeze({
  '.config.kiro':
    '{"specId":"d3ea9686-9b14-4722-b253-54ff6f6d8615","workflowType":"requirements-first","specType":"feature"}\n',
  'requirements.md': [
    'repository-tracked Kiro package at `.kiro/specs/knowgrph-game-flight-sim` is the normative requirements/design source of truth',
    'PRD and seed are derived implementation/proof projections',
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
    '',
  ].join('\n'),
  'design.md': [
    'repository-tracked design is part of the normative `.kiro/specs/knowgrph-game-flight-sim` source of truth',
    'PRD/TAD and workspace seed are derived implementation/proof projections',
    'workspace-root Kiro copy is a byte-identical local projection only',
    '`docs/documents/knowgrph-agentic-entity-component-system-prd-tad.md`',
    '`docs/documents/knowgrph-game-flight-sim-prd-tad.md`',
    '`docs/workspace-seeds/knowgrph-game-flight-sim-demo.md`',
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
    '',
  ].join('\n'),
  'tasks.md': [
    'repository-tracked Kiro package is the normative source of truth',
    'PRD/TAD and workspace seed are derived implementation/proof projections',
    'workspace-root Kiro copy is byte-identical local projection only',
    'Run exactly four meaningful journaled systems in order',
    'repository-owned deterministic offline GLB generator',
    'Require the tracked Kiro authority inventory and hash it during Flight Sim readiness.',
    'Add mission-based training across the six existing FloatingPanel owners',
    'no exact-HEAD browser, protected integration, production, or deployment claim follows from source completion alone',
    '',
  ].join('\n'),
})

async function createRepository() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'flight-sim-readiness-'))
  const repositoryRoot = path.join(workspaceRoot, 'knowgrph')
  await mkdir(repositoryRoot)
  await execFileAsync('git', ['init', '--quiet'], { cwd: repositoryRoot })
  return { repositoryRoot, workspaceRoot }
}

async function write(repositoryRoot, relativePath, source) {
  const absolutePath = path.join(repositoryRoot, relativePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, source, 'utf8')
}

async function writeKiroFixture(root) {
  await Promise.all(Object.entries(KIRO_FIXTURE).map(([basename, source]) => (
    write(root, `${FLIGHT_SIM_KIRO_ROOT}/${basename}`, source)
  )))
}

test('tracked Kiro authority has one exact four-file inventory and stable hashes', async t => {
  const { repositoryRoot, workspaceRoot } = await createRepository()
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }))
  await writeKiroFixture(repositoryRoot)
  await writeKiroFixture(workspaceRoot)
  await Promise.all(FLIGHT_SIM_KIRO_TRACKED_REFERENCES.map(relativePath => (
    write(repositoryRoot, relativePath, `tracked reference: ${relativePath}\n`)
  )))
  await execFileAsync(
    'git',
    ['add', '--', FLIGHT_SIM_KIRO_ROOT, ...FLIGHT_SIM_KIRO_TRACKED_REFERENCES],
    { cwd: repositoryRoot },
  )

  const first = await assertFlightSimKiroReadiness({ repositoryRoot })
  const second = await assertFlightSimKiroReadiness({ repositoryRoot })
  assert.equal(first.files.length, 4)
  assert.match(first.sha256, /^[0-9a-f]{64}$/)
  assert.equal(first.sha256, second.sha256)
  assert.deepEqual(first.projection, {
    checked: true,
    sha256: first.sha256,
  })
  assert.deepEqual(
    first.files.map(file => file.path),
    [
      `${FLIGHT_SIM_KIRO_ROOT}/.config.kiro`,
      `${FLIGHT_SIM_KIRO_ROOT}/requirements.md`,
      `${FLIGHT_SIM_KIRO_ROOT}/design.md`,
      `${FLIGHT_SIM_KIRO_ROOT}/tasks.md`,
    ],
  )

  const missingReference = FLIGHT_SIM_KIRO_TRACKED_REFERENCES[0]
  await rm(path.join(repositoryRoot, missingReference))
  await assert.rejects(
    assertFlightSimKiroReadiness({ repositoryRoot }),
    new RegExp(`requires tracked reference ${missingReference.replaceAll('.', '\\.')}`),
  )
  await write(repositoryRoot, missingReference, `tracked reference: ${missingReference}\n`)

  await write(
    workspaceRoot,
    `${FLIGHT_SIM_KIRO_ROOT}/requirements.md`,
    `${KIRO_FIXTURE['requirements.md']}projection drift\n`,
  )
  await assert.rejects(
    assertFlightSimKiroReadiness({ repositoryRoot }),
    /projection hash .* does not match tracked authority/,
  )
})
