import React from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { CAMERA_REQUIRED_METADATA_TOKENS, CameraMcpInvocationSection } from '@/features/strybldr/CameraMcpInvocationSection'
import { FloatingPanelChatComposer } from '@/features/chat/floatingPanelChat/FloatingPanelChatComposer'
import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'
import { buildFloatingPanelChatComposerOverlayParts } from '@/features/chat/floatingPanelChat/FloatingPanelChatComposerMediaOverlay'
import { buildChatInvocationSystemPrompt, parseChatInvocationDirectives } from '@/features/chat/chatInvocationRegistry'
import { findAgenticOsInvocationByToken } from '@/features/agentic-os/agenticOsDocInvocations'
import {
  createAgenticOsRemoteGrammarClient,
  getAgenticOsRemoteGrammarCatalogEntries,
  getAgenticOsRemoteGrammarCatalogSnapshot,
  primeAgenticOsRemoteGrammarCatalogBySigil,
  refreshAgenticOsRemoteGrammarCatalog,
  registerAgenticOsRemoteGrammarCatalogEntries,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForTasks } from '@/tests/lib/reactRootHarness'
import {
  buildAgenticOsTestCatalogMetadata,
  type AgenticOsTestCatalogEntry,
} from '@/__tests__/helpers/agenticOsCatalogDigest'

