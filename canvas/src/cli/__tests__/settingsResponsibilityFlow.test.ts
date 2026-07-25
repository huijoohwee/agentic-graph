import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { settingsRegistry } from '@/features/settings/registry'
import {
  assertUniqueSettingKeys,
  buildSettingsFlowArtifacts,
  findStaleSettingsFlowArtifacts,
  type SettingsFlowArtifact,
} from '../settings-responsibility-flow'
import {
  buildResponsibilityMarkdownArtifacts,
  RESPONSIBILITY_ROWS_PER_PART,
} from '../settingsResponsibilityMarkdown'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDirectory, '../../../..')

test('responsibility flow generation is complete, traceable, and deterministic', () => {
  const first = buildSettingsFlowArtifacts(repoRoot)
  const second = buildSettingsFlowArtifacts(repoRoot)
  const expectedPaths = [
    'docs/knowgrph-codebase-responsibility-flow.md',
    'docs/knowgrph-codebase-responsibility-flow/part-001.md',
    'docs/knowgrph-codebase-responsibility-flow/part-002.md',
    'docs/knowgrph-codebase-responsibility-flow/part-003.md',
    'canvas/public/settings-flow.json',
    'canvas/src/features/settings/settings-flow.schema.json',
  ]

  assert.deepEqual(first.artifacts.map(artifact => artifact.relativePath), expectedPaths)
  assert.deepEqual(
    first.artifacts.map(artifact => artifact.content),
    second.artifacts.map(artifact => artifact.content),
  )
  assert.equal(first.artifacts.at(-2)?.content, first.artifacts.at(-1)?.content)

  const registryKeys = settingsRegistry.map(meta => meta.key)
  const expectedKeys = [...registryKeys].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ))
  assert.equal(new Set(registryKeys).size, registryKeys.length)
  assert.deepEqual(Object.keys(first.schema), expectedKeys)

  for (const [key, row] of Object.entries(first.schema)) {
    assert.ok(row.area.trim() && row.area !== '—', `${key} must have an owned area`)
    assert.ok(row.responsibility.trim(), `${key} must have a responsibility`)
    assert.ok(row.modules.length > 0, `${key} must have a source module`)
    assert.ok(row.lineRange.trim(), `${key} must have source provenance`)
    row.modules.forEach(modulePath => {
      assert.equal(modulePath.includes('\\'), false, `${key} module paths must be POSIX paths`)
      assert.equal(path.isAbsolute(modulePath), false, `${key} module paths must be repository-relative`)
      assert.equal(existsSync(path.join(repoRoot, modulePath)), true, `${modulePath} must exist`)
    })
  }

  assert.match(
    first.schema.chatProvider?.lineRange ?? '',
    /^canvas\/src\/features\/settings\/registry-ui\.ui\.ts:L/,
  )
  assert.match(
    first.schema['operatorDeploy.mcp.endpoint']?.lineRange ?? '',
    /^canvas\/src\/features\/settings\/operatorDeploySsot\.ts:L/,
  )
  assert.equal(first.schema.byteplusImageModel?.area, 'BytePlus Image')
  assert.equal(first.schema.byteplusVideoModel?.area, 'BytePlus Video')
  assert.equal(first.schema.chatProvider?.area, 'Chat')

  const markdownArtifacts = first.artifacts.filter(artifact => artifact.relativePath.endsWith('.md'))
  markdownArtifacts.forEach(artifact => {
    assert.doesNotMatch(artifact.content, /<(?:img|script|iframe)\b[^>]+\bsrc\s*=/i)
    assert.doesNotMatch(artifact.content, /\bhttps?:\/\//i)
    assert.equal(artifact.content.split('\n').length <= 600, true, artifact.relativePath)
  })
  const markdownIndex = markdownArtifacts[0]?.content ?? ''
  assert.match(markdownIndex, /covers the 593 entries declared by `settingsRegistry`/)
  assert.match(markdownIndex, /does not claim coverage of runtime flags/)
  assert.match(markdownIndex, /\]\(knowgrph-codebase-responsibility-flow\/part-001\.md\)/)
})

