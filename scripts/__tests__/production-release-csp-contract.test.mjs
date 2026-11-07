import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  AGENTIC_GRAPH_CSP,
  assertAgenticGraphCsp,
  digestBytes,
  validateTransportEvidence,
} from '../verify-production-release-transports.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const releaseWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8')
const productionReleaseTransportScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'verify-production-release-transports.mjs'), 'utf8')

test('production transport readback requires the exact enforced Graph CSP', () => {
  assert.equal(assertAgenticGraphCsp(new Headers({ 'content-security-policy': AGENTIC_GRAPH_CSP })), AGENTIC_GRAPH_CSP)
  assert.throws(() => assertAgenticGraphCsp(new Headers({ 'content-security-policy': "default-src 'none'" })), /agentic-graph response CSP drifted/)
  assert.throws(() => assertAgenticGraphCsp(new Headers()), /agentic-graph response CSP drifted/)
})

test('transport evidence binds CSP to the app route across every production surface', () => {
  const sourceRevision = 'a'.repeat(40)
  const manifestDigest = 'b'.repeat(64)
  const markerBytesDigest = digestBytes('marker-bytes')
  const marker = {
    bodyDigest: markerBytesDigest,
    sourceRevision,
    agenticCanvasOsRevision: 'c'.repeat(40),
    catalogRevision: 'c'.repeat(40),
    artifactDigest: 'd'.repeat(64),
    immutableManifestDigest: manifestDigest,
  }
  const transports = ['immutable', 'stable-pages', 'public'].map((id, index) => ({
    id,
    origin: `https://${id}-${index}.example.com`,
    smoke: { evidenceDigest: 'e'.repeat(64), checkCount: 3 },
    markers: { apex: { ...marker }, app: { ...marker } },
    routes: {
      apex: { routeOwner: 'root-agent-ready-pages', status: 200 },
      app: { routeOwner: 'agentic-graph-agent-ready-pages', status: 200, contentSecurityPolicy: AGENTIC_GRAPH_CSP },
    },
  }))
  const evidence = {
    schema: 'agentic-graph-production-transport-evidence/v1', status: 'passed', sourceRevision,
    immutableManifestDigest: manifestDigest, markerBytesParity: true, markerBytesDigest, transports,
  }
  assert.equal(validateTransportEvidence({ evidence, sourceRevision, manifestDigest }), evidence)
  const cspMismatch = structuredClone(evidence)
  cspMismatch.transports[1].routes.app.contentSecurityPolicy = "default-src 'none'"
  assert.throws(() => validateTransportEvidence({ evidence: cspMismatch, sourceRevision, manifestDigest }), /app CSP drifted/)
  assert.match(productionReleaseTransportScript, /\/\.well-known\/runtime-readiness\.json/)
  assert.match(productionReleaseTransportScript, /\/agentic-graph\/\.well-known\/runtime-readiness\.json/)
  assert.match(releaseWorkflow, /Terminal carrier file digest:[^\n]*sha256sum/)
  assert.doesNotMatch(releaseWorkflow, /\.carrierDigest/)
})
