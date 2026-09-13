import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { createRoot } from 'react-dom/client'
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
import { launchHandoffBinding, launchHandoffCommitMessage, runLaunchHandoff } from '../../viteAgentGraphHandoff'
import { createExternalToolApprovalToken, authorizeExternalToolAction } from '../../../mcp/external-tool-approval.js'
import { worktrees } from 'agentic-os/compat/git'
import { buildLaunchOverlay, publishLaunchWorkspace, reopenLaunchWorkspace, updateLaunchNode, exportLaunchWorkspace, launchProbeBinding, launchProbeDecisions, retainLaunchProbeResponse, type LaunchRecord } from '@/features/agent-graph/launchCopilotWorkspace'
import { groundProbeTreeRequest } from '../../viteProbeTreeMcpBridge'
import { generateProbeOptions } from '../../../mcp/probe-tree-runtime.js'
import { normalizeProbeTreeMcpBridgeRequest } from '@/features/agent-ready/probeTreeMcpBridgeContract'
import { PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION } from '@/features/agent-ready/probeTreeContract.mjs'
import { canonicalLaunchRepositoryUrl } from '@/lib/toolbar/launchImportDispatch'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForTasks } from '@/tests/lib/reactRootHarness'
import { RichMediaOverlayLayer2d } from '@/components/GraphCanvasRoot/components/RichMediaOverlayLayer2d'
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
    const input = { action: 'ground', cid: 'checkout-offer', requirement: 'checkout receipt for a paid pilot: identify the buyer, price and delivery before building', sourceRole: 'owned', graphId: ingest.graphId, snapshotDigest: ingest.snapshotDigest, nodeIds: [], edgeIds: [] }
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
    const { dom, restore } = initJsdomHarness()
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
      const container = dom.window.document.createElement('section')
      dom.window.document.body.appendChild(container)
      const reactRoot = createRoot(container), noop = () => {}
      try {
        await mountReactRoot(reactRoot, React.createElement(RichMediaOverlayLayer2d, {
          active: true, mediaOverlayNodes: listMediaOverlayNodes({ enabled: true, nodes: record.overlay!.nodes, poolMax: 10 }),
          getOverlayRefForId: () => noop, svgRef: { current: null }, renderMediaAsNodes: false,
          stopEvent: event => event.stopPropagation(), onOverlayPanStart: noop, onOverlayPan: noop, onOverlayPanEnd: noop,
          onHeaderDragStart: noop, onHeaderDrag: noop, onHeaderDragEnd: noop,
        }), { window: dom.window, frames: 24 })
        const paragraph = [...container.querySelectorAll<HTMLElement>('p[data-start-line]')].find(element => element.textContent?.includes('Editable outline'))!
        assert.ok(paragraph, 'native canvas renders the grounded document')
        paragraph.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
        await waitForTasks(2); await waitForFrames(dom.window, 2)
        const editor = paragraph.querySelector<HTMLElement>('[contenteditable="true"]')!
        assert.ok(editor, 'canvas selection must let clicks reach the native document editor')
        editor.textContent = 'Reviewed buyer pain before technical scope.'
        editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: editor.textContent }))
        await waitForTasks(4)
        editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ctrlKey: true }))
        await waitForTasks(8); await waitForFrames(dom.window, 4)
        assert.match((await reopenLaunchWorkspace(input.cid)).files[0].text, /Reviewed buyer pain before technical scope/)
      } finally { await unmountReactRoot(reactRoot, { window: dom.window }); container.remove() }
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
      assert.equal(canonicalLaunchRepositoryUrl('https://github.com/anthropics/commerce-agents'), 'https://github.com/anthropics/commerce-agents')
      for (const url of ['https://github.com/owner/repo/blob/main/README.md', 'https://secret@github.com/owner/repo', 'https://github.com/owner/repo?token=secret']) assert.equal(canonicalLaunchRepositoryUrl(url), null)
      let probeRecord = await reopenLaunchWorkspace(input.cid)
      const probeSource = useGraphStore.getState().graphData
      let anchorId = probeRecord.overlay!.nodes[0].id
      const { buildStoryboardWidgetProbeTreeContextText } = await import('@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeContext')
      for (const depth of [1, 2]) {
        const request = { sourceBinding: launchProbeBinding(probeRecord), threadRootId: probeRecord.overlay!.nodes[0].id, currentNodeId: anchorId,
          contextText: buildStoryboardWidgetProbeTreeContextText({ graphData: probeRecord.overlay!, node: probeRecord.overlay!.nodes.find(node => node.id === anchorId)!, prompt: probeRecord.evidence.requirement }), invocationTokens: [], optionCount: 3, probeTreeDepth: depth, recallTopK: 0, tokenBudget: 1200 }
        assert.equal(normalizeProbeTreeMcpBridgeRequest({ ...request, sourceBinding: { ...request.sourceBinding, snapshotDigest: 'forged' } }), null)
        const groundedContext = await groundProbeTreeRequest(request, rootDir, context.abortSignal, context.env)
        assert.ok(groundedContext.includes('checkout.ts') && groundedContext.includes(input.snapshotDigest))
        if (depth === 2) assert.match(groundedContext, /Selected continuation answer:.*paid checkout pilot/)
        await assert.rejects(() => groundProbeTreeRequest({ ...request, sourceBinding: { ...request.sourceBinding, snapshotDigest: '0'.repeat(64) } }, rootDir, context.abortSignal, context.env), /snapshot changed/)
        const generated = await generateProbeOptions({ thread_root_id: request.threadRootId, current_node_id: request.currentNodeId, context_text: groundedContext, k: 3, probe_tree_depth: depth, recall_top_k: 0, token_budget: 1200 }, { rootDir: temporary, env: {}, fetchImpl: () => { throw new Error('Live model verification is deferred') } })
        const response = { ok: true, tool: 'agentic-graph.probe.generate', mcpInvoked: true, invocationResolutions: [], sourceBinding: request.sourceBinding, groundedContext, result: { structuredContent: generated, content: [{ type: 'text', text: JSON.stringify(generated) }] } } as const
        await assert.rejects(() => retainLaunchProbeResponse(probeRecord, { ...response, sourceBinding: { ...request.sourceBinding, cid: 'another-proposal' } } as any, anchorId), /not bound/)
        await assert.rejects(() => retainLaunchProbeResponse(probeRecord, response as any, anchorId), /exactly 2-4/)
        const provider = { model: 'test-only-openai-fixture', text: JSON.stringify({ response: { structuredContent: { contractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
          cards: [
            { id: 'checkout-buyer', question: 'Who will purchase the checkout pilot?', selectionOptions: ['Solo service founders', 'Small software teams'] },
            { id: 'receipt-channel', question: 'How should the checkout receipt reach the buyer?', selectionOptions: ['Email after purchase', 'Download from the account'] },
            { id: 'checkout-price', question: 'How should the checkout pilot be priced?', selectionOptions: ['Charge an upfront fee', 'Require a recurring subscription'] },
          ].map(card => ({ ...card, probeTreeCardVariant: 'probe-tree-type-2', rationale: 'Confirm the missing pilot decision.', evidenceNeeded: 'A buyer interview.' })),
        } } }) }
        probeRecord = await retainLaunchProbeResponse(probeRecord, response as any, anchorId, provider)
        const question = probeRecord.overlay!.nodes.find(node => node.properties.launchProbe && Number(node.properties.probeTreeDepth) === depth)!
        assert.ok(question, 'native source-bound question materialized')
        updateLaunchNode(question.id, { properties: { output: 'Validate willingness to pay with a paid checkout pilot before building.' } })
        probeRecord = await reopenLaunchWorkspace(input.cid)
        assert.match(launchProbeDecisions(probeRecord), /paid checkout pilot/)
        anchorId = question.id
        assert.equal(useGraphStore.getState().graphData, probeSource, 'Probe-Tree never mutates source')
        assert.equal(probeRecord.overlay!.nodes.filter(node => node.type === 'RichMediaPanel').length, 5)
      }
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
          const retainedBefore = await reopenLaunchWorkspace(input.cid)
          const priorFiles = JSON.stringify(retainedBefore.files)
          await invokeLaunchCopilot({ input: `/launch-copilot refine ${input.cid}`, chatProvider: 'openai', chatModel: 'gpt-test', chatEndpointUrl: 'https://api.openai.com/v1/responses', chatAuthMode: 'serverManaged', chatApiKey: null, chatStorageTarget: 'chat', abortRef: { current: null }, setErrorText: (value: any) => { error = value }, setIsLoading: () => {}, setInput: () => {}, setConnectivity: () => {}, setConnectivityDetail: () => {}, setMessages: (update: any) => { messages = update(messages) } } as any)
          const refined = await reopenLaunchWorkspace(input.cid)
          if (malformed) { assert.ok(error); assert.equal(JSON.stringify(refined.files), priorFiles, 'failed refinement preserves reviewed files'); }
          else { assert.equal(error, null); assert.ok(refined.files.every(file => file.text.includes('paid checkout pilot'))); assert.match(grounded.prompt, /User decisions from the separate Probe-Tree overlay/); }
          assert.equal(modelCalls, 2, 'each explicit refinement makes only one provider attempt')
          assert.match(launchProbeDecisions(refined), /paid checkout pilot/)
        }
        const posted: any[] = [], approval = '1'.repeat(64)
        let nextInput = '', handoffError: string | null = null
        globalThis.fetch = (async (_url, init) => {
          assert.equal(init?.signal?.aborted, false, 'native reopen does not cancel its own handoff')
          const body = JSON.parse(String(init?.body)); posted.push(body)
          assert.deepEqual(body.files, (await reopenLaunchWorkspace(input.cid)).files)
          return Response.json(body.action === 'handoff-review' ? { status: 'review-required', approval, reason: 'Inspect five files' } : { status: 'pr-open', reason: 'Provider stub only' })
        }) as typeof fetch
        const invoke = (command: string) => invokeLaunchCopilot({ input: command, abortRef: { current: null }, setErrorText: (value: any) => { handoffError = value }, setIsLoading: () => {}, setInput: (value: string) => { nextInput = value }, setMessages: () => {} } as any)
        await invoke(`/launch-copilot review ${input.cid}`)
        assert.equal(posted.length, 1, 'review never auto-approves'); assert.equal(nextInput, `/launch-copilot approve ${input.cid} ${approval}`)
        await invoke(nextInput)
        assert.equal(handoffError, null); assert.equal(posted[1].approval, approval); assert.equal(posted[1].action, 'handoff-approve')
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
    const bind = (files = committed.files, evidence = committed.evidence, base = 'd'.repeat(40)) => launchHandoffBinding(files, { ...committed, evidence }, 'github.com/huijoohwee/agentic-graph', base)
    const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
    const reviewed = digest(bind()), secret = 'test-only-approval-secret-not-used-by-the-host'
    assert.ok(launchHandoffCommitMessage('x'.repeat(80), bind(), reviewed).length <= 500, 'receipt fits the pinned OS land message limit at maximum CID length')
    const token = createExternalToolApprovalToken({ secret, actionDigest: reviewed, now: 1000 }), consumedTokenIds = new Set<string>()
    const edited = structuredClone(committed.files); edited[0].text += '\nA revised paid-pilot hypothesis.\n'
    for (const candidate of [bind(edited), bind(committed.files, { ...committed.evidence, snapshotDigest: 'e'.repeat(64) }), bind(committed.files, { ...committed.evidence, contractRevision: 'f'.repeat(40) }), bind(committed.files, committed.evidence, 'f'.repeat(40))]) {
      assert.throws(() => authorizeExternalToolAction({ secret, token, actionDigest: digest(candidate), consumedTokenIds, now: 1001 }), /does not match/)
    }
    assert.equal(consumedTokenIds.size, 0, 'rejected content, source, contract and target drift consume no authority')
    assert.throws(() => authorizeExternalToolAction({ secret, token, actionDigest: reviewed, consumedTokenIds, now: token.expiresAt }), /expired/)
    authorizeExternalToolAction({ secret, token, actionDigest: reviewed, consumedTokenIds, now: 1001 })
    assert.throws(() => authorizeExternalToolAction({ secret, token, actionDigest: reviewed, consumedTokenIds, now: 1002 }), /already been consumed/)
    for (const files of [committed.files.slice(1), [...committed.files].reverse(), committed.files.map((file, i) => i ? file : { ...file, path: '../escape.md' }), committed.files.map((file, i) => i ? file : { ...file, text: file.text.replace('snapshot_digest:', 'forged_snapshot:') }), committed.files.map(file => ({ ...file, text: file.text + '界'.repeat(24000) }))]) assert.throws(() => bind(files), /Five bounded documents/)
    const canonical = worktrees(rootDir)[0], handoffContext = { ...context, rootDir: canonical.path }
    const requiresCanonical = canonical.branch !== 'main'
    for (const files of [[], committed.files.map((file, i) => i ? file : { ...file, path: '../escape.md' })]) await assert.rejects(() => runLaunchHandoff({ action: 'handoff-approve', request: input, files }, handoffContext, contract.LAUNCH_COPILOT_ROLES), requiresCanonical ? /enrolled canonical/ : /invalid five-file/)
    await assert.rejects(() => runLaunchHandoff({ action: 'handoff-review', request: { ...input, snapshotDigest: '0'.repeat(64) }, files: committed.files }, handoffContext, contract.LAUNCH_COPILOT_ROLES), requiresCanonical ? /enrolled canonical/ : /snapshot changed/)
    await assert.rejects(() => runLaunchHandoff({ action: 'handoff-review', request: input, files: committed.files }, { ...handoffContext, abortSignal: cancelled.signal }, contract.LAUNCH_COPILOT_ROLES))
    const changed = await writeAgentGraphSnapshotAtomic(pointer, { ...payload, acquisition: { ...acquisition, commitSha: 'c'.repeat(40) } }, options)
    assert.notEqual(changed.pointer.snapshotDigest, first.pointer.snapshotDigest, 'a different acquired commit invalidates the snapshot even with equal source bytes')
    await assert.rejects(() => executeAgentGraphProposal({ ...input, snapshotDigest: first.pointer.snapshotDigest }, context, contract, createAgenticGraphClient, 'a'.repeat(40)), /snapshot changed/)
    await assert.rejects(() => writeAgentGraphSnapshotAtomic(pointer, { ...payload, acquisition: { ...acquisition, repositoryUrl: 'https://secret@example.com/repo' } }, options), /Invalid retained/)
    assert.equal((await readAgentGraphSnapshot(pointer, options)).pointer.snapshotDigest, changed.pointer.snapshotDigest, 'invalid acquisition preserves the previous pointer')
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
})
