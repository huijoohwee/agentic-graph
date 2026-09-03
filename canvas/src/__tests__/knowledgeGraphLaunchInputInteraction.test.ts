import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'

import { installSourceCatalogFetchMock } from '@/__tests__/knowledgeGraphSkillsCommandsLaunch.test'
import { ToastHost } from '@/components/ui/ToastHost'
import {
  registerMarkdownWorkspaceActionBridge,
  type WorkspaceKnowledgeGraphImportProgress,
  type WorkspaceKnowledgeGraphImportResult,
  type WorkspaceKnowledgeGraphInvocation,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LaunchDropdownImportUrlItem } from '@/lib/toolbar/LaunchDropdownImportUrlItem'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForTasks } from '@/tests/lib/reactRootHarness'

const REPOSITORY_URL = 'https://github.com/huijoohwee/agentic-graph'
const RATE_LIMITED_REPOSITORY_URL = 'https://code.example.test/organization/project'

const KNOWLEDGE_GRAPH_RESULT: WorkspaceKnowledgeGraphImportResult = {
  handled: true,
  kind: 'knowledge-graph',
  graphId: `kg:graph:${'1'.repeat(32)}`,
  snapshotDigest: 'a'.repeat(64),
  parserRegistryDigest: 'f'.repeat(64),
  complete: true,
  counts: { sources: 2, nodes: 2, edges: 1 },
  projection: {
    token: `kg:projection:${'2'.repeat(24)}`,
    readOnly: true,
    complete: true,
    truncated: false,
    limit: 1_000,
    graphData: {
      context: 'agenticgraph-knowledge-graph-projection',
      type: 'Graph',
      nodes: [
        {
          id: 'kg:codecallreference:alpha',
          label: 'layer\n    .selectAll',
          type: 'CodeCallReference',
          properties: {},
        },
        {
          id: 'kg:sourcefile:beta',
          label: 'src/index.ts',
          type: 'SourceFile',
          properties: {},
        },
      ],
      edges: [{
        id: 'kg:edge:alpha-beta',
        source: 'kg:codecallreference:alpha',
        target: 'kg:sourcefile:beta',
        label: 'declaredIn',
        properties: {
          'evidence:explanation': 'The call is declared in the source file.',
          'evidence:sourcePath': 'src/index.ts',
          'evidence:sourceDigest': 'b'.repeat(64),
          'evidence:excerptHash': 'c'.repeat(64),
          'evidence:parserId': 'local-typescript-ast',
          'evidence:parserDigest': 'd'.repeat(64),
          'evidence:ruleId': 'typescript.call.ast',
        },
      }],
    },
  },
}

const KNOWLEDGE_GRAPH_PROGRESS: WorkspaceKnowledgeGraphImportProgress = {
  schema: 'agenticgraph-knowledge-graph-import-progress/v1',
  kind: 'source-parsed',
  graphId: KNOWLEDGE_GRAPH_RESULT.graphId,
  parserRegistryDigest: KNOWLEDGE_GRAPH_RESULT.parserRegistryDigest,
  sourcePath: 'src/index.ts',
  sourceIndex: 1,
  sourceTotal: 2,
  truncated: false,
  graphData: {
    context: 'agenticgraph-knowledge-graph-projection',
    type: 'Graph',
    nodes: [KNOWLEDGE_GRAPH_RESULT.projection.graphData.nodes[0]!],
    edges: [],
  },
}

