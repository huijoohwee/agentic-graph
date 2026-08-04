import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  ALLOWED_REFERENCE_DOCUMENTS,
  findTheatreModuleImports,
  inspectVideoEditorIndependenceSourceContract,
  normalizeRepositoryPath,
  OFFICIAL_REFERENCE_STANZA,
  OFFICIAL_REFERENCE_URL,
  verifyVideoEditorIndependenceSourceContract,
  VideoEditorSourceContractError,
} from '../video-editor/clean-room-source-contract.mjs'
import { runVideoEditorSourceSmoke } from '../run-video-editor-source-smoke.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const AUTHORED_VIDEO_EDITOR_PATHS = Object.freeze([
  'canvas/src/components/timeline/__tests__/videoSequenceExportRecorderLifecycle.test.ts',
  'canvas/src/components/timeline/videoSequenceExport.ts',
  'canvas/src/components/timeline/videoSequenceExportSession.ts',
  'canvas/src/components/timeline/videoSequenceExportTypes.ts',
  'canvas/src/components/timeline/videoSequenceRecorderLifecycle.ts',
  'canvas/src/components/timeline/videoSequenceSegmentPlayback.ts',
  'canvas/src/features/gitgraph/__tests__/ganttTimelineTransportCommandAdapter.test.ts',
  'canvas/src/features/gitgraph/ganttTimelineTransportCommandAdapter.ts',
  'canvas/src/features/gitgraph/useGanttTimelineTransportCommandModel.ts',
])

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'knowgrph-video-editor-boundary-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  for (const relPath of ALLOWED_REFERENCE_DOCUMENTS) {
    await writeFixture(root, relPath, `${OFFICIAL_REFERENCE_STANZA}\n`)
  }
  return root
}

async function writeFixture(root, relPath, source) {
  const absPath = path.join(root, relPath)
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, source, 'utf8')
}

test('repository path normalization is platform-neutral and rejects root escapes', () => {
  assert.equal(normalizeRepositoryPath('.\\canvas\\src\\editor.ts'), 'canvas/src/editor.ts')
  assert.equal(normalizeRepositoryPath('./canvas//src/../src/editor.ts'), 'canvas/src/editor.ts')
  assert.throws(() => normalizeRepositoryPath('../outside.ts'), /escapes its root/)
  assert.throws(() => normalizeRepositoryPath('/outside.ts'), /must be relative/)
  assert.throws(() => normalizeRepositoryPath('C:\\outside.ts'), /must be relative/)
})

test('authored video-editor owners remain inside the workflow file budget', async () => {
  for (const relPath of AUTHORED_VIDEO_EDITOR_PATHS) {
    const source = await readFile(path.join(repositoryRoot, relPath), 'utf8')
    const lineCount = source.split(/\r?\n/u).length
    assert.ok(lineCount <= 600, `${relPath} exceeds the 600-line authored-file budget`)
  }
})

test('module import scanner rejects Theatre packages without treating prose as imports', () => {
  const forbiddenSource = [
    "import studio from '@theatre/studio'",
    "export { core } from '@theatre/core'",
    "const legacy = require('theatre.js')",
    "const deferred = import('@theatre\\u002fcore')",
  ].join('\n')
  assert.deepEqual(findTheatreModuleImports(forbiddenSource), [
    '@theatre/core',
    '@theatre/studio',
    '@theatre\\u002fcore',
    'theatre.js',
  ])
  assert.deepEqual(findTheatreModuleImports([
    "const venue = 'Esplanade — Theatres on the Bay'",
    "const policyMarker = \"from '@theatre\"",
    "// import('@theatre/core')",
  ].join('\n')), [])
})

test('module scanner rejects static backtick Theatre imports and requires', () => {
  assert.deepEqual(findTheatreModuleImports([
    'const core = import(`@theatre/core`)',
    'const studio = require(`theatre.js`)',
    'const dynamic = import(`@theatre/${name}`)',
  ].join('\n')), [
    '@theatre/core',
    'theatre.js',
  ])
})

test('module scanner rejects Theatre URL imports and fetch loading', () => {
  assert.deepEqual(findTheatreModuleImports([
    "const core = import('https://esm.sh/@theatre/core')",
    'const studio = fetch(`https://cdn.example.invalid/theatre.js`)',
    "importScripts('https://cdn.example.invalid/@theatre/studio')",
  ].join('\n')), [
    'https://cdn.example.invalid/@theatre/studio',
    'https://cdn.example.invalid/theatre.js',
    'https://esm.sh/@theatre/core',
  ])
})

