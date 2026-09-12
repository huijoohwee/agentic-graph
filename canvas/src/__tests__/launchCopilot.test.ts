import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { createAgentGraphRuntime } from '../../../mcp/agent-graph/runtime.mjs'
import { readAgentGraphSnapshot, writeAgentGraphSnapshotAtomic, listAgentGraphSourceEntries } from '../../../mcp/agent-graph/store.mjs'
import { sanitizeAgentGraphImportResult } from '../../viteAgentGraphIngestSanitizer'
import { validateAgentGraphHostResult } from '@/features/agent-graph/agentGraphHostAdapter'
import { resolveAgenticCanvasOsDocsRoot } from '../../../mcp/agentic-canvas-os-docs-runtime.js'
import { executeAgentGraphProposal } from '../../viteAgentGraphProposal'
import { buildLaunchOverlay, publishLaunchWorkspace, reopenLaunchWorkspace, updateLaunchNode, exportLaunchWorkspace, type LaunchRecord } from '@/features/agent-graph/launchCopilotWorkspace'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { invokeLaunchCopilot } from '@/features/agent-graph/launchCopilotInvocation'
import { shouldPersistWorkspaceEntryInLocalSnapshot } from '@/features/workspace-fs/workspaceFsPersisted'

test('native graph → validating Canvas client → five roles, source fence and separate overlay', async () => {
  const rootDir = path.resolve(import.meta.dirname, '../../..')
  const docs = resolveAgenticCanvasOsDocsRoot({ rootDir, env: process.env })
  const load = (name: string) => import(pathToFileURL(path.resolve(docs, '../src', name)).href)
  const [contract, { createAgenticGraphClient }] = await Promise.all([load('launch-copilot-contract.js'), load('agentic-graph-mcp-contract.js')])
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'native-lc-r3-'))
  const source = path.join(temporary, 'source'), outputRoot = path.join(temporary, 'cache')
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, 'checkout.ts'), 'export function receipt() { return "paid" }\nexport function checkout() { return receipt() }\n')
  try {
    const runtime = createAgentGraphRuntime({ agenticGraphRoot: rootDir, allowedRoots: [source], outputRoot })
    const ingest = await runtime.ingest({ rootPath: source, include: ['*.ts'], strict: true })
    assert.equal(ingest.ok, true, JSON.stringify(ingest))
    const input = { action: 'ground', cid: 'checkout-offer', requirement: 'checkout receipt', sourceRole: 'owned', graphId: ingest.graphId, snapshotDigest: ingest.snapshotDigest, nodeIds: [], edgeIds: [] }
    const context = { rootDir, outputRoot, env: { ...process.env, AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: outputRoot, AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS: source }, abortSignal: new AbortController().signal }
    const result = await executeAgentGraphProposal(input, context, contract, createAgenticGraphClient, 'a'.repeat(40))
    assert.equal(result.files.length, 5)
    assert.ok(result.evidence.nodes.length > 0)
    assert.ok(result.evidence.edges.length > 0)
    assert.ok(result.evidence.edges.every(edge => edge.evidence.excerptHash && edge.evidence.parserDigest))
    assert.equal(result.publication.status, 'not-admitted')
    assert.ok(Buffer.byteLength(result.prompt) <= 8000)
    const record = { ...result, request: input } as LaunchRecord
    const overlay = buildLaunchOverlay(record)
    assert.equal(overlay.nodes.filter(node => node.type === 'RichMediaPanel').length, 5)
    assert.ok(overlay.nodes.every(node => node.id.startsWith('lc:')))
    assert.ok(overlay.edges.every(edge => edge.properties?.['visual:dash']))
    const original = JSON.stringify(ingest.projection.graphData)
    const { restore } = initJsdomHarness()
    try {
      const projection = { ...ingest.projection.graphData, metadata: { kind: 'agent-graph', agentGraphProjection: { owner: 'agent-graph-runtime', readOnly: true, graphId: ingest.graphId, snapshotDigest: ingest.snapshotDigest } } }
      useGraphStore.setState({ graphData: projection, launchProposalOverlay: overlay })
      useGraphStore.getState().updateNode(projection.nodes[0].id, { label: 'Forbidden source edit' })
      assert.equal(useGraphStore.getState().graphData, projection)
      assert.ok(isReadOnlyAgentGraphProjection(projection))
      resetWorkspaceFsForTests()
      useGraphStore.setState({ sourceFiles: [] })
      assert.equal(listMediaOverlayNodes({ enabled: true, nodes: overlay.nodes, poolMax: 10 }).length, 5, 'native media owner recognizes five panels')
      await publishLaunchWorkspace(record)
      const ids = record.overlay!.nodes.map(node => node.id)
      updateLaunchNode(ids[0], { properties: { output: 'Reviewed PRD edit' }, x: 345 })
      const reopened = await reopenLaunchWorkspace(input.cid)
      assert.equal(reopened.files[0].text, 'Reviewed PRD edit')
      assert.equal(reopened.overlay!.nodes[0].x, 345)
      assert.equal(reopened.overlay!.nodes[0].fx, 345, 'fixed layout follows the saved position')
      assert.deepEqual(reopened.overlay!.nodes.map(node => node.id), ids)
      assert.equal(reopened.digest, '', 'edits invalidate review')
      assert.equal(await (await getWorkspaceFs()).readFileText(`/notes/proposals/${input.cid}/prd.md`), 'Reviewed PRD edit')
      const retainedEntries = (await (await getWorkspaceFs()).listEntries()).filter(entry => entry.path.includes('/proposals/') || entry.path === record.sourceWorkspacePath)
      assert.ok(retainedEntries.length >= 7 && retainedEntries.every(shouldPersistWorkspaceEntryInLocalSnapshot), 'native notes survive docs-only persistence filtering')
      await assert.rejects(() => publishLaunchWorkspace(record), /CID already exists/)
      assert.equal(useGraphStore.getState().graphData, projection, 'native workspace writes preserve source identity')
      useGraphStore.setState({ graphData: null, launchProposalOverlay: null })
      const restoredSource = await reopenLaunchWorkspace(input.cid)
      assert.deepEqual(useGraphStore.getState().graphData?.nodes.map(node => node.id), projection.nodes.map(node => node.id), 'native workspace reopens the source without ingestion')
      assert.equal(restoredSource.files[0].text, 'Reviewed PRD edit')
      assert.ok(restoredSource.overlay!.nodes[0].properties?.outputVersions, 'native document version editor is retained')
      updateLaunchNode(ids[0], { properties: { selectedOutputVersionId: 'retained-proposal' } })
      assert.notEqual((await reopenLaunchWorkspace(input.cid)).files[0].text, 'Reviewed PRD edit')
      updateLaunchNode(ids[0], { properties: { selectedOutputVersionId: '__rich-media-edited-draft__' } })
      assert.equal((await reopenLaunchWorkspace(input.cid)).files[0].text, 'Reviewed PRD edit', 'changing reviewed version preserves the edited draft')
      const createObjectURL = URL.createObjectURL, click = window.HTMLAnchorElement.prototype.click
      let archive: Blob | undefined
      try {
        URL.createObjectURL = value => { archive = value as Blob; return 'blob:launch-test' }
        window.HTMLAnchorElement.prototype.click = () => {}
        const digest = await exportLaunchWorkspace(input.cid)
        const files = (await reopenLaunchWorkspace(input.cid)).files
        const unpacked = unzipSync(new Uint8Array(await archive!.arrayBuffer()))
        assert.deepEqual(Object.keys(unpacked), files.map(file => file.path))
        for (const file of files) assert.equal(strFromU8(unpacked[file.path]), file.text)
        assert.equal(digest, createHash('sha256').update(JSON.stringify(files)).digest('hex'))
      } finally { URL.createObjectURL = createObjectURL; window.HTMLAnchorElement.prototype.click = click }
      // Exercise Graph's real Chat sender/response parser with a local provider stub only.
      const previousFetch = globalThis.fetch
      const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
      try {
        for (const malformed of [false, true]) {
          useGraphStore.setState({ graphData: { ...projection, metadata: { ...projection.metadata, agentGraphProjection: { ...projection.metadata.agentGraphProjection, complete: true } } }, launchProposalOverlay: null, selectedNodeIds: [], selectedEdgeIds: [], selectedGroupIds: [] })
          let grounded: typeof result, modelCalls = 0, error: string | null = null
          let messages: any[] = []
          globalThis.fetch = (async (url, init) => {
            const body = JSON.parse(String(init?.body))
            if (String(url).endsWith('/proposal')) {
              grounded = await executeAgentGraphProposal(body, context, contract, createAgenticGraphClient, 'a'.repeat(40))
              return Response.json(grounded)
            }
            assert.ok(String(url).startsWith('/__chat_proxy'), 'uses existing same-origin Chat proxy')
            modelCalls++
            assert.equal(body.model, 'gpt-test')
            assert.equal(body.max_output_tokens, 6000)
            assert.equal(body.stream, true, 'honors the native Responses streaming protocol')
            assert.ok(!body.tools)
            const text = malformed ? 'invalid JSON' : JSON.stringify(grounded.proposal)
            return new Response(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', model: 'gpt-test', usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } } })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
          }) as typeof fetch
          await invokeLaunchCopilot({ input: '/launch-copilot draft owned checkout receipt', chatProvider: 'openai', chatModel: 'gpt-test', chatEndpointUrl: 'https://api.openai.com/v1/responses', chatAuthMode: 'serverManaged', chatApiKey: null, chatStorageTarget: 'chat', abortRef: { current: null }, setErrorText: (value: any) => { error = value }, setIsLoading: () => {}, setInput: () => {}, setConnectivity: () => {}, setConnectivityDetail: () => {}, setMessages: (update: any) => { messages = update(messages) } } as any)
          assert.equal(error, null)
          assert.equal(modelCalls, 1, 'no automatic retry or alternate provider')
          assert.match(messages.at(-1)?.content || '', malformed ? /AI drafting unverified.*labelled editable outline/s : /Drafted with the current Chat connection/)
        }
      } finally {
        globalThis.fetch = previousFetch
        if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator)
        else Reflect.deleteProperty(globalThis, 'navigator')
      }
    } finally { restore() }
    assert.equal(JSON.stringify(ingest.projection.graphData), original)
    await assert.rejects(() => executeAgentGraphProposal({ ...input, snapshotDigest: '0'.repeat(64) }, context, contract, createAgenticGraphClient, 'a'.repeat(40)), /snapshot changed/)
    const forged = structuredClone(result.proposal)
    forged.documents[1].claims[0] = { text: 'Existing payment', nodeIds: ['invented'] }
    await assert.rejects(() => executeAgentGraphProposal({ ...input, action: 'validate', proposal: forged }, context, contract, createAgenticGraphClient, 'a'.repeat(40)), /unknown/)
    const cancelled = new AbortController(); cancelled.abort()
    await assert.rejects(() => executeAgentGraphProposal(input, { ...context, abortSignal: cancelled.signal }, contract, createAgenticGraphClient, 'a'.repeat(40)))
    const pointer = path.join(outputRoot, 'graphs', `${ingest.graphId.slice(9)}.json`), options = { allowedRoot: outputRoot }
    const snapshot = await readAgentGraphSnapshot(pointer, options)
    const acquisition = { mode: 'repository-url', repositoryUrl: 'https://github.com/example/fixture', commitSha: 'b'.repeat(40), subpath: '' }
    const payload = { ...snapshot.manifest, sourceEntries: await listAgentGraphSourceEntries(snapshot), derivedEdgesByRepository: new Map(), acquisition }
    const first = await writeAgentGraphSnapshotAtomic(pointer, payload, options)
    const cached = await writeAgentGraphSnapshotAtomic(pointer, { ...payload, acquisition: { ...acquisition, cacheReused: true, networkRequests: 0 } }, options)
    assert.equal(first.pointer.snapshotDigest, cached.pointer.snapshotDigest, 'cache counters do not change source identity')
    assert.deepEqual((await readAgentGraphSnapshot(pointer, options)).manifest.acquisition, acquisition)
    const retained = validateAgentGraphHostResult(sanitizeAgentGraphImportResult({ ...ingest, acquisition }, { fail: (_code, message) => { throw new Error(message) } }))
    assert.deepEqual(retained.acquisition, acquisition, 'native sanitizer and browser retain the resolved identity')
    const committed = await executeAgentGraphProposal({ ...input, snapshotDigest: first.pointer.snapshotDigest }, context, contract, createAgenticGraphClient, 'a'.repeat(40))
    assert.equal(committed.evidence.sourceCommit, acquisition.commitSha)
    assert.ok(committed.files.every(file => file.text.includes(`Acquisition commit: ${acquisition.commitSha}`)))
    const changed = await writeAgentGraphSnapshotAtomic(pointer, { ...payload, acquisition: { ...acquisition, commitSha: 'c'.repeat(40) } }, options)
    assert.notEqual(changed.pointer.snapshotDigest, first.pointer.snapshotDigest, 'a different acquired commit invalidates the snapshot even with equal source bytes')
    await assert.rejects(() => executeAgentGraphProposal({ ...input, snapshotDigest: first.pointer.snapshotDigest }, context, contract, createAgenticGraphClient, 'a'.repeat(40)), /snapshot changed/)
    await assert.rejects(() => writeAgentGraphSnapshotAtomic(pointer, { ...payload, acquisition: { ...acquisition, repositoryUrl: 'https://secret@example.com/repo' } }, options), /Invalid retained/)
    assert.equal((await readAgentGraphSnapshot(pointer, options)).pointer.snapshotDigest, changed.pointer.snapshotDigest, 'invalid acquisition preserves the previous pointer')
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
})