export async function testKnowledgeGraphLaunchImportUrlInputRunsVisibleCanonicalGraph() {
  const fetchMock = installSourceCatalogFetchMock()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const repositoryCalls: Array<{ url: string; invocation: WorkspaceKnowledgeGraphInvocation | undefined }> = []
  let closeCalls = 0
  let releaseImport: (() => void) | undefined
  let emitProgress: ((progress: WorkspaceKnowledgeGraphImportProgress) => void) | undefined
  const pendingImport = new Promise<WorkspaceKnowledgeGraphImportResult>(resolve => {
    releaseImport = () => resolve(KNOWLEDGE_GRAPH_RESULT)
  })
  const unregister = registerMarkdownWorkspaceActionBridge('knowledge-graph-launch-input-interaction-test', {
    knowledgeGraph: {
      importRepositoryUrl: async (url, _opts, invocation, onProgress) => {
        repositoryCalls.push({ url, invocation })
        emitProgress = onProgress
        return pendingImport
      },
    },
  })

  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setCanvas2dRenderer('storyboard')
    useGraphStore.getState().setCanvasRenderMode('3d')
    const LaunchShell = () => {
      const [open, setOpen] = React.useState(true)
      return React.createElement(React.Fragment, null,
        open
          ? React.createElement(LaunchDropdownImportUrlItem, {
              canvas2dRenderer: 'storyboard',
              menuIconClass: 'icon',
              menuItemClass: 'item',
              onClose: () => {
                closeCalls += 1
                setOpen(false)
              },
              open,
              pushUiToast: useGraphStore.getState().pushUiToast,
            })
          : null,
        React.createElement(ToastHost),
      )
    }
    await mountReactRoot(root, React.createElement(LaunchShell), {
      window: dom.window as unknown as Window,
      tasks: 1,
      frames: 1,
    })

    const disclosure = container.querySelector(
      '[data-kg-launch-import-url-skills-commands-target="skillsCommands"]',
    )
    assert.ok(disclosure instanceof dom.window.HTMLButtonElement)
    await act(async () => {
      disclosure.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForTasks(1)
    })

    const input = container.querySelector('input.kg-import-url-input')
    const confirm = container.querySelector('button.kg-import-url-confirm')
    assert.ok(input instanceof dom.window.HTMLInputElement)
    assert.ok(confirm instanceof dom.window.HTMLButtonElement)
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
    assert.ok(valueSetter)
    await act(async () => {
      valueSetter.call(input, REPOSITORY_URL)
      Simulate.change(input)
      await waitForTasks(1)
    })
    assert.equal(input.value, REPOSITORY_URL)
    assert.equal(confirm.disabled, false)
    const repositoryMode = container.querySelector(
      '[data-kg-launch-import-url-repository-mode="true"]',
    )
    assert.ok(repositoryMode instanceof dom.window.HTMLButtonElement)
    await act(async () => {
      repositoryMode.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForTasks(1)
    })
    assert.equal(repositoryMode.getAttribute('aria-pressed'), 'true')

    await act(async () => {
      confirm.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      for (let attempt = 0; attempt < 16 && repositoryCalls.length === 0; attempt += 1) {
        await waitForTasks(1)
      }
    })
    assert.equal(closeCalls, 1)
    assert.equal(confirm.isConnected, false, 'the Launch shell must close after starting the import')
    assert.equal(repositoryCalls.length, 1)
    assert.equal(repositoryCalls[0]?.url, REPOSITORY_URL)
    assert.equal(
      fetchMock.exactInvocationRequests.filter(tokens => tokens[0] === fetchMock.sourceCommand).length,
      1,
      'the panel and repository dispatch must share one source-bound MCP resolution',
    )
    assert.deepEqual(repositoryCalls[0]?.invocation, {
      schema: 'agenticgraph-knowledge-graph-invocation/v1',
      tool: 'agenticgraph.knowledge_graph.ingest',
      action: fetchMock.sourceCommand,
      semantics: [fetchMock.sourceSemantic],
      bindings: [fetchMock.sourceBinding],
      sourceRevision: fetchMock.sourceRevision,
      catalogDigest: fetchMock.catalogMetadata.catalogDigest,
      routingSchema: fetchMock.catalogMetadata.routingSchema,
      routingDigest: fetchMock.catalogMetadata.routingDigest,
    })
    const busyToast = useGraphStore.getState().uiToasts.find(
      toast => toast.id === 'launch:import:knowledge-graph-url',
    )
    assert.equal(busyToast?.kind, 'neutral')
    assert.equal(busyToast?.busy, true)
    assert.equal(busyToast?.expiresAtMs, null)
    assert.match(dom.window.document.body.textContent || '', /Parsing the repository into a local knowledge graph/)

    await act(async () => {
      emitProgress?.(KNOWLEDGE_GRAPH_PROGRESS)
      for (let attempt = 0; attempt < 16 && useGraphStore.getState().graphData.nodes.length === 0; attempt += 1) {
        await waitForTasks(1)
      }
    })
    assert.equal(useGraphStore.getState().canvasRenderMode, '2d')
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'd3')
    assert.equal(useGraphStore.getState().graphData.nodes.length, 1)
    assert.equal(
      (useGraphStore.getState().graphData.metadata?.knowledgeGraphPreview as { complete?: unknown } | undefined)?.complete,
      false,
      'the parsing-time Canvas graph must remain an explicitly incomplete preview',
    )
    assert.equal(
      useGraphStore.getState().uiToasts.find(toast => toast.id === 'launch:import:knowledge-graph-url')?.busy,
      true,
      'the progress preview must not complete the import toast',
    )

    await act(async () => {
      releaseImport?.()
      for (let attempt = 0; attempt < 16 && useGraphStore.getState().canvas2dRenderer !== 'd3'; attempt += 1) {
        await waitForTasks(1)
      }
    })
    assert.equal(useGraphStore.getState().canvasRenderMode, '2d')
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'd3')
    assert.equal(useGraphStore.getState().graphData.nodes[0]?.label, 'layer\n    .selectAll')
    const successToast = useGraphStore.getState().uiToasts.find(
      toast => toast.id === 'launch:import:knowledge-graph-url',
    )
    assert.equal(successToast?.kind, 'success')
    assert.notEqual(successToast?.busy, true)
    assert.match(successToast?.message || '', /Loaded knowledge graph in Graph view/)
    assert.match(dom.window.document.body.textContent || '', /Loaded knowledge graph in Graph view/)
  } finally {
    releaseImport?.()
    unregister()
    await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    container.remove()
    useGraphStore.getState().resetAll()
    restore()
    fetchMock.restore()
  }
}