test('Markdown projection remains bounded as the registry grows', () => {
  const rows = Array.from({ length: RESPONSIBILITY_ROWS_PER_PART * 5 + 1 }, (_, index) => ({
    key: `setting-${index}`,
    area: 'Synthetic',
    responsibility: 'Prove bounded output',
    modules: ['canvas/src/synthetic.ts'],
    classes: [],
    functions: [],
    imports: [],
    notes: '',
    lineRange: 'canvas/src/synthetic.ts:L1',
  }))
  const artifacts = buildResponsibilityMarkdownArtifacts(rows)

  assert.equal(artifacts.length, 7)
  artifacts.forEach(artifact => {
    assert.ok(artifact.content.split('\n').length <= 600, artifact.relativePath)
  })
})

test('duplicate registry keys fail closed before rendering', () => {
  const first = settingsRegistry[0]
  assert.ok(first)
  assert.throws(
    () => assertUniqueSettingKeys([first, first]),
    /Duplicate settings registry keys/,
  )
})

test('integration CI checks projections before any generating build', () => {
  const rootPackage = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> }
  const scripts = rootPackage.scripts ?? {}
  const integration = scripts['ci:integration'] ?? ''
  const checkCommand = 'npm run responsibility-flow:check'
  const testCommand = 'npm run test:responsibility-flow --workspace=@knowgrph/canvas'
  const mutatingCommand = 'npm run conflict:source'

  assert.match(scripts['responsibility-flow:check'] ?? '', /--check/)
  assert.match(scripts['responsibility-flow:check'] ?? '', /smoke:prepare/)
  assert.notEqual(integration.indexOf(checkCommand), -1)
  assert.notEqual(integration.indexOf(testCommand), -1)
  assert.notEqual(integration.indexOf(mutatingCommand), -1)
  assert.ok(
    integration.indexOf(checkCommand) < integration.indexOf(testCommand)
      && integration.indexOf(testCommand) < integration.indexOf(mutatingCommand),
    'the prepared stale check and focused test must run before projection generation',
  )
})

test('stale detection reports each projection without changing files', t => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'knowgrph-responsibility-flow-'))
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }))
  const currentPath = path.join(temporaryRoot, 'current.md')
  const stalePath = path.join(temporaryRoot, 'stale.json')
  const missingPath = path.join(temporaryRoot, 'missing.json')
  const partsDirectory = path.join(temporaryRoot, 'docs/knowgrph-codebase-responsibility-flow')
  const obsoletePartPath = path.join(partsDirectory, 'part-999.md')
  mkdirSync(partsDirectory, { recursive: true })
  writeFileSync(obsoletePartPath, 'obsolete\n', 'utf8')
  writeFileSync(currentPath, 'current\n', 'utf8')
  writeFileSync(stalePath, 'old\n', 'utf8')

  const artifacts: SettingsFlowArtifact[] = [
    { relativePath: 'current.md', absolutePath: currentPath, content: 'current\n' },
    { relativePath: 'stale.json', absolutePath: stalePath, content: 'new\n' },
    { relativePath: 'missing.json', absolutePath: missingPath, content: 'new\n' },
  ]
  const staleBytesBefore = readFileSync(stalePath)
  const staleModifiedBefore = statSync(stalePath).mtimeMs

  assert.deepEqual(
    findStaleSettingsFlowArtifacts(artifacts, temporaryRoot),
    ['stale.json', 'missing.json', 'docs/knowgrph-codebase-responsibility-flow/part-999.md'],
  )
  assert.deepEqual(readFileSync(stalePath), staleBytesBefore)
  assert.equal(statSync(stalePath).mtimeMs, staleModifiedBefore)
  assert.equal(existsSync(missingPath), false)
})