test('the approved decision document requires one exact attribution stanza', async t => {
  const root = await createFixture(t)
  assert.equal((await verifyVideoEditorIndependenceSourceContract(root)).status, 'pass')

  await writeFixture(
    root,
    ALLOWED_REFERENCE_DOCUMENTS[0],
    `${OFFICIAL_REFERENCE_STANZA}\n${OFFICIAL_REFERENCE_STANZA}\n`,
  )
  assert.deepEqual(
    (await inspectVideoEditorIndependenceSourceContract(root)).violations.map(
      violation => violation.code,
    ),
    ['opencut-attribution-stanza-mismatch'],
  )

  await writeFixture(
    root,
    ALLOWED_REFERENCE_DOCUMENTS[0],
    'Design reference only: https://opencut.app/docs\n',
  )
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.equal(report.status, 'fail')
  assert.ok(report.violations.some(violation => violation.code === 'opencut-attribution-stanza-mismatch'))
  assert.ok(report.violations.some(violation => violation.code === 'opencut-reference-outside-attribution-stanza'))
  assert.ok(report.violations.some(violation => violation.code === 'opencut-noncanonical-reference-endpoint'))
  assert.ok(report.violations.some(violation => violation.code === 'opencut-noncanonical-reference-url'))

  await writeFixture(
    root,
    ALLOWED_REFERENCE_DOCUMENTS[0],
    `${OFFICIAL_REFERENCE_STANZA}\nOpenCut copied prose is not an attribution stanza.\n`,
  )
  assert.ok((await inspectVideoEditorIndependenceSourceContract(root)).violations.some(
    violation => violation.code === 'opencut-reference-outside-attribution-stanza',
  ))
})

test('design-reference citations outside the approved decision document fail closed', async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'docs/another-adr.md', `${OFFICIAL_REFERENCE_URL}\n`)
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.deepEqual(report.violations.map(violation => violation.code), [
    'opencut-document-reference-outside-allowlist',
  ])
})

test('manifests, lockfiles, sources, tests, configs, assets, and paths reject external lineage', async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'package.json', '{"dependencies":{"external":"github:opencut-app/opencut"}}')
  await writeFixture(root, 'nested/pnpm-lock.yaml', 'external: https://opencut.app/archive.tgz')
  await writeFixture(root, 'canvas/src/editor.ts', "const externalEditor = 'OpenCut'")
  await writeFixture(root, 'canvas/src/__tests__/editor.test.ts', "const externalEditor = 'opencut'")
  await writeFixture(root, 'config/editor.json', '{"editor":"opencut"}')
  await writeFixture(root, 'canvas/public/assets/editor.svg', '<svg><title>OpenCut</title></svg>')
  await writeFixture(root, 'canvas/src/opencut-adapter/neutral.ts', 'export const local = true')
  await writeFixture(root, 'canvas/src/lib/vendor/opencut-runtime.ts', 'export const copied = true')

  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.equal(report.status, 'fail')
  assert.ok(report.violations.some(violation => violation.code === 'opencut-dependency-reference'))
  assert.ok(report.violations.some(violation => violation.code === 'opencut-source-reference'))
  assert.ok(report.violations.some(violation => violation.code === 'opencut-identifier-in-path'))
  await assert.rejects(
    verifyVideoEditorIndependenceSourceContract(root),
    error => error instanceof VideoEditorSourceContractError && error.report.status === 'fail',
  )
})

test('top-level vendor content is inspected instead of skipped', async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'vendor/video-editor/runtime.ts', "export const lineage = 'OpenCut'")
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.ok(report.violations.some(violation => (
    violation.code === 'opencut-source-reference'
    && violation.path === 'vendor/video-editor/runtime.ts'
  )))
})

test('non-JavaScript source and executable build files are content-inspected', async t => {
  const root = await createFixture(t)
  const sourcePaths = [
    'Dockerfile',
    'Makefile',
    'native/editor.swift',
    'scripts/editor.py',
    'scripts/editor.sh',
  ]
  for (const relPath of sourcePaths) {
    await writeFixture(root, relPath, '# forbidden external editor: OpenCut\n')
  }
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.deepEqual(
    report.violations
      .filter(violation => violation.code === 'opencut-source-reference')
      .map(violation => violation.path),
    [...sourcePaths].sort((left, right) => left.localeCompare(right)),
  )
})

test('dist, build, out, and generated artifact roots are inspected', async t => {
  const root = await createFixture(t)
  const generatedPaths = [
    '.next/server/editor.js',
    'build/editor.js',
    'coverage/editor.js',
    'dist/editor.js',
    'out/editor.js',
  ]
  for (const relPath of generatedPaths) {
    await writeFixture(root, relPath, "const externalEditor = 'OpenCut'")
  }
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.deepEqual(
    report.violations
      .filter(violation => violation.code === 'opencut-source-reference')
      .map(violation => violation.path),
    [...generatedPaths].sort((left, right) => left.localeCompare(right)),
  )
})

test('non-cache symlinks fail closed without being followed', {
  skip: process.platform === 'win32',
}, async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'canvas/src/editor.ts', 'export const local = true')
  await symlink('editor.ts', path.join(root, 'canvas/src/editor-link.ts'))
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.ok(report.violations.some(violation => (
    violation.code === 'repository-symlink-forbidden'
    && violation.path === 'canvas/src/editor-link.ts'
  )))
})

