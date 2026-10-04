import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { captureEvidenceSource, isEvidenceSourceCurrent, validateEvidenceConfiguration } from '../evidenceSource'
import { JsonDetails, VolumeResult, ReplayResult, RecordResult } from './EvidenceResults'
import EvidencePanel from '../EvidencePanel'
import { dispatchEvidence, executeEvidence } from '../tools/executeEvidence.mjs'

const config = {
  schema: 'evidence-workspace/v1', title: 'Evidence example', description: 'Authored study data.',
  profiles: { record: 'aviation-v1', volume: 'volume-v1', arrival: 'arrival-v1', route: 'route-v1' },
  policies: { volume: 'volume-view', arrival: 'arrival-policy', route: 'route-policy', notice: 'notice-policy' },
  examples: [{ id: 'fixture', label: 'Synthetic source', kind: 'record', paths: ['/evidence-analysis/fixtures/aviation-synthetic-v1.json'] }],
}
const documentName = '/study.md', documentText = `---\nevidence_workspace: ${JSON.stringify(config)}\n---\n# Study\n`
function installSource(text = documentText, revision = 1, name = documentName) {
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: text, sourceFiles: [
    { id: 'evidence-ui-source', name, text, enabled: true, status: 'parsed', parsedGraphRevision: revision, source: { kind: 'local', path: name } },
  ] } as never)
}
function saveSource() {
  const { markdownDocumentName, markdownDocumentText, sourceFiles } = useGraphStore.getState()
  return () => useGraphStore.setState({ markdownDocumentName, markdownDocumentText, sourceFiles })
}
async function settle(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate() && Date.now() < deadline) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  assert.ok(predicate(), 'UI operation completed within the bounded test wait')
}
test('authored configuration is isolated and rejects hidden fields, duplicate examples and remote assets', () => {
  const input = structuredClone(config), accepted = validateEvidenceConfiguration(input)
  input.examples[0].label = 'changed'
  assert.equal(accepted.examples[0].label, 'Synthetic source'); assert.ok(Object.isFrozen(accepted.examples[0].paths))
  assert.throws(() => validateEvidenceConfiguration({ ...config, fallback: true }), /unsupported/)
  assert.throws(() => validateEvidenceConfiguration({ ...config, examples: [config.examples[0], config.examples[0]] }), /unique IDs/)
  assert.throws(() => validateEvidenceConfiguration({ ...config, examples: [{ ...config.examples[0], paths: ['https://external.invalid/data.json'] }] }), /local fixture/)
})
test('source captures fence exact text, SourceFile identity, parsed revision and enabled state', () => {
  const restore = saveSource()
  try {
    installSource(); const captured = captureEvidenceSource(); assert.equal(isEvidenceSourceCurrent(captured), true)
    installSource(documentText, 2); assert.equal(isEvidenceSourceCurrent(captured), false)
    installSource(); useGraphStore.setState({ markdownDocumentText: documentText + 'draft' }); assert.throws(captureEvidenceSource, /exact enabled/)
    installSource(); useGraphStore.setState({ sourceFiles: useGraphStore.getState().sourceFiles.map(source => ({ ...source, enabled: false })) }); assert.equal(isEvidenceSourceCurrent(captured), false)
    assert.throws(captureEvidenceSource, /exact enabled/)
  } finally { restore() }
})
test('collapsed JSON is neither serialized nor rendered until the user opens it', async () => {
  const env = initJsdomHarness(), container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main')), root = createRoot(container)
  let serialized = 0
  const value = { toJSON() { serialized++; return { original: '<script>unsafe</script>' } } }
  try {
    await act(async () => root.render(<JsonDetails title="Original" value={value} />))
    assert.equal(serialized, 0); assert.equal(container.querySelector('pre'), null)
    await act(async () => { const details = container.querySelector('details')!; details.open = true; details.dispatchEvent(new env.dom.window.Event('toggle')) })
    assert.equal(serialized, 1); assert.match(container.querySelector('pre')!.textContent!, /<script>/); assert.equal(container.querySelector('script'), null)
    await act(async () => root.render(<JsonDetails title="Original changed" value={value} />))
    assert.equal(serialized, 1)
  } finally { await act(async () => root.unmount()); env.restore() }
})
test('typed projection retains exact SVG altitude points and replay surfaces conflicts and gaps', async () => {
  const bundle = readFileSync(new URL('../../../../public/evidence-analysis/fixtures/volume-singapore-synthetic-v1.json', import.meta.url), 'utf8')
  const volume = await dispatchEvidence('volume.project', { bundle, entityId: 'synthetic-volume-01', atUtc: '2026-10-03T10:45:00.000Z' }, config)
  assert.notEqual(volume.ok, false)
  const rendered = renderToStaticMarkup(<VolumeResult value={volume} />)
  assert.ok(rendered.includes(`cx="${volume.screen.floor[0][0]}"`)); assert.match(rendered, /data-z-metres="304.8"/); assert.match(rendered, /AMSL/)
  const replay = renderToStaticMarkup(<ReplayResult value={{ atUtc: '2026-10-03T10:45:00.000Z', fields: [{ kind: 'altitude', missing: true, stale: true, conflict: true, facts: [{ id: 'a', value: null, null_reason: 'No observation', unit: 'ft', datum: 'AMSL', source_id: 'source-a' }] }], gaps: [{ kind: 'altitude', fromUtc: 'start', toUtc: 'end', durationSeconds: 50, sourceId: 'source-a' }] }} />)
  assert.match(replay, /Missing · Stale · Conflicting evidence/); assert.match(replay, /No observation/); assert.match(replay, /50 seconds/)
})
test('inspection disclosure exposes the complete shared typed record beyond the visible fact page', async () => {
  const bundle = readFileSync(new URL('../../../../public/evidence-analysis/fixtures/aviation-singapore-multitrack-v1.json', import.meta.url), 'utf8')
  const record = await executeEvidence('aviation.inspect', { bundle, profileId: 'aviation-v1' })
  assert.notEqual(record.ok, false); assert.ok(record.facts.length > 50)
  const env = initJsdomHarness(), container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main')), root = createRoot(container)
  try {
    await act(async () => root.render(<RecordResult record={record} onSource={() => {}} disabled={false} />))
    assert.equal(container.querySelectorAll('tbody tr').length, 50)
    assert.equal(container.querySelector('pre'), null)
    const details = [...container.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Complete inspection record')!
    assert.ok(details)
    await act(async () => { details.open = true; details.dispatchEvent(new env.dom.window.Event('toggle')) })
    assert.deepEqual(JSON.parse(details.querySelector('pre')!.textContent!), record)
  } finally { await act(async () => root.unmount()); env.restore() }
})
test('a late example response cannot admit data or replace status after an authored source change', async () => {
  const restoreSource = saveSource(), env = initJsdomHarness(), container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main')), root = createRoot(container)
  const oldFetch = globalThis.fetch
  let resolveResponse!: (response: Response) => void
  globalThis.fetch = (() => new Promise<Response>(resolve => { resolveResponse = resolve })) as typeof fetch
  try {
    installSource(); await act(async () => root.render(<EvidencePanel />))
    await act(async () => [...container.querySelectorAll('button')].find(element => element.textContent === 'Load labelled example')!.click())
    assert.match(container.textContent!, /Reading local evidence/)
    await act(async () => installSource(documentText + '\nNew revision.', 2))
    await act(async () => { resolveResponse(new Response(readFileSync(new URL('../../../../public/evidence-analysis/fixtures/aviation-synthetic-v1.json', import.meta.url)))); await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(container.querySelector('[aria-label="Accepted evidence record"]'), null)
    assert.match(container.querySelector('[role="status"]')!.textContent!, /Current source configuration ready/)
  } finally { await act(async () => root.unmount()); globalThis.fetch = oldFetch; restoreSource(); env.restore() }
})
for (const change of [
  { label: 'parsed revision changes', before: documentText, after: documentText + '\nNew authored revision.', revision: 2, name: documentName, sameKey: false },
  { label: 'SourceFile is renamed with the same key', before: documentText, after: documentText, revision: 1, name: '/renamed-study.md', sameKey: true },
  // Distinct text suffixes collide under the current source-key hash; assert that precondition below.
  { label: 'exact text changes with the same key', before: documentText + '\n<!-- source-9kddw0 -->', after: documentText + '\n<!-- source-4107w2 -->', revision: 1, name: documentName, sameKey: true },
]) test(`native panel fences accepted results, exports and details when ${change.label}`, { timeout: 10000 }, async () => {
  const restoreSource = saveSource(), env = initJsdomHarness(), container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main')), root = createRoot(container)
  const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  const revoked: string[] = []
  globalThis.fetch = (async () => new Response(readFileSync(new URL('../../../../public/evidence-analysis/fixtures/aviation-synthetic-v1.json', import.meta.url)))) as typeof fetch
  URL.createObjectURL = () => 'blob:accepted-evidence'; URL.revokeObjectURL = url => { revoked.push(url) }
  const button = (label: string) => [...container.querySelectorAll('button')].find(element => element.textContent === label)!
  try {
    installSource(change.before); const captured = captureEvidenceSource()
    await act(async () => root.render(<EvidencePanel />))
    await act(async () => button('Load labelled example').click())
    await settle(() => container.textContent!.includes('Accepted result is bound'))
    await act(async () => button('Prepare verifiable export').click()); await settle(() => Boolean(container.querySelector('a[download]')))
    const sourceButton = container.querySelector<HTMLButtonElement>('[aria-label^="Inspect original source"]')!
    await act(async () => sourceButton.click()); await settle(() => container.textContent!.includes('Exact original source and reference'))
    await act(async () => installSource(change.after, change.revision, change.name))
    assert.equal(captureEvidenceSource().sourceKey === captured.sourceKey, change.sameKey)
    assert.equal(isEvidenceSourceCurrent(captured), false)
    assert.equal(container.querySelector('a[download]'), null); assert.ok(revoked.includes('blob:accepted-evidence'))
    assert.equal(container.textContent!.includes('Exact original source and reference'), false); assert.match(container.textContent!, /earlier source revision/)
    assert.ok(container.querySelector('[aria-label="Accepted evidence record"]'), 'Retain the accepted result with its stale warning.')
    assert.equal(button('Run read-only query').disabled, true)
    assert.equal(button('Prepare verifiable export').disabled, true)
    await act(async () => button('Load labelled example').click())
    await settle(() => container.textContent!.includes('Accepted result is bound'))
    assert.doesNotMatch(container.textContent!, /earlier source revision/)
    assert.equal(button('Run read-only query').disabled, false)
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; restoreSource(); env.restore()
  }
})
