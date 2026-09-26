import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import YAML from 'yaml'
import { admitGameXr, assertAnalyticsDisabled, validateGameXrPin, verifyGameXrArtifact, verifyGameXrFragments } from '../production-gamexr.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const fixture = async t => {
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gamexr-admission-')))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const sourceRoot = path.join(temp, 'source'), mirrorRoot = path.join(temp, 'mirror')
  const artifact = path.join(sourceRoot, 'dist/gamexr')
  await fs.mkdir(artifact, { recursive: true })
  await fs.mkdir(path.join(sourceRoot, 'deployment/cloudflare'), { recursive: true })
  await fs.mkdir(path.join(mirrorRoot, 'content/gamexr'), { recursive: true })
  const headers = '/gamexr/*\n  Cache-Control: no-transform\n'
  const redirects = '/gamexr/* /content/gamexr/:splat 200\n'
  const entry = { path: 'index.html', bytes: 6, sha256: hash('sealed') }
  const pin = { schema: 'agentic-graph-production-gamexr/v1', repository: 'huijoohwee/GameXR', sourceRevision: 'a'.repeat(40),
    artifactDigest: hash(`${entry.path}\0${entry.bytes}\0${entry.sha256}`), integrationRunId: 1,
    headersDigest: hash(headers), redirectsDigest: hash(redirects) }
  const manifest = { schema: 'gamexr-release-artifact/v1', application: 'GameXR', basePath: '/gamexr/', candidateStatus: 'source-bound-clean',
    sourceRevision: pin.sourceRevision, artifactDigest: pin.artifactDigest, deploymentAuthorized: false,
    source: { versionControl: 'git', head: 'resolved', worktree: 'clean', statusDigest: hash('') }, artifacts: [entry] }
  await Promise.all([
    fs.writeFile(path.join(artifact, 'index.html'), 'sealed'), fs.writeFile(path.join(artifact, 'release-manifest.json'), JSON.stringify(manifest)),
    fs.writeFile(path.join(sourceRoot, 'deployment/cloudflare/headers.fragment'), headers),
    fs.writeFile(path.join(sourceRoot, 'deployment/cloudflare/redirects.fragment'), redirects),
    fs.writeFile(path.join(mirrorRoot, '_headers'), '/sibling/*\n  Cache-Control: preserve\n\n' + headers),
    fs.writeFile(path.join(mirrorRoot, '_redirects'), '/sibling /content/sibling 200\n' + redirects),
    fs.writeFile(path.join(mirrorRoot, 'content/gamexr/stale.js'), 'obsolete'),
    fs.writeFile(path.join(mirrorRoot, 'content/sibling.html'), 'preserve'),
  ])
  return { sourceRoot, mirrorRoot, artifact, pin, manifest, headers, redirects }
}

test('admission replaces only reviewed GameXR bytes and preserves sibling/root owners', async t => {
  const f = await fixture(t)
  const headers = await fs.readFile(path.join(f.mirrorRoot, '_headers'))
  const receipt = await admitGameXr(f)
  assert.equal(receipt.artifactDigest, f.pin.artifactDigest)
  await verifyGameXrArtifact(path.join(f.mirrorRoot, 'content/gamexr'), f.pin)
  await assert.rejects(fs.stat(path.join(f.mirrorRoot, 'content/gamexr/stale.js')), { code: 'ENOENT' })
  assert.equal(await fs.readFile(path.join(f.mirrorRoot, 'content/sibling.html'), 'utf8'), 'preserve')
  assert.deepEqual(await fs.readFile(path.join(f.mirrorRoot, '_headers')), headers)
})

