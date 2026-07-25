import assert from 'node:assert/strict'
import {
  existsSync,
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

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDirectory, '../../../..')

test('responsibility flow generation is complete, traceable, and deterministic', () => {
  const first = buildSettingsFlowArtifacts(repoRoot)
  const second = buildSettingsFlowArtifacts(repoRoot)
  const expectedPaths = [
    'docs/knowgrph-codebase-responsibility-flow.md',
    'canvas/public/settings-flow.json',
    'canvas/src/features/settings/settings-flow.schema.json',
  ]

  assert.deepEqual(first.artifacts.map(artifact => artifact.relativePath), expectedPaths)
  assert.deepEqual(
    first.artifacts.map(artifact => artifact.content),
    second.artifacts.map(artifact => artifact.content),
  )
  assert.equal(first.artifacts[1]?.content, first.artifacts[2]?.content)

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

  const markdown = first.artifacts[0]?.content ?? ''
  assert.doesNotMatch(markdown, /<(?:img|script|iframe)\b[^>]+\bsrc\s*=/i)
  assert.doesNotMatch(markdown, /\bhttps?:\/\//i)
  assert.equal(markdown.split('\n').length <= 600, true)
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
    findStaleSettingsFlowArtifacts(artifacts),
    ['stale.json', 'missing.json'],
  )
  assert.deepEqual(readFileSync(stalePath), staleBytesBefore)
  assert.equal(statSync(stalePath).mtimeMs, staleModifiedBefore)
  assert.equal(existsSync(missingPath), false)
})