export async function testKnowledgeGraphRepositoryProgressPreviewRollsBackOnFailure() {
  const graphBefore = useGraphStore.getState().graphData
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setCanvasRenderMode('3d')
    useGraphStore.getState().setCanvas2dRenderer('storyboard')
    const baseline = useGraphStore.getState().graphData
    let previewSeen = false
    await assert.rejects(
      runLaunchImportUrl({
        urlRaw: REPOSITORY_URL,
        forceKnowledgeGraphRepository: true,
        bridge: {
          knowledgeGraph: {
            importRepositoryUrl: async (_url, _opts, _invocation, onProgress) => {
              onProgress?.(KNOWLEDGE_GRAPH_PROGRESS)
              previewSeen = (useGraphStore.getState().graphData.metadata?.knowledgeGraphPreview as { complete?: unknown } | undefined)?.complete === false
              throw new Error('synthetic repository failure')
            },
          },
        },
        fallback: async () => undefined,
        resolveMcpInvocation: async () => ({
          invocation: {
            schema: 'agenticgraph-knowledge-graph-invocation/v1',
            tool: 'agenticgraph.knowledge_graph.ingest',
            action: '/agentic.graph.ingest',
            semantics: ['#agentic-graph', '#mcp', '#runtime-ready'],
            bindings: ['@working-directory', '@agentic-graph', '@operator', '@runtime-proof'],
            sourceRevision: 'a'.repeat(40),
            catalogDigest: 'b'.repeat(64),
            routingSchema: 'agentic-canvas-os-docs-routing/v1',
            routingDigest: 'c'.repeat(64),
          },
        }),
      }),
    )
    if (!previewSeen) throw new Error('expected the repository import to publish a parsing-time Canvas preview')
    assert.equal(useGraphStore.getState().graphData, baseline)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'storyboard')
  } finally {
    useGraphStore.getState().resetAll()
    if (graphBefore) useGraphStore.getState().setGraphData(graphBefore)
  }
}

