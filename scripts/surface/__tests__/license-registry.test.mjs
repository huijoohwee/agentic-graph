import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  renderDeclaration,
  resolveLicense,
  validateLicenseRegistry,
} from '../license-registry.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const scriptPath = path.join(repositoryRoot, 'scripts/surface/license-registry.mjs')

function createLicenseRegistry() {
  return {
    schema: 'agentic-graph-license-registry/v1',
    version: '1.0.0',
    declarationFile: 'REUSE.md',
    licenses: [
      {
        licenseId: 'CC-BY-4.0',
        category: 'permissive',
        notice: 'Attribution required.',
      },
      {
        licenseId: 'Apache-2.0',
        category: 'permissive',
        notice: 'Apache License 2.0 applies.',
      },
      {
        licenseId: 'LicenseRef-airvio-no-reuse-1.0',
        category: 'no-reuse',
        notice: 'No reuse grant is provided.',
      },
      {
        licenseId: 'NONE-private',
        category: 'unlicensed-private',
        notice: 'Private and unpublished.',
      },
    ],
    classMappings: [
      {
        artifactClass: 'published-document',
        licenseId: 'CC-BY-4.0',
        category: 'permissive',
      },
      {
        artifactClass: 'machine-readable-metadata',
        licenseId: 'Apache-2.0',
        category: 'permissive',
      },
      {
        artifactClass: 'bundled-build-output',
        licenseId: 'LicenseRef-airvio-no-reuse-1.0',
        category: 'no-reuse',
      },
      {
        artifactClass: 'application-source',
        licenseId: 'NONE-private',
        category: 'unlicensed-private',
      },
    ],
  }
}

test('license registry resolves every mapped class and preserves its input', () => {
  const registry = createLicenseRegistry()
  const before = JSON.stringify(registry)
  const surfaceRegistry = {
    entries: registry.classMappings.map(mapping => ({
      artifactClass: mapping.artifactClass,
    })),
  }

  assert.deepEqual(
    validateLicenseRegistry(registry, surfaceRegistry),
    { ok: true, violations: [] },
  )
  assert.deepEqual(resolveLicense('published-document', registry), {
    licenseId: 'CC-BY-4.0',
    category: 'permissive',
  })
  assert.deepEqual(resolveLicense(registry, 'bundled-build-output'), {
    licenseId: 'LicenseRef-airvio-no-reuse-1.0',
    category: 'no-reuse',
  })
  assert.deepEqual(resolveLicense('missing-class', registry), {
    licenseId: null,
    category: null,
  })
  assert.equal(JSON.stringify(registry), before)
})

test('license validation reports missing, double-categorized, and mandatory mappings', () => {
  const registry = createLicenseRegistry()
  registry.licenses = registry.licenses.filter(license => (
    license.licenseId !== 'Apache-2.0'
  ))
  registry.classMappings.push({
    artifactClass: 'published-document',
    licenseId: 'Apache-2.0',
    category: 'permissive',
  })
  registry.classMappings.find(mapping => (
    mapping.artifactClass === 'machine-readable-metadata'
  )).licenseId = 'CC-BY-4.0'

  const result = validateLicenseRegistry(registry, {
    entries: [
      { artifactClass: 'published-document' },
      { artifactClass: 'missing-class' },
    ],
  })
  const codes = new Set(result.violations.map(violation => violation.code))

  assert.equal(result.ok, false)
  assert.ok(codes.has('MISSING_LICENSE'))
  assert.ok(codes.has('DOUBLE_CATEGORIZED_CLASS'))
  assert.ok(codes.has('MANDATORY_LICENSE'))
  assert.ok(codes.has('UNCATEGORIZED_CLASS'))
})

test('renderDeclaration is deterministic and covers exactly the recorded mappings', () => {
  const registry = createLicenseRegistry()
  const reversed = {
    ...registry,
    licenses: [...registry.licenses].reverse(),
    classMappings: [...registry.classMappings].reverse(),
  }

  const declaration = renderDeclaration(registry)
  assert.equal(declaration, renderDeclaration(reversed))
  for (const mapping of registry.classMappings) {
    assert.match(declaration, new RegExp(`\\| ${mapping.artifactClass} \\|`, 'u'))
  }
  assert.equal(declaration.endsWith('\n'), true)
})

test('license registry CLI validates a temporary fixture', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'surface-license-cli-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const registryPath = path.join(fixtureRoot, 'license-registry.json')
  await writeFile(registryPath, JSON.stringify(createLicenseRegistry()), 'utf8')

  const run = spawnSync(process.execPath, [scriptPath, registryPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })

  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.match(run.stdout, /^licenses=4 classes=4 categories=3\s*$/u)
})