test('escaped dependency identities fail after JSON and JavaScript escape decoding', async t => {
  const root = await createFixture(t)
  await writeFixture(
    root,
    'package.json',
    '{"dependencies":{"external":"github:\\u006fpen-cut-app/opencut","@the\\u0061tre/core":"1.0.0"}}',
  )
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.ok(report.violations.some(violation => violation.code === 'opencut-dependency-reference'))
  assert.ok(report.violations.some(violation => violation.code === 'theatre-dependency-reference'))
})

test('static template Theatre imports fail the repository scan', async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'canvas/src/editor.ts', 'export const runtime = import(`@theatre/core`)')
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.ok(report.violations.some(violation => violation.code === 'theatre-runtime-import'))
})

test('Theatre URL imports and fetch loading fail the repository scan', async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'canvas/src/editor.ts', [
    "export const core = import('https://esm.sh/@theatre/core')",
    'export const studio = fetch(`https://cdn.example.invalid/theatre.js`)',
    "importScripts('https://workers.example.invalid/@theatre/core')",
  ].join('\n'))
  await writeFixture(
    root,
    'canvas/index.html',
    ['<scr', 'ipt type="module" src="https://unpkg.example.invalid/theatre.js"></script>'].join(''),
  )
  await writeFixture(
    root,
    'canvas/src/legacy-editor.vue',
    ['<scr', 'ipt src=https://unpkg.example.invalid/@theatre/core></script>'].join(''),
  )
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.deepEqual(
    report.violations
      .filter(violation => violation.code === 'theatre-runtime-import')
      .map(violation => violation.path),
    ['canvas/index.html', 'canvas/src/editor.ts', 'canvas/src/legacy-editor.vue'],
  )
})

test('policy implementation files cannot use their attribution data as a runtime endpoint', async t => {
  const root = await createFixture(t)
  await writeFixture(
    root,
    'scripts/video-editor/clean-room-source-contract.mjs',
    `export const forbidden = fetch('${OFFICIAL_REFERENCE_URL}')\n`,
  )
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.ok(report.violations.some(violation => violation.code === 'opencut-runtime-reference'))
})

test('Swift, Bun, Pod, Gradle, and Maven dependency files are scanned', async t => {
  const root = await createFixture(t)
  const dependencyPaths = [
    'Package.resolved',
    'bun.lockb',
    'ios/Podfile',
    'mobile/build.gradle.kts',
    'server/pom.xml',
  ]
  for (const relPath of dependencyPaths) {
    await writeFixture(root, relPath, 'dependency = "github:opencut-app/opencut"')
  }
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.deepEqual(
    report.violations
      .filter(violation => violation.code === 'opencut-dependency-reference')
      .map(violation => violation.path),
    [...dependencyPaths].sort((left, right) => left.localeCompare(right)),
  )
})

test('Theatre dependency declarations and runtime imports fail while venue names remain valid', async t => {
  const root = await createFixture(t)
  await writeFixture(root, 'package.json', '{"dependencies":{"@theatre/core":"1.0.0"}}')
  await writeFixture(root, 'canvas/src/editor.ts', "import core from '@theatre/core'")
  await writeFixture(
    root,
    'canvas/src/venue.ts',
    "export const venue = 'Esplanade — Theatres on the Bay'",
  )
  const report = await inspectVideoEditorIndependenceSourceContract(root)
  assert.deepEqual(report.violations.map(violation => violation.code), [
    'theatre-runtime-import',
    'theatre-dependency-reference',
  ])
})

test('source smoke returns a structured, network-free repository contract', async () => {
  const report = await runVideoEditorSourceSmoke({ repositoryRoot })
  assert.equal(report.schema, 'knowgrph-video-editor-source-smoke/v1')
  assert.equal(report.status, 'pass')
  assert.equal(report.checks[0].schema, 'knowgrph-video-editor-independence-source-contract/v1')
  assert.equal(
    report.checks[0].policy.binaryContentInspection,
    'path-only; provenance requires independent review',
  )
  assert.equal(report.checks[0].policy.copiedSource, 'forbidden')
  assert.equal(report.checks[0].policy.externalNetworkAccess, 'forbidden')
  assert.equal(report.checks[0].policy.externalRuntimeDependency, 'forbidden')
  assert.ok(report.checks[0].inspected.dependencyFiles > 0)
  assert.ok(report.checks[0].inspected.sourceFiles > 0)
  const contractSource = await readFile(
    path.join(repositoryRoot, 'scripts/video-editor/clean-room-source-contract.mjs'),
    'utf8',
  )
  assert.doesNotMatch(
    contractSource,
    /(?:node:https?|fetch\s*\(|XMLHttpRequest|WebSocket)/u,
  )
})
