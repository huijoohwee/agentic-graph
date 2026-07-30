import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { buildAgenticOsTestCatalogMetadata } from '@/__tests__/helpers/agenticOsCatalogDigest'
import { AGENTIC_OS_DOCS_MCP_TOOL_NAME } from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import {
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  readSkillsCommandsMcpTarget,
  resetSkillsCommandsMcpTargetForTests,
  targetSkillsCommandsMcpInvocation,
} from '@/features/agentic-os/skillsCommandsMcpTarget'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LaunchDropdownImportUrlItem } from '@/lib/toolbar/LaunchDropdownImportUrlItem'
import { ToolbarToolMenu } from '@/lib/toolbar/ToolbarToolMenu.impl'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  mountReactRoot,
  unmountReactRoot,
  waitForTasks,
} from '@/tests/lib/reactRootHarness'

const SOURCE_REVISION = 'c'.repeat(40)
const SOURCE_COMMAND = '/source.ingest'
const SOURCE_SEMANTIC = '#source.graph'
const SOURCE_BINDING = '@source.root'
const SOURCE_CATALOG = [
  {
    token: SOURCE_COMMAND,
    kind: 'command',
    label: 'Ingest source',
    summary: 'Build the source graph.',
    sourcePath: `DICTIONARY-COMMAND.md#${SOURCE_COMMAND}`,
    mcpTool: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
    mcpTools: [
      KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
      'knowgrph.source.inspect',
    ],
    semantics: [SOURCE_SEMANTIC],
    bindings: [SOURCE_BINDING],
  },
  {
    token: '/unrelated.command',
    kind: 'command',
    label: 'Unrelated',
    summary: 'A different source-backed command.',
    sourcePath: 'DICTIONARY-COMMAND.md#/unrelated.command',
    mcpTool: 'knowgrph.unrelated.command',
    semantics: [SOURCE_SEMANTIC],
    bindings: [SOURCE_BINDING],
  },
  {
    token: SOURCE_SEMANTIC,
    kind: 'semantic',
    label: 'Source graph',
    summary: 'Use deterministic graph semantics.',
    sourcePath: `DICTIONARY-SEMANTIC.md#${SOURCE_SEMANTIC}`,
  },
  {
    token: SOURCE_BINDING,
    kind: 'binding',
    label: 'Source root',
    summary: 'Bind the selected source root.',
    sourcePath: `DICTIONARY-BINDING.md#${SOURCE_BINDING}`,
  },
]
const SOURCE_CATALOG_METADATA = buildAgenticOsTestCatalogMetadata(SOURCE_CATALOG)