export async function testCameraInvocationSurfaceReactsToRemoteGrammarHydration() {
  const originalFetch = globalThis.fetch
  resetAgenticOsRemoteGrammarCatalogForTests()
  registerAgenticOsRemoteGrammarCatalogEntries([{
    token: '/camera.hydration',
    kind: 'command',
    label: 'Camera hydration proof',
    summary: 'Source-backed Camera metadata registered before the surface mounted.',
    sourcePath: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-COMMAND.md#camera-hydration',
    keywords: ['camera', 'hydration'],
  }])
  const partialSnapshot = getAgenticOsRemoteGrammarCatalogSnapshot()
  if (partialSnapshot.hydration.status !== 'idle') {
    throw new Error(`expected partial Camera registration to remain idle before mount, got ${JSON.stringify(partialSnapshot.hydration)}`)
  }
  const sourceCatalog: AgenticOsTestCatalogEntry[] = [
    {
      token: '/camera.hydration',
      kind: 'command',
      label: 'Camera hydration proof',
      summary: 'Source-backed Camera metadata registered before the surface mounted.',
      sourcePath: 'DICTIONARY-COMMAND.md#/camera.hydration',
      keywords: ['camera', 'hydration'],
    },
    ...CAMERA_REQUIRED_METADATA_TOKENS.map(required => {
      const dictionary = required.kind === 'command'
        ? 'COMMAND'
        : required.kind === 'semantic'
          ? 'SEMANTIC'
          : 'BINDING'
      return {
        ...required,
        label: `Complete ${required.token}`,
        sourcePath: `DICTIONARY-${dictionary}.md#${required.token}`,
      }
    }),
  ]
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2024-11-05' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'camera-hydration-session' },
      })
    }
    const query = String((body.params as { arguments?: { query?: string } })?.arguments?.query || '')
    const catalog = sourceCatalog.filter(entry => entry.token.startsWith(query))
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision: 'c'.repeat(40),
          ...buildAgenticOsTestCatalogMetadata(sourceCatalog),
          catalog,
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(root, <CameraMcpInvocationSection />, { window: dom.window as unknown as Window, frames: 4, tasks: 6 })
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = container
        .querySelector('[data-kg-camera-webmcp-invocations="1"]')
        ?.getAttribute('data-kg-camera-metadata-status')
      if (status === 'fresh') break
      await waitForTasks(1)
      await waitForFrames(dom.window as unknown as Window, 1)
    }
    const hydratedCard = container.querySelector('[data-kg-camera-invocation-token="/camera.hydration"]')
    const hydratedSurface = container.querySelector('[data-kg-camera-webmcp-invocations="1"]')
    const partialFreshVersion = Number(hydratedSurface?.getAttribute('data-kg-camera-metadata-version') || '-1')
    const metadataStatus = hydratedSurface?.getAttribute('data-kg-camera-metadata-status') || ''
    if (!hydratedSurface || !hydratedCard || partialFreshVersion <= partialSnapshot.version) {
      throw new Error(`expected mounted Camera metadata to react to the catalog snapshot, html=${container.innerHTML}`)
    }
    if (metadataStatus !== 'fresh' || container.querySelector('[data-kg-camera-metadata-not-fresh="1"]')) {
      throw new Error(`expected digest-verified Camera metadata to be complete, html=${container.innerHTML}`)
    }
    if (!hydratedCard.getAttribute('data-kg-camera-invocation-source')?.includes('DICTIONARY-COMMAND.md#/camera.hydration')) {
      throw new Error(`expected hydrated Camera card to retain ACOS source ownership, html=${container.innerHTML}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    resetAgenticOsRemoteGrammarCatalogForTests()
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatComposerWiresRemoteAgenticOsGrammar() {
  const previousAgentReadyBaseUrl = process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL
  const originalFetch = globalThis.fetch
  const calls: Array<{ method: string, headers: Headers, body: Record<string, unknown> }> = []
  resetAgenticOsRemoteGrammarCatalogForTests()
  process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL = 'https://airvio.co/agenticgraph'
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    calls.push({ method: String(body.method || ''), headers, body })
    if (String(input) !== 'https://airvio.co/agenticgraph/control-plane/mcp') {
      throw new Error(`expected remote grammar fetch to use control-plane MCP, got ${String(input)}`)
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
          'mcp-session-id': 'remote-session-1',
        },
      })
    }
    if (body.method === 'tools/call') {
      const query = String((body.params as { arguments?: { query?: string } })?.arguments?.query || '')
      const sourceCatalog: AgenticOsTestCatalogEntry[] = [{
        token: '/remote.only',
        kind: 'command',
        label: 'Remote only',
        summary: 'Live remote grammar suggestion',
        sourcePath: 'DICTIONARY-COMMAND.md#/remote.only',
        keywords: ['remote', 'live'],
      }]
      const catalog = query.startsWith('#') || query.startsWith('@') ? [] : sourceCatalog
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            ok: true,
            sourceRevision: 'a'.repeat(40),
            ...buildAgenticOsTestCatalogMetadata(sourceCatalog),
            catalog,
          },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  function Harness() {
    const [input, setInput] = React.useState('')
    return (
      <FloatingPanelChatComposer
        input={input}
        setInput={setInput}
        markdownText={'---\nproject: agenticgraph\n---\n# Brief'}
        isLoading={false}
        isSubmitDisabled={false}
        uiPanelTextFontClass="text-sm"
        placeholder="Ask a question"
      />
    )
  }

  try {
    await mountReactRoot(root, React.createElement(Harness), { window: dom.window as unknown as Window, frames: 2 })
    const editor = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement | null
    const commandProxy = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement | null
    if (!editor || !commandProxy) throw new Error('expected remote-grammar harness to mount the shared Card/Widget editor')
    editor.textContent = '/remo'
    Simulate.input(editor)
    await waitForFrames(dom.window as unknown as Window, 2)
    const activeEditor = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement
    const range = dom.window.document.createRange(); range.selectNodeContents(activeEditor); range.collapse(false)
    const selection = dom.window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); Simulate.keyUp(activeEditor)
    await waitForTasks(4)
    await waitForFrames(dom.window as unknown as Window, 6)
    const slashMenu = dom.window.document.querySelector('section[aria-label="Chat slash commands"]')
    const remoteItem = Array.from((slashMenu?.querySelectorAll('button') || []) as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('/remote.only'))
    if (!remoteItem) {
      throw new Error(`expected remote MCP grammar suggestion to appear in the slash menu, html=${container.innerHTML}`)
    }
    remoteItem.click()
    await waitForFrames(dom.window as unknown as Window, 2)
    if (commandProxy.value !== '/remote.only ') {
      throw new Error(`expected remote MCP grammar selection to update the composer input, got ${JSON.stringify(commandProxy.value)}`)
    }
    const initializeCall = calls.find(call => call.method === 'initialize')
    const toolsCall = calls.find(call => call.method === 'tools/call' && (call.body.params as { arguments?: { query?: string } })?.arguments?.query === '/remo')
    if (!initializeCall || !toolsCall) {
      throw new Error(`expected remote grammar wiring to perform initialize + tools/call, got ${JSON.stringify(calls.map(call => call.method))}`)
    }
    if (toolsCall.headers.get('mcp-session-id') !== 'remote-session-1') {
      throw new Error(`expected remote grammar tools/call to reuse the MCP session id, got ${JSON.stringify(calls.map(call => ({ method: call.method, sessionId: call.headers.get('mcp-session-id') || '' })) )}`)
    }
    if ((toolsCall.body.params as { arguments?: { query?: string } })?.arguments?.query !== '/remo') {
      throw new Error(`expected remote grammar tools/call to query the live token text, got ${JSON.stringify(toolsCall.body)}`)
    }
    const hydratedEntry = getAgenticOsRemoteGrammarCatalogEntries().find(entry => entry.token === '/remote.only')
    if (hydratedEntry?.sourceUrl !== `https://github.com/huijoohwee/agentic-canvas-os/blob/${'a'.repeat(40)}/docs/DICTIONARY-COMMAND.md#/remote.only`) {
      throw new Error(`expected remote grammar provenance to bind the exact docs revision, got ${String(hydratedEntry?.sourceUrl || '')}`)
    }
  } finally {
    if (typeof previousAgentReadyBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL = previousAgentReadyBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testRemoteAgenticOsGrammarHydratesSharedInvocationLookups() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  try {
    registerAgenticOsRemoteGrammarCatalogEntries([
      {
        token: '#remote-runtime',
        kind: 'semantic',
        label: 'Remote runtime',
        summary: 'Live remote semantic directive',
        sourcePath: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-SEMANTIC.md#remote-runtime',
        keywords: ['remote', 'runtime'],
      },
      {
        token: '@remote-binding',
        kind: 'binding',
        label: 'Remote binding',
        summary: 'Live remote binding directive',
        sourcePath: 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-BINDING.md#remote-binding',
        keywords: ['remote', 'binding'],
      },
    ])
    const semanticInvocation = findAgenticOsInvocationByToken('#remote-runtime')
    if (!semanticInvocation || semanticInvocation.kind !== 'semantic' || !semanticInvocation.sourcePath.includes('DICTIONARY-SEMANTIC.md#remote-runtime')) {
      throw new Error(`expected shared Agentic OS invocation lookup to resolve remote semantic tokens, got ${JSON.stringify(semanticInvocation)}`)
    }
    const bindingInvocation = findAgenticOsInvocationByToken('@remote-binding')
    if (!bindingInvocation || bindingInvocation.kind !== 'binding' || !bindingInvocation.sourcePath.includes('DICTIONARY-BINDING.md#remote-binding')) {
      throw new Error(`expected shared Agentic OS invocation lookup to resolve remote binding tokens, got ${JSON.stringify(bindingInvocation)}`)
    }
    const directives = parseChatInvocationDirectives('Use #memory.search with #remote-runtime and @remote-binding in the same request.')
    const directiveTokens = directives.map(directive => directive.token)
    if (!directiveTokens.includes('#remote-runtime')) {
      throw new Error(`expected remote semantic directives to join the shared chat invocation registry, got ${JSON.stringify(directiveTokens)}`)
    }
    const invocationPrompt = buildChatInvocationSystemPrompt({
      userQuery: 'Use #remote-runtime to bind the live remote grammar context.',
      chatProvider: 'openai',
      chatModel: 'gpt-5-nano',
    })
    if (!invocationPrompt.includes('#remote-runtime') || !invocationPrompt.includes('DICTIONARY-SEMANTIC.md#remote-runtime')) {
      throw new Error(`expected remote semantic directives to project source-backed prompt context, got ${JSON.stringify(invocationPrompt)}`)
    }
    const overlay = buildFloatingPanelChatComposerOverlayParts('Use #remote-runtime with @remote-binding')
    const overlayTokens = overlay.parts.flatMap(part => part.kind === 'invocation' ? [part.text] : [])
    if (!overlayTokens.includes('#remote-runtime') || !overlayTokens.includes('@remote-binding')) {
      throw new Error(`expected remote-only tokens to render through shared invocation chip parsing after hydration, got ${JSON.stringify(overlayTokens)}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export async function testRemoteAgenticOsGrammarIgnoresBareLocalhostOriginWithoutConfiguredBaseUrl() {
  const originalFetch = globalThis.fetch
  const { dom, restore } = initJsdomHarness()
  const calls: string[] = []
  resetAgenticOsRemoteGrammarCatalogForTests()

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input))
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '2024-11-05' },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'remote-session-default',
        },
      })
    }
    const catalog: AgenticOsTestCatalogEntry[] = []
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision: 'a'.repeat(40),
          ...buildAgenticOsTestCatalogMetadata(catalog),
          catalog,
        },
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = createAgenticOsRemoteGrammarClient()
    await client.searchCatalog('/')
    if (calls[0] !== 'https://airvio.co/agenticgraph/control-plane/mcp') {
      throw new Error(`expected bare localhost origin to fall back to the default remote control plane, got ${JSON.stringify(calls)}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
    restore()
    void dom
  }
}

export async function testRepoLocalSkillsCommandsHydratesSameOriginGrammar() {
  const originalFetch = globalThis.fetch
  const previousRepoLocal = process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL
  const previousAgentReadyBaseUrl = process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL
  const sourceRevision = 'c'.repeat(40)
  const calls: Array<{ url: string, method: string, query: string }> = []
  const sourceCatalog: AgenticOsTestCatalogEntry[] = (['/', '#', '@'] as const).map(sigil => {
    const kind = sigil === '/' ? 'command' : sigil === '#' ? 'semantic' : 'binding'
    const fileName = kind === 'command'
      ? 'DICTIONARY-COMMAND.md'
      : kind === 'semantic'
        ? 'DICTIONARY-SEMANTIC.md'
        : 'DICTIONARY-BINDING.md'
    const token = `${sigil}repo-local-xr`
    return { token, kind, label: `Repo-local ${kind}`, sourcePath: `${fileName}#${token}` }
  })
  const expectedCatalogDigest = buildAgenticOsTestCatalogMetadata(sourceCatalog).catalogDigest
  resetAgenticOsRemoteGrammarCatalogForTests()
  process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL = '1'
  delete process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    const method = String(body.method || '')
    const query = String((body.params as { arguments?: { query?: string } } | undefined)?.arguments?.query || '')
    calls.push({ url: String(input), method, query })
    if (method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2024-11-05' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'repo-local-grammar-session' },
      })
    }
    const kind = query === '/' ? 'command' : query === '#' ? 'semantic' : 'binding'
    await new Promise(resolve => setTimeout(resolve, query === '/' ? 0 : query === '#' ? 10 : 20))
    const token = `${query}repo-local-xr`
    const fileName = kind === 'command'
      ? 'DICTIONARY-COMMAND.md'
      : kind === 'semantic'
        ? 'DICTIONARY-SEMANTIC.md'
        : 'DICTIONARY-BINDING.md'
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision,
          ...buildAgenticOsTestCatalogMetadata(sourceCatalog),
          catalog: [{ token, kind, label: `Repo-local ${kind}`, sourcePath: `${fileName}#${token}` }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  try {
    await mountReactRoot(root, <SkillsCommandsView searchQuery="repo-local-xr" />, {
      window: dom.window as unknown as Window,
      frames: 6,
      tasks: 10,
    })
    await new Promise(resolve => setTimeout(resolve, 40))
    await waitForTasks(6)
    await waitForFrames(dom.window as unknown as Window, 4)
    const panel = container.querySelector('[data-kg-floating-panel-skills-commands="true"]')
    const expectedTokens = ['/repo-local-xr', '#repo-local-xr', '@repo-local-xr']
    const missingTokens = expectedTokens.filter(token => !container.querySelector(`[data-kg-skill-command-token="${token}"]`))
    if (missingTokens.length > 0
      || panel?.getAttribute('data-kg-floating-panel-skills-commands-metadata-status') !== 'fresh'
      || panel?.getAttribute('data-kg-floating-panel-skills-commands-source-revision') !== sourceRevision
      || panel?.getAttribute('data-kg-floating-panel-skills-commands-catalog-digest') !== expectedCatalogDigest
      || panel?.getAttribute('data-kg-floating-panel-skills-commands-catalog-counts') !== '1/1/1') {
      throw new Error(`expected repo-local Skills & Commands to hydrate exact-revision / # @ grammar, missing=${missingTokens.join(',')} html=${container.innerHTML}`)
    }
    const toolCalls = calls.filter(call => call.method === 'tools/call')
    if (toolCalls.length !== 3
      || toolCalls.some(call => call.url !== 'http://localhost/agenticgraph/control-plane/mcp')
      || toolCalls.map(call => call.query).sort().join('|') !== '#|/|@') {
      throw new Error(`expected repo-local grammar to use same-origin MCP once per sigil, got ${JSON.stringify(calls)}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
    if (typeof previousRepoLocal === 'string') process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL
    if (typeof previousAgentReadyBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL = previousAgentReadyBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_AGENT_READY_BASE_URL
  }
}

export async function testRemoteAgenticOsGrammarPrimeFailsClosedWhenTransportUnavailable() {
  const originalFetch = globalThis.fetch
  resetAgenticOsRemoteGrammarCatalogForTests()
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch

  try {
    const entries = await primeAgenticOsRemoteGrammarCatalogBySigil('/')
    if (!Array.isArray(entries) || entries.length !== 0) {
      throw new Error(`expected unavailable remote grammar hydration to fail closed with an empty catalog, got ${JSON.stringify(entries)}`)
    }
    if (getAgenticOsRemoteGrammarCatalogEntries().length !== 0) {
      throw new Error(`expected unavailable remote grammar hydration to avoid mutating the shared catalog, got ${JSON.stringify(getAgenticOsRemoteGrammarCatalogEntries())}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}

export async function testRemoteAgenticOsGrammarHydrationIsRevisionKeyedAndBounded() {
  const originalFetch = globalThis.fetch
  let sourceRevision = 'a'.repeat(40)
  let progressiveProviderStatus = 'unverified'
  resetAgenticOsRemoteGrammarCatalogForTests()
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2024-11-05' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'revision-session' },
      })
    }
    const query = String((body.params as { arguments?: { query?: string } })?.arguments?.query || '')
    const kind = query === '/' ? 'command' : query === '#' ? 'semantic' : 'binding'
    const token = `${query}revision-${sourceRevision[0]}`
    const dictionaryFileName = kind === 'command'
      ? 'DICTIONARY-COMMAND.md'
      : kind === 'semantic'
        ? 'DICTIONARY-SEMANTIC.md'
        : 'DICTIONARY-BINDING.md'
    const sourcePath = `${dictionaryFileName}#${token}`
    const sourceCatalog: AgenticOsTestCatalogEntry[] = (['/', '#', '@'] as const).map(sigil => {
      const entryKind = sigil === '/' ? 'command' : sigil === '#' ? 'semantic' : 'binding'
      const entryFileName = entryKind === 'command'
        ? 'DICTIONARY-COMMAND.md'
        : entryKind === 'semantic'
          ? 'DICTIONARY-SEMANTIC.md'
          : 'DICTIONARY-BINDING.md'
      const entryToken = `${sigil}revision-${sourceRevision[0]}`
      const entrySourcePath = `${entryFileName}#${entryToken}`
      return {
        token: entryToken,
        kind: entryKind,
        label: `Revision ${sourceRevision[0]}`,
        sourcePath: entrySourcePath,
        sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${sourceRevision}/docs/${entrySourcePath}`,
      }
    })
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          ok: true,
          sourceRevision,
          ...buildAgenticOsTestCatalogMetadata(sourceCatalog),
          liveAgentProviderProof: {
            schema: 'agent-live-provider-proof-summary/v1',
            status: 'verified-bounded-live',
            evidenceSchema: 'agent-live-provider-proof-contract/v1',
            sourceStatus: 'runtime-ready-dev',
            sourceRevision,
            proofRevision: 'd'.repeat(40),
            model: 'test-model',
            reasoningEffort: 'low',
            providerCalls: 3,
            inputTokens: 10,
            outputTokens: 5,
            cachedInputTokens: 0,
            estimatedCostUsd: 0.001,
            finalAnswerOwners: { delegation: 'manager', handoff: 'specialist' },
            continuationContext: 'all_turns',
            defaultWorkerConfigured: false,
          },
          progressiveAgentsReadiness: {
            schema: 'progressive-agents-readiness-summary/v1',
            status: 'runtime-ready-dev',
            sourceRevision,
            sourcePath: 'docs/PROGRESSIVE-AGENTS.md',
            sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${sourceRevision}/docs/PROGRESSIVE-AGENTS.md`,
            contractSchema: 'progressive-agents-runtime-contract/v1',
            runtimeScope: 'single-agent execution, tool-bearing agent execution, and explicit specialist workflow delegation',
            runtimeOwner: '../agent-api/src/progressive-agents.js',
            runtimeProof: '../__tests__/progressive-agents.test.mjs',
            contractReady: true,
            configured: false,
            progressionPolicy: 'single-agent-then-tools-then-specialists',
            growthStages: ['single-agent', 'tool-enabled-agent', 'specialist-workflow'],
            externalSdkDependency: false,
            providerExecutionStatus: progressiveProviderStatus,
            defaultWorkerConfigured: false,
            deployPolicy: 'Dev-only until explicit operator approval',
          },
          catalog: [{
            token,
            kind,
            label: `Revision ${sourceRevision[0]}`,
            sourcePath,
            sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${sourceRevision}/docs/${sourcePath}`,
          }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const first = await refreshAgenticOsRemoteGrammarCatalog()
    if (first.hydration.status !== 'fresh' || first.hydration.attempts !== 1 || first.sourceRevision !== sourceRevision) {
      throw new Error(`expected first revision hydration to become fresh in one bounded attempt, got ${JSON.stringify(first)}`)
    }
    if (first.counts.slash !== 1 || first.counts.hash !== 1 || first.counts.at !== 1) {
      throw new Error(`expected exact sigil counts after hydration, got ${JSON.stringify(first.counts)}`)
    }
    if (first.liveAgentProviderProof.status !== 'verified-bounded-live' || first.liveAgentProviderProof.proofRevision !== 'd'.repeat(40)) {
      throw new Error(`expected source-backed live provider proof to hydrate with the catalog revision, got ${JSON.stringify(first.liveAgentProviderProof)}`)
    }
    if (first.progressiveAgentsReadiness.status !== 'runtime-ready-dev'
      || first.progressiveAgentsReadiness.sourceRevision !== sourceRevision) {
      throw new Error(`expected source-backed progressive Agents readiness to share the catalog revision, got ${JSON.stringify(first.progressiveAgentsReadiness)}`)
    }
    sourceRevision = 'b'.repeat(40)
    progressiveProviderStatus = 'verified'
    const second = await refreshAgenticOsRemoteGrammarCatalog()
    if (second.sourceRevision !== sourceRevision || second.entries.some(entry => entry.token.endsWith('revision-a'))) {
      throw new Error(`expected docs revision change to invalidate the prior catalog, got ${JSON.stringify(second)}`)
    }
    if (second.progressiveAgentsReadiness.status !== 'unavailable') {
      throw new Error(`expected unsupported progressive readiness evidence to fail closed, got ${JSON.stringify(second.progressiveAgentsReadiness)}`)
    }
    if (getAgenticOsRemoteGrammarCatalogSnapshot().hydration.attempts > 2) {
      throw new Error('expected catalog hydration attempts to stay within the two-attempt contract')
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    globalThis.fetch = originalFetch
  }
}
