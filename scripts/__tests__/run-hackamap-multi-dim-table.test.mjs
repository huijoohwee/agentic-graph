import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildHackamapProjection } from '../run-hackamap-multi-dim-table.mjs'

const SOURCE_DOC_LIMIT_BYTES = 480 * 1024

async function listFiles(root) {
  const files = []
  const visit = async folder => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }
  await visit(root)
  return files
}

const sourceBody = text => text.split('```text\n')[1]?.split('\n```')[0] ?? null

test('HackaMap projection exposes nested files and chunks every source below the mirror byte cap', async t => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'hackamap-projection-test-'))
  const hackamapRoot = path.join(temporaryRoot, 'hackamap')
  const overrideRoot = path.join(temporaryRoot, 'projection')
  const nestedRoot = path.join(hackamapRoot, 'site', '_generated')
  const gitMetadata = path.join(hackamapRoot, '.git', 'private')
  await mkdir(nestedRoot, { recursive: true })
  await mkdir(gitMetadata, { recursive: true })
  await writeFile(path.join(nestedRoot, 'nested.json'), '{"kept":true}\n')
  await writeFile(path.join(hackamapRoot, '.gitignore'), 'ignored build output\n')
  await writeFile(path.join(hackamapRoot, 'site', 'hackamap-ssot.md'), '# SSOT\n')
  await writeFile(path.join(hackamapRoot, 'site', 'hackamap-graph.json'), JSON.stringify({
    nodes: [
      { id: 'Demo:demo-001', type: 'Demo', label: 'Demo fixture', meta: { ref_id: 'demo-001', event_id: 'event-001', solution: 'A fixture demo' } },
      { id: 'Event:event-001', type: 'Event', label: 'Event fixture', meta: { ref_id: 'event-001' } },
    ],
    links: [{ source: 'Demo:demo-001', target: 'Event:event-001', type: 'for_event' }],
  }))
  const binary = Buffer.alloc(740 * 1024)
  for (let index = 0; index < binary.length; index += 1) binary[index] = index % 251
  await writeFile(path.join(nestedRoot, 'graph.bin'), binary)
  await writeFile(path.join(gitMetadata, 'credential.md'), 'must not enter the projection')
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))

  const codebase = {
    graphId: `kg:graph:${'a'.repeat(32)}`,
    snapshotDigest: 'b'.repeat(64),
    parserRegistryDigest: 'c'.repeat(64),
    counts: { sources: 2, nodes: 10, edges: 8 },
    complete: true,
    projectedNodes: 3,
    projectedEdges: 2,
    projectionTruncated: true,
  }
  const result = await buildHackamapProjection({ hackamapRoot, overrideRoot, indexCodebase: async ({ projectionPath }) => {
    await writeFile(projectionPath, '{"fixture":"native projection"}')
    return codebase
  } })
  const projectedFiles = await listFiles(path.join(overrideRoot, 'hackamap'))
  assert.equal(result.sourceFiles, 5)
  assert.equal(result.sourceParts, 7)
  assert.equal(projectedFiles.length, result.sourceParts + 5)
  assert.equal(projectedFiles.some(file => file.endsWith('/hackamap/manifest.md')), true)
  assert.equal(projectedFiles.some(file => file.endsWith('/hackamap/manifest.csv')), true)
  assert.equal(projectedFiles.some(file => file.endsWith('/hackamap/manifest.graph.json')), true)
  assert.equal(projectedFiles.some(file => file.endsWith('/hackamap/codebase.graph.json')), true)
  assert.equal(projectedFiles.some(file => file.endsWith('/hackamap/codebase.md')), true)
  assert.equal(projectedFiles.some(file => file.includes('/.git/')), false)

  const index = await readFile(result.indexPath, 'utf8')
  assert.match(index, /kgCanvas2dRenderer: "d3"/)
  assert.match(index, /document_type: "hackamap-domain-manifest"/)
  assert.match(index, /hackamap_projection: "\/docs\/hackamap\/manifest.graph\.json"/)
  assert.match(index, /hackamap_node_count: 2/)
  assert.match(index, /hackamap_edge_count: 1/)
  assert.match(index, /Demos · core/)
  assert.match(index, /hackamapSourceInventory: true/)
  assert.match(index, /manifest\.csv/)
  assert.match(index, /codebase\.md/)
  const domainProjection = JSON.parse(await readFile(result.domainProjectionPath, 'utf8'))
  assert.equal(domainProjection.nodes.length, 2)
  assert.deepEqual(domainProjection.edges, [[0, 1, 0]])
  assert.ok(Buffer.byteLength(JSON.stringify(domainProjection)) < 500_000)
  const codebaseManifest = await readFile(result.codebaseIndexPath, 'utf8')
  assert.match(codebaseManifest, /document_type: "agent-graph-manifest"/)
  assert.match(codebaseManifest, /source_projection: "\/docs\/hackamap\/codebase\.graph\.json"/)
  assert.match(codebaseManifest, /graph_id: "kg:graph:a{32}"/)
  assert.match(codebaseManifest, /snapshot_digest: "b{64}"/)
  assert.match(codebaseManifest, /projection_node_count: 3/)
  assert.equal(await readFile(result.codebaseProjectionPath, 'utf8'), '{"fixture":"native projection"}')
  const inventory = await readFile(result.inventoryPath, 'utf8')
  assert.match(inventory, /site\/\_generated\/nested\.json/)
  assert.match(inventory, /\.gitignore/)
  assert.equal(inventory.split(/\r?\n/).filter(Boolean).length - 1, result.sourceFiles)
  assert.doesNotMatch(index, /\[Open\]\(/)
  const overview = await readFile(result.ssotWrapperPath, 'utf8')
  assert.match(overview, /hackamap\/manifest\.md/)
  assert.match(overview, /\| `site\/` \| 4 \| 6 \|/)
  assert.doesNotMatch(overview, /nested\.json/)

  const binaryParts = projectedFiles.filter(file => file.includes('graph.bin.source.part-')).sort()
  assert.equal(binaryParts.length, 3)
  const decoded = []
  for (const file of binaryParts) {
    const text = await readFile(file, 'utf8')
    assert.ok(Buffer.byteLength(text) < SOURCE_DOC_LIMIT_BYTES)
    assert.match(text, /hackamapSourceEncoding: base64/)
    decoded.push(Buffer.from(sourceBody(text), 'base64'))
  }
  assert.ok(Buffer.concat(decoded).equals(binary))
})