function installSourceCatalogFetchMock({ includeRoutingProof = true } = {}) {
  const originalFetch = globalThis.fetch
  const exactInvocationRequests: string[][] = []
  const payloadMetadata = includeRoutingProof
    ? SOURCE_CATALOG_METADATA
    : {
        catalogDigest: SOURCE_CATALOG_METADATA.catalogDigest,
        counts: SOURCE_CATALOG_METADATA.counts,
      }
  globalThis.fetch = (async (input, init) => {
    const requestUrl = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as {
      id?: unknown
      method?: unknown
      invocationTokens?: string[]
      params?: { arguments?: { query?: unknown } }
    }
    if (requestUrl === '/__knowgrph_mcp_agentic_os_docs_invoke') {
      const tokens = Array.isArray(body.invocationTokens) ? body.invocationTokens : []
      exactInvocationRequests.push(tokens)
      return new Response(JSON.stringify({
        ok: true,
        tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
        mcpInvoked: true,
        sourceRevision: SOURCE_REVISION,
        ...payloadMetadata,
        invocations: tokens.map(token => ({ token, ok: true })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '2024-11-05' },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'source-backed-launch-session',
        },
      })
    }
    const query = String(body.params?.arguments?.query || '')
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision: SOURCE_REVISION,
          ...payloadMetadata,
          catalog: SOURCE_CATALOG.filter(entry => entry.token.startsWith(query)),
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return {
    exactInvocationRequests,
    restore: () => {
      globalThis.fetch = originalFetch
      resetSkillsCommandsMcpTargetForTests()
      resetAgenticOsRemoteGrammarCatalogForTests()
    },
  }
}

export async function testKnowledgeGraphSkillsCommandsResolverUsesSharedSourceBackedCatalog() {
  resetSkillsCommandsMcpTargetForTests()
  resetAgenticOsRemoteGrammarCatalogForTests()
  const fetchMock = installSourceCatalogFetchMock()
  try {
    const resolution = await targetSkillsCommandsMcpInvocation(
      KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
    )
    assert.deepEqual(resolution.invocation, {
      schema: 'knowgrph-knowledge-graph-invocation/v1',
      tool: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
      action: SOURCE_COMMAND,
      semantics: [SOURCE_SEMANTIC],
      bindings: [SOURCE_BINDING],
      sourceRevision: SOURCE_REVISION,
      catalogDigest: SOURCE_CATALOG_METADATA.catalogDigest,
      routingSchema: SOURCE_CATALOG_METADATA.routingSchema,
      routingDigest: SOURCE_CATALOG_METADATA.routingDigest,
    })
    assert.deepEqual(
      resolution.entries.map(entry => [entry.token, entry.kind]),
      [
        [SOURCE_COMMAND, 'command'],
        [SOURCE_SEMANTIC, 'semantic'],
        [SOURCE_BINDING, 'binding'],
      ],
    )
    assert.deepEqual(fetchMock.exactInvocationRequests, [[
      SOURCE_COMMAND,
      SOURCE_SEMANTIC,
      SOURCE_BINDING,
    ]])
    assert.ok(resolution.entries.every(entry => (
      String(entry.sourcePath).includes(`/blob/${SOURCE_REVISION}/docs/DICTIONARY-`)
    )))
  } finally {
    fetchMock.restore()
  }
}

export async function testKnowledgeGraphSkillsCommandsResolverRequiresRoutingProof() {
  resetSkillsCommandsMcpTargetForTests()
  resetAgenticOsRemoteGrammarCatalogForTests()
  const fetchMock = installSourceCatalogFetchMock({ includeRoutingProof: false })
  try {
    await assert.rejects(
      targetSkillsCommandsMcpInvocation(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest),
      /routing metadata is not digest-verified/i,
    )
    assert.equal(fetchMock.exactInvocationRequests.length, 0)
  } finally {
    fetchMock.restore()
  }
}

export async function testKnowledgeGraphLaunchImportUrlTargetsFloatingPanelSkillsCommands() {
  resetSkillsCommandsMcpTargetForTests()
  resetAgenticOsRemoteGrammarCatalogForTests()
  const fetchMock = installSourceCatalogFetchMock()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const toolMenuCardRef = React.createRef<HTMLElement>()
  try {
    useGraphStore.getState().resetAll()
    function ShellHarness() {
      const floatingPanelOpen = useGraphStore(state => state.floatingPanelOpen)
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(LaunchDropdownImportUrlItem, {
          canvas2dRenderer: 'flow',
          menuIconClass: 'icon',
          menuItemClass: 'item',
          onClose: () => undefined,
          open: true,
          pushUiToast: () => undefined,
        }),
        floatingPanelOpen ? React.createElement(ToolbarToolMenu, {
          pipelineStatus: null,
          exportStatus: null,
          toolMenuCardRef,
          toolMenuCardStyle: {},
          onHeaderPointerDown: () => undefined,
          onClose: () => useGraphStore.getState().setFloatingPanelOpen(false),
        }) : null,
      )
    }
    await mountReactRoot(root, React.createElement(ShellHarness), {
      window: dom.window as unknown as Window,
      tasks: 2,
      frames: 1,
    })

    const launchButton = container.querySelector(
      '[data-kg-launch-import-url-skills-commands-target="skillsCommands"]',
    )
    assert.ok(launchButton instanceof dom.window.HTMLButtonElement)
    await act(async () => {
      launchButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      for (let attempt = 0; attempt < 12 && readSkillsCommandsMcpTarget().status === 'loading'; attempt += 1) {
        await waitForTasks(1)
      }
    })

    const graphState = useGraphStore.getState()
    assert.equal(graphState.floatingPanelOpen, true)
    assert.equal(graphState.floatingPanelView, 'skillsCommands')
    const target = readSkillsCommandsMcpTarget()
    assert.equal(target.status, 'ready')
    assert.equal(target.resolution?.invocation.action, SOURCE_COMMAND)

    const shell = container.querySelector('[data-kg-floating-panel-root="true"]')
    assert.ok(shell, 'expected the actual FloatingPanel shell to remain mounted')
    const panel = shell.querySelector('[data-kg-floating-panel-skills-commands-view="true"]')
    assert.equal(panel?.getAttribute('data-kg-floating-panel-skills-commands-mcp-target-status'), 'ready')
    assert.equal(panel?.getAttribute('data-kg-floating-panel-skills-commands-mcp-target-action'), SOURCE_COMMAND)
    assert.equal(
      panel?.getAttribute('data-kg-floating-panel-skills-commands-mcp-target-tokens'),
      `${SOURCE_COMMAND} ${SOURCE_SEMANTIC} ${SOURCE_BINDING}`,
    )
    const visibleTokens = [...container.querySelectorAll('[data-kg-skill-command-token-chip="1"]')]
      .map(element => String(element.textContent || '').trim())
    assert.deepEqual(visibleTokens.sort(), [SOURCE_BINDING, SOURCE_COMMAND, SOURCE_SEMANTIC].sort())
    assert.equal(visibleTokens.includes('/unrelated.command'), false)
    const closeButton = shell.querySelector('button[aria-label="Close"]')
    assert.ok(closeButton instanceof dom.window.HTMLButtonElement)
    await act(async () => {
      closeButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForTasks(1)
    })
    assert.equal(container.querySelector('[data-kg-floating-panel-root="true"]'), null)
    assert.equal(readSkillsCommandsMcpTarget().status, 'idle')
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    container.remove()
    restore()
    fetchMock.restore()
  }
}

export async function testKnowledgeGraphLaunchSkillsCommandsFailureIsVisibleAndScoped() {
  resetSkillsCommandsMcpTargetForTests()
  resetAgenticOsRemoteGrammarCatalogForTests()
  const originalFetch = globalThis.fetch
  let releaseFirstFetch: (() => void) | null = null
  let firstFetch = true
  globalThis.fetch = (async () => {
    if (firstFetch) {
      firstFetch = false
      await new Promise<void>(resolve => {
        releaseFirstFetch = resolve
      })
    }
    return new Response('unavailable', { status: 503 })
  }) as typeof fetch
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const toolMenuCardRef = React.createRef<HTMLElement>()
  const errors: string[] = []
  try {
    useGraphStore.getState().resetAll()
    function ShellHarness() {
      const floatingPanelOpen = useGraphStore(state => state.floatingPanelOpen)
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(LaunchDropdownImportUrlItem, {
          canvas2dRenderer: 'flow',
          menuIconClass: 'icon',
          menuItemClass: 'item',
          onClose: () => undefined,
          open: true,
          pushUiToast: toast => {
            if (toast.kind === 'error') errors.push(toast.message)
          },
        }),
        floatingPanelOpen ? React.createElement(ToolbarToolMenu, {
          pipelineStatus: null,
          exportStatus: null,
          toolMenuCardRef,
          toolMenuCardStyle: {},
          onHeaderPointerDown: () => undefined,
          onClose: () => useGraphStore.getState().setFloatingPanelOpen(false),
        }) : null,
      )
    }
    await mountReactRoot(root, React.createElement(ShellHarness), {
      window: dom.window as unknown as Window,
      tasks: 1,
    })
    const launchButton = container.querySelector(
      '[data-kg-launch-import-url-skills-commands-target="skillsCommands"]',
    )
    assert.ok(launchButton instanceof dom.window.HTMLButtonElement)
    await act(async () => {
      launchButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    assert.equal(readSkillsCommandsMcpTarget().status, 'loading')
    assert.ok(container.querySelector('[data-kg-floating-panel-skills-commands-mcp-feedback="loading"]'))
    assert.equal(container.querySelectorAll('[data-kg-skill-command-token-chip="1"]').length, 0)

    await act(async () => {
      releaseFirstFetch?.()
      for (let attempt = 0; attempt < 12 && readSkillsCommandsMcpTarget().status !== 'blocked'; attempt += 1) {
        await waitForTasks(1)
      }
    })
    assert.equal(readSkillsCommandsMcpTarget().status, 'blocked')
    assert.ok(container.querySelector('[data-kg-floating-panel-skills-commands-mcp-feedback="blocked"]'))
    assert.equal(container.querySelectorAll('[data-kg-skill-command-token-chip="1"]').length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0] || '', /remote grammar|routing metadata|resolution failed/i)
  } finally {
    releaseFirstFetch?.()
    await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    container.remove()
    restore()
    globalThis.fetch = originalFetch
    resetSkillsCommandsMcpTargetForTests()
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}