export async function testKnowledgeGraphLaunchImportUrlOffersRateLimitedRepositoryRecovery() {
  const fetchMock = installSourceCatalogFetchMock()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const legacyImportCalls: string[] = []
  const repositoryCalls: Array<{ url: string; invocation: WorkspaceKnowledgeGraphInvocation | undefined }> = []
  let closeCalls = 0
  const unregister = registerMarkdownWorkspaceActionBridge('knowledge-graph-launch-rate-limit-recovery-test', {
    importUrl: async url => {
      legacyImportCalls.push(url)
      return {
        handled: true,
        error: 'HTTP 403: {"message":"request rate limit exceeded"}',
        recovery: { kind: 'repository-graph' },
      }
    },
    knowledgeGraph: {
      importRepositoryUrl: async (url, _opts, invocation) => {
        repositoryCalls.push({ url, invocation })
        return KNOWLEDGE_GRAPH_RESULT
      },
    },
  })

  try {
    useGraphStore.getState().resetAll()
    const LaunchShell = () => {
      const [open, setOpen] = React.useState(true)
      return React.createElement(React.Fragment, null,
        open
          ? React.createElement(LaunchDropdownImportUrlItem, {
              canvas2dRenderer: 'storyboard',
              menuIconClass: 'icon',
              menuItemClass: 'item',
              onClose: () => {
                closeCalls += 1
                setOpen(false)
              },
              open,
              pushUiToast: useGraphStore.getState().pushUiToast,
            })
          : null,
        React.createElement(ToastHost),
      )
    }
    await mountReactRoot(root, React.createElement(LaunchShell), {
      window: dom.window as unknown as Window,
      tasks: 1,
      frames: 1,
    })

    const disclosure = container.querySelector(
      '[data-kg-launch-import-url-skills-commands-target="skillsCommands"]',
    )
    assert.ok(disclosure instanceof dom.window.HTMLButtonElement)
    await act(async () => {
      disclosure.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForTasks(1)
    })
    assert.match(container.textContent || '', /Codebase graph/)

    const input = container.querySelector('input.kg-import-url-input')
    const confirm = container.querySelector('button.kg-import-url-confirm')
    assert.ok(input instanceof dom.window.HTMLInputElement)
    assert.ok(confirm instanceof dom.window.HTMLButtonElement)
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set
    assert.ok(valueSetter)
    await act(async () => {
      valueSetter.call(input, RATE_LIMITED_REPOSITORY_URL)
      Simulate.change(input)
      await waitForTasks(1)
    })

    await act(async () => {
      confirm.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      for (let attempt = 0; attempt < 16 && !container.querySelector('[data-kg-launch-import-url-rate-limit-recovery="true"]'); attempt += 1) {
        await waitForTasks(1)
      }
    })
    const recovery = container.querySelector('[data-kg-launch-import-url-rate-limit-recovery="true"]')
    const retry = container.querySelector('[data-kg-launch-import-url-retry-codebase-graph="true"]')
    assert.ok(recovery instanceof dom.window.HTMLElement)
    assert.ok(retry instanceof dom.window.HTMLButtonElement)
    assert.equal(closeCalls, 0, 'a recoverable generic import must keep the URL controls visible')
    assert.deepEqual(legacyImportCalls, [RATE_LIMITED_REPOSITORY_URL])
    assert.equal(repositoryCalls.length, 0, 'recovery must remain an explicit operator action')
    assert.match(recovery.textContent || '', /local Git acquisition/)

    await act(async () => {
      retry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      for (let attempt = 0; attempt < 16 && repositoryCalls.length === 0; attempt += 1) {
        await waitForTasks(1)
      }
    })
    assert.equal(closeCalls, 1, 'the selected codebase graph route closes the Launch menu when it starts')
    assert.deepEqual(legacyImportCalls, [RATE_LIMITED_REPOSITORY_URL], 'the generic importer must not be retried')
    assert.equal(repositoryCalls.length, 1)
    assert.equal(repositoryCalls[0]?.url, RATE_LIMITED_REPOSITORY_URL)
    assert.deepEqual(repositoryCalls[0]?.invocation, {
      schema: 'agenticgraph-knowledge-graph-invocation/v1',
      tool: 'agenticgraph.knowledge_graph.ingest',
      action: fetchMock.sourceCommand,
      semantics: [fetchMock.sourceSemantic],
      bindings: [fetchMock.sourceBinding],
      sourceRevision: fetchMock.sourceRevision,
      catalogDigest: fetchMock.catalogMetadata.catalogDigest,
      routingSchema: fetchMock.catalogMetadata.routingSchema,
      routingDigest: fetchMock.catalogMetadata.routingDigest,
    })
  } finally {
    unregister()
    await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    container.remove()
    useGraphStore.getState().resetAll()
    restore()
    fetchMock.restore()
  }
}