for (const failure of ['bytes', 'extra', 'revision', 'dirty', 'duplicate', 'traversal', 'symlink', 'headers']) {
  test(`reject ${failure} before replacing the prior artifact`, async t => {
    const f = await fixture(t)
    if (failure === 'bytes') await fs.writeFile(path.join(f.artifact, 'index.html'), 'tamper')
    if (failure === 'extra') await fs.writeFile(path.join(f.artifact, 'extra.js'), 'extra')
    if (failure === 'revision') f.manifest.sourceRevision = 'b'.repeat(40)
    if (failure === 'dirty') f.manifest.source.worktree = 'dirty'
    if (failure === 'duplicate') f.manifest.artifacts.push(f.manifest.artifacts[0])
    if (failure === 'traversal') f.manifest.artifacts[0].path = '../outside'
    if (failure === 'symlink') await fs.symlink(path.join(f.artifact, 'index.html'), path.join(f.artifact, 'link.js'))
    if (failure === 'headers') await fs.writeFile(path.join(f.mirrorRoot, '_headers'), '/gamexr/*\n  Cache-Control: transformed\n')
    await fs.writeFile(path.join(f.artifact, 'release-manifest.json'), JSON.stringify(f.manifest))
    await assert.rejects(admitGameXr(f))
    assert.equal(await fs.readFile(path.join(f.mirrorRoot, 'content/gamexr/stale.js'), 'utf8'), 'obsolete')
  })
}

test('symlinked destination cannot redirect admission outside the mirror', async t => {
  const f = await fixture(t), target = path.join(f.mirrorRoot, 'content/gamexr')
  await fs.rm(target, { recursive: true })
  await fs.symlink(f.artifact, target)
  await assert.rejects(admitGameXr(f), /plain directory/)
  assert.equal(await fs.readFile(path.join(f.artifact, 'index.html'), 'utf8'), 'sealed')
})

test('pin, fragment and analytics policy refuse unknown authority and response mutation', async t => {
  const f = await fixture(t)
  validateGameXrPin(f.pin)
  assert.throws(() => validateGameXrPin({ ...f.pin, deploymentAuthorized: true }))
  assert.throws(() => verifyGameXrFragments({ ...f, mirrorHeaders: f.headers, mirrorRedirects: f.redirects + '/GameXR /wrong 301\n' }))
  assertAnalyticsDisabled({ build_config: {} })
  assert.throws(() => assertAnalyticsDisabled({}))
  for (const field of ['web_analytics_token', 'web_analytics_tag']) assert.throws(() => assertAnalyticsDisabled({ build_config: { [field]: 'enabled' } }))
})

test('protected release seals GameXR before authorization and verifies it before publication', async () => {
  const workflow = YAML.parse(await fs.readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const steps = job => workflow.jobs[job].steps
  const at = (job, name) => { const index = steps(job).findIndex(step => step.name === name); assert.ok(index >= 0, name); return index }
  assert.ok(at('verify', 'Admit verified GameXR artifact') < at('verify', 'Create verified mirror artifact manifest'))
  assert.ok(at('verify', 'Create verified mirror artifact manifest') < at('verify', 'Run isolated browser gate before production authorization'))
  assert.equal(workflow.jobs.deploy.environment.name, 'production')
  assert.ok(at('deploy', 'Enforce sole deployment ownership') < at('deploy', 'Deploy verified artifact'))
  assert.match(steps('deploy')[at('deploy', 'Enforce sole deployment ownership')].run, /production-gamexr\.mjs settings/);
  assert.ok(at('deploy', 'Prewarm returning GameXR browser') < at('deploy', 'Deploy verified artifact'))
  assert.ok(at('deploy', 'Deploy verified artifact') < at('deploy', 'Verify GameXR artifact and returning browser'))
  assert.ok(at('deploy', 'Verify GameXR artifact and returning browser') < at('deploy', 'Record live verification receipt'))
  assert.ok(at('deploy', 'Record live verification receipt') < at('deploy', 'Publish verified production mirror'))
  const pin = validateGameXrPin(JSON.parse(await fs.readFile(new URL('../../config/production-gamexr.json', import.meta.url))))
  assert.equal(pin.sourceRevision.length, 40)
  const { productionMirrorArtifactEntries } = await import('../production-mirror-artifact-entries.mjs')
  assert.ok(productionMirrorArtifactEntries.includes('content/gamexr'))
})
