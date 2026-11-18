import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { applySheetsSync, planSheetsSync, verifySheetsRoute, SHEETS_CSP, sheetsRedirects } from '../production-sheets.mjs'
import { buildAgenticGraphRedirects } from '../production-pages-routing.mjs'
import { buildAgentReadyHeaders } from '../pages-mirror-headers.mjs'
import { productionMirrorArtifactEntries } from '../production-mirror-artifact-entries.mjs'
const sha = b => createHash('sha256').update(b).digest('hex')
const names = ['app.mjs', 'core.mjs', 'formula.mjs', 'index.html', 'LICENSE', 'LICENSE.design-system', 'manifest.webmanifest', 'schema.mjs', 'shared-ui-profile.css', 'storage.mjs', 'styles.css', 'sw.js']
async function fixture(t, assetNames = names) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sheets-release-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const sourceRoot = path.join(root, 'source'), mirrorRoot = path.join(root, 'mirror')
  await fs.mkdir(path.join(sourceRoot, 'sheets/dist'), { recursive: true })
  const bodies = new Map(assetNames.map(name => [name, Buffer.from(name)]))
  const files = [...bodies].map(([path, body]) => ({ path, bytes: body.length, sha256: sha(body) }))
  const inputs = [{ path: 'sheets/input.txt', bytes: 5, sha256: sha('input') }]
  const manifest = { schema: 'sheets/artifact/v1', contract: 'sheets/workbook/v1', sourceDigest: sha(JSON.stringify(inputs)), inputs,
    designSystem: { profileSha256: sha(bodies.get('shared-ui-profile.css')), licenseSha256: sha(bodies.get('LICENSE.design-system')) },
    files, artifactDigest: sha(JSON.stringify(files)), totalBytes: files.reduce((sum, row) => sum + row.bytes, 0) }
  bodies.set('artifact-manifest.json', Buffer.from(JSON.stringify(manifest)))
  for (const [name, body] of bodies) await fs.writeFile(path.join(sourceRoot, 'sheets/dist', name), body)
  await fs.writeFile(path.join(sourceRoot, 'sheets/input.txt'), 'input')
  const git = args => execFileSync('git', args, { cwd: sourceRoot, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
  git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Sheets Test', '-c', 'user.email=sheets@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'])
  const pin = { schema: 'agentic-graph/sheets-source/v1', repository: 'https://github.com/huijoohwee/agentic-sheets', revision: git(['rev-parse', 'HEAD']) }
  return { root, sourceRoot, mirrorRoot, pin, bodies }
}
test('immutable source, ownership, deterministic sync and tamper rejection', async t => {
  const f = await fixture(t), args = { ...f, graphRoot: f.sourceRoot }
  await assert.rejects(planSheetsSync({ ...args, pin: { ...f.pin, repository: 'https://github.com/huijoohwee/agentic-base' } }), /Invalid Sheets source pin/)
  const plan = await planSheetsSync(args)
  assert.equal(plan.artifact.route.sourceRepository, f.pin.repository)
  assert.equal(plan.toCopy.length, 14); await applySheetsSync(plan)
  assert.equal((await planSheetsSync(args)).hasDrift, false)
  await fs.writeFile(path.join(f.sourceRoot, 'sheets/dist/app.mjs'), 'dirty draft')
  assert.equal((await planSheetsSync(args)).hasDrift, false)
  await fs.writeFile(path.join(plan.targetRoot, 'user-data.json'), '{}')
  await assert.rejects(planSheetsSync(args), /Unowned/)
  await fs.rm(path.join(plan.targetRoot, 'user-data.json'))
  await fs.rm(path.join(plan.targetRoot, 'sheets-route.json'))
  await assert.rejects(planSheetsSync(args))
})
test('a panel release upgrades and rolls back the prior inventory without removing changed bytes', async t => {
  const old = await fixture(t)
  const current = await fixture(t, [...names, 'floating-panel.mjs'].sort((a, b) => a.localeCompare(b)))
  const args = source => ({ ...source, graphRoot: source.sourceRoot, mirrorRoot: old.mirrorRoot })
  await applySheetsSync(await planSheetsSync(args(old)))
  const upgrade = await planSheetsSync(args(current))
  await applySheetsSync(upgrade)
  assert.equal((await planSheetsSync(args(current))).hasDrift, false)
  const module = path.join(upgrade.targetRoot, 'floating-panel.mjs')
  const rollback = await planSheetsSync(args(old))
  await fs.writeFile(module, 'changed')
  await assert.rejects(applySheetsSync(rollback), /Changed Sheets panel asset/)
  assert.equal(await fs.readFile(module, 'utf8'), 'changed')
  await fs.writeFile(module, current.bodies.get('floating-panel.mjs'))
  await applySheetsSync(rollback)
  assert.equal((await planSheetsSync(args(old))).hasDrift, false)
  await assert.rejects(fs.stat(module), { code: 'ENOENT' })
  const unexpected = await fixture(t, [...names, 'other.mjs'])
  await assert.rejects(planSheetsSync(args(unexpected)), /Invalid Sheets artifact file inventory/)
})
test('route verifier checks every byte, MIME, CSP, worker scope and negative paths', async t => {
  const f = await fixture(t), plan = await planSheetsSync({ ...f, graphRoot: f.sourceRoot }); await applySheetsSync(plan)
  let mode = 'ok'
  const fetchImpl = async url => {
    if (url.pathname === '/agentic-sheets') return new Response(null, { status: 308, headers: { location: '/agentic-sheets/' } })
    const name = url.pathname === '/agentic-sheets/' ? 'index.html' : url.pathname.split('/').at(-1)
    const body = plan.artifact.files.get(name)
    if (!body) return new Response('missing', { status: mode === 'spa' ? 200 : 404 })
    const type = name.endsWith('.html') ? 'text/html' : /\.m?js$/.test(name) ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : /json|webmanifest/.test(name) ? 'application/json' : 'text/plain'
    return new Response(mode === 'tamper' && name === 'core.mjs' ? 'changed' : body, { headers: {
      'content-type': mode === 'mime' ? 'text/html' : type,
      'content-security-policy': mode === 'csp' ? "default-src *" : SHEETS_CSP,
      'service-worker-allowed': mode === 'scope' ? '/' : '/agentic-sheets/',
    } })
  }
  const args = { artifactRoot: plan.targetRoot, origins: ['https://preview.example/'], fetchImpl, sourceRevision: f.pin.revision }
  assert.equal((await verifySheetsRoute(args)).origins[0].files.length, 15)
  for (mode of ['tamper', 'mime', 'csp', 'scope', 'spa']) await assert.rejects(verifySheetsRoute(args))
  mode = 'ok'
  await fs.writeFile(path.join(plan.targetRoot, 'core.mjs'), 'changed')
  await assert.rejects(verifySheetsRoute(args), /drift/)
  await fs.writeFile(path.join(plan.targetRoot, 'sheets-route.json'), JSON.stringify({ ...plan.artifact.route, sourceRepository: 'wrong' }))
  await assert.rejects(verifySheetsRoute(args), /source mismatch/)
})
test('existing release owners include Sheets without SPA fallback or duplicate blocks', () => {
  const routes = buildAgenticGraphRedirects({ existing: '', rootFiles: [] })
  for (const line of sheetsRedirects) assert.ok(routes.includes(line))
  assert.equal(buildAgenticGraphRedirects({ existing: routes, rootFiles: [] }), routes)
  const args = { existing: '', artifacts: {}, agentReadyHomepageLinkHeaderValue: '', productionRuntimeReadinessHeaderLines: [] }
  const headers = buildAgentReadyHeaders(args)
  assert.ok(headers.includes('Content-Security-Policy: ' + SHEETS_CSP))
  assert.ok(headers.includes('Service-Worker-Allowed: /agentic-sheets/'))
  assert.equal(buildAgentReadyHeaders({ ...args, existing: headers }), headers)
  assert.ok(productionMirrorArtifactEntries.includes('content/agentic-sheets'))
})