export async function testKnowledgeGraphRepositoryImportDedupeIsExactProofBoundAndClears() {
  const { restore } = initJsdomHarness()
  const invocation = {
    schema: 'agenticgraph-knowledge-graph-invocation/v1' as const,
    tool: 'agenticgraph.knowledge_graph.ingest',
    action: '/source.ingest',
    semantics: ['#source.graph'],
    bindings: ['@source.root'],
    sourceRevision: 'c'.repeat(40),
    catalogDigest: 'd'.repeat(64),
    routingSchema: 'agentic-canvas-os-docs-routing/v1' as const,
    routingDigest: 'e'.repeat(64),
  }
  const releases: Array<() => void> = []
  const hostInvocations: WorkspaceKnowledgeGraphInvocation[] = []
  const bridge = {
    knowledgeGraph: {
      importRepositoryUrl: async (
        _url: string,
        _opts: unknown,
        proof: WorkspaceKnowledgeGraphInvocation | undefined,
      ) => {
        assert.ok(proof)
        hostInvocations.push(proof)
        await new Promise<void>(resolve => {
          releases.push(resolve)
        })
        return KNOWLEDGE_GRAPH_RESULT
      },
    },
  }
  const run = (proof: WorkspaceKnowledgeGraphInvocation) => runLaunchImportUrl({
    urlRaw: REPOSITORY_URL,
    forceKnowledgeGraphRepository: true,
    bridge,
    fallback: async () => undefined,
    resolveMcpInvocation: async () => ({ invocation: proof }),
  })

  try {
    useGraphStore.getState().resetAll()
    const first = run(invocation)
    const joined = run({ ...invocation, semantics: [...invocation.semantics] })
    for (let attempt = 0; attempt < 16 && releases.length < 1; attempt += 1) await waitForTasks(1)
    assert.equal(hostInvocations.length, 1, 'equal source proofs must share one in-flight repository parse')

    const distinct = run({ ...invocation, catalogDigest: 'f'.repeat(64) })
    for (let attempt = 0; attempt < 16 && releases.length < 2; attempt += 1) await waitForTasks(1)
    assert.equal(hostInvocations.length, 2, 'a different source proof must not join the existing parse')
    releases.splice(0).forEach(release => release())
    await Promise.all([first, joined, distinct])

    const retry = run(invocation)
    for (let attempt = 0; attempt < 16 && releases.length < 1; attempt += 1) await waitForTasks(1)
    assert.equal(hostInvocations.length, 3, 'the exact in-flight key must clear after completion')
    releases.splice(0).forEach(release => release())
    await retry
  } finally {
    releases.splice(0).forEach(release => release())
    useGraphStore.getState().resetAll()
    restore()
  }
}
