import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createPublishedDocIdentityResolver, encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import { buildKnowgrphAgentReadyToolContracts } from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import {
  buildExpectedMockAgentSurfaceInspection,
  createMockResponse,
} from '@/__tests__/helpers/webMcpRuntimeFixture'
import { PUBLISHED_AGENT_READY_TOOL_EXECUTORS_BROWSER_SOURCE } from '@/features/agent-ready/publishedToolExecutors.mjs'
import { WEB_MCP_LIFECYCLE_CONTROLLER_BROWSER_SOURCE } from '@/features/agent-ready/webMcpLifecycleBrowserSource.mjs'
import { webMcpScript } from '../../../cloudflare/pages/knowgrph-agent-ready.mjs'
import {
  WEB_MCP_LIFECYCLE_SCRIPT_MARKER,
  hasOwnedWebMcpLifecycleScript,
  injectWebMcpScript,
} from '../../../cloudflare/pages/webmcp-html-injection.mjs'

type RegisteredTool = {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}

const readWebMcpContextState = (document: Document): string =>
  String(document.documentElement.dataset.kgWebmcpContext || '')

export async function testAgentReadyHtmlInjectionRequiresLifecycleContractNotToolNameCoincidence(): Promise<void> {
  const toolNames = buildKnowgrphAgentReadyToolContracts({
    defaultWorkspaceId: 'kgws:canonical-docs',
  }).map((tool) => tool.webName)
  const bundledLifecycleShell = `<!doctype html><html><head></head><body>${[
    ...toolNames,
    'createWebMcpLifecycleController',
    'kgWebmcpContext',
    'toolDefinitions',
    'toolExecutors',
  ].join(' ')}</body></html>`
  if (hasOwnedWebMcpLifecycleScript(bundledLifecycleShell)) {
    throw new Error('expected bundled symbol coincidence to remain insufficient Pages lifecycle ownership evidence')
  }

  const response = await injectWebMcpScript(new Response(bundledLifecycleShell, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }), webMcpScript)
  const body = await response.text()
  if (!hasOwnedWebMcpLifecycleScript(body) || !body.includes('fallback-readable')) {
    throw new Error('expected the Pages HTML owner to inject its canonical WebMCP lifecycle into an unowned app shell')
  }
  if (body.split(WEB_MCP_LIFECYCLE_SCRIPT_MARKER).length !== 2) {
    throw new Error('expected exactly one explicit Pages WebMCP lifecycle owner marker')
  }

  const reinjected = await injectWebMcpScript(new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }), webMcpScript)
  const reinjectedBody = await reinjected.text()
  if (reinjectedBody !== body) {
    throw new Error('expected lifecycle-complete HTML injection to be idempotent')
  }
}

export async function testAgentReadyHtmlWebMcpFallbackLateBindsAndUsesSameOriginStoragePaths(): Promise<void> {
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const fetchCalls: string[] = []
  const registeredTools = new Map<string, RegisteredTool>()
  const nativeRegistrationSignals: AbortSignal[] = []

  try {
    if (!webMcpScript.includes(`const createWebMcpLifecycleController = ${WEB_MCP_LIFECYCLE_CONTROLLER_BROWSER_SOURCE};`)
      || !WEB_MCP_LIFECYCLE_CONTROLLER_BROWSER_SOURCE.includes('fallbackModelContextBindings')
      || !WEB_MCP_LIFECYCLE_CONTROLLER_BROWSER_SOURCE.includes('dispose')) {
      throw new Error('expected HTML fallback script to serialize the complete canonical WebMCP lifecycle controller')
    }
    if (!webMcpScript.includes('createPublishedDocIdentityResolver')) {
      throw new Error('expected HTML fallback script to embed the canonical published-doc identity resolver')
    }
    if (webMcpScript.includes('__name(')) {
      throw new Error('expected HTML fallback script to avoid bundler-only __name helper references')
    }
    if (!PUBLISHED_AGENT_READY_TOOL_EXECUTORS_BROWSER_SOURCE.includes('const n = (value) => value')) {
      throw new Error('expected published executor browser source to define the bundler name helper before bundled Function#toString output runs')
    }
    const navigatorObject = window.navigator as Navigator & {
      modelContext?: {
        provideContext?: (context: { tools: RegisteredTool[] }) => void
        registerTool?: (tool: RegisteredTool, options?: { signal?: AbortSignal }) => void
      }
    }
    try {
      delete navigatorObject.modelContext
    } catch {
      navigatorObject.modelContext = undefined
    }

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      fetchCalls.push(url)
      if (url.endsWith('/knowgrph/mcp')) {
        const structuredContent = buildExpectedMockAgentSurfaceInspection('http://localhost/knowgrph')
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
            structuredContent,
            isError: false,
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return createMockResponse(url)
    }) as typeof fetch

    new Function(webMcpScript)()

    if (readWebMcpContextState(document) !== 'fallback-readable') {
      throw new Error(
        `expected fallback-readable HTML script state before late modelContext binding, got ${String(document.documentElement.dataset.kgWebmcpContext)}`,
      )
    }
    if (String(document.documentElement.dataset.kgWebmcpHostContext) !== 'awaiting-model-context') {
      throw new Error('expected HTML fallback readiness to report native host binding separately')
    }
    if (typeof navigatorObject.modelContext?.provideContext !== 'function' || typeof navigatorObject.modelContext?.registerTool !== 'function') {
      throw new Error('expected injected WebMCP fallback to expose provideContext and registerTool for scanner-visible API parity')
    }
    if ((document as Document & { modelContext?: unknown }).modelContext !== navigatorObject.modelContext) {
      throw new Error('expected injected WebMCP fallback to expose the same modelContext on document and navigator')
    }
    const fallbackContext = navigatorObject.modelContext

    const nativeModelContext = {
      registerTool(tool, options) {
        if (!options?.signal) {
          throw new Error(`expected AbortSignal-backed registerTool options for ${tool.name}`)
        }
        nativeRegistrationSignals.push(options.signal)
        registeredTools.set(tool.name, tool)
        options.signal.addEventListener('abort', () => registeredTools.delete(tool.name), { once: true })
      },
    }
    navigatorObject.modelContext = nativeModelContext

    if (readWebMcpContextState(document) !== 'installed') {
      throw new Error(
        `expected installed HTML script state after late modelContext binding, got ${String(document.documentElement.dataset.kgWebmcpContext)}`,
      )
    }
    if (String(document.documentElement.dataset.kgWebmcpHostContext) !== 'installed') {
      throw new Error('expected HTML fallback late host binding to report installed')
    }

    const expectedSharedContracts = buildKnowgrphAgentReadyToolContracts({
      defaultWorkspaceId: 'kgws:canonical-docs',
    })
    const expectedBrowserOnlyToolNames = buildKnowgrphAgentReadyToolContracts({
      defaultWorkspaceId: 'kgws:canonical-docs',
      includeBrowserOnlyTools: true,
    })
      .map((tool) => tool.webName)
      .filter((toolName) => !expectedSharedContracts.some((tool) => tool.webName === toolName))
    const registeredToolNames = Array.from(registeredTools.keys()).sort()
    const expectedToolNames = expectedSharedContracts.map((tool) => tool.webName).sort()
    if (registeredToolNames.join('|') !== expectedToolNames.join('|')) {
      throw new Error(
        `expected injected HTML fallback tool parity with shared contract, got ${registeredToolNames.join(', ')} expected ${expectedToolNames.join(', ')}`,
      )
    }
    for (const contract of expectedSharedContracts) {
      const registeredTool = registeredTools.get(contract.webName)
      if (!registeredTool) {
        throw new Error(`expected injected HTML fallback to register ${contract.webName}`)
      }
      if (registeredTool.title !== contract.title) {
        throw new Error(`expected injected HTML fallback title parity for ${contract.webName}`)
      }
      if (registeredTool.description !== contract.description) {
        throw new Error(`expected injected HTML fallback description parity for ${contract.webName}`)
      }
      if (JSON.stringify(registeredTool.inputSchema) !== JSON.stringify(contract.inputSchema)) {
        throw new Error(`expected injected HTML fallback inputSchema parity for ${contract.webName}`)
      }
      if (JSON.stringify(registeredTool.outputSchema || null) !== JSON.stringify(contract.outputSchema || null)) {
        throw new Error(`expected injected HTML fallback outputSchema parity for ${contract.webName}`)
      }
      if (JSON.stringify(registeredTool.securitySchemes || null) !== JSON.stringify(contract.securitySchemes || null)) {
        throw new Error(`expected injected HTML fallback securitySchemes parity for ${contract.webName}`)
      }
      if (JSON.stringify(registeredTool.annotations || null) !== JSON.stringify(contract.annotations || null)) {
        throw new Error(`expected injected HTML fallback annotations parity for ${contract.webName}`)
      }
      if (JSON.stringify(registeredTool._meta || null) !== JSON.stringify(contract._meta || null)) {
        throw new Error(`expected injected HTML fallback _meta parity for ${contract.webName}`)
      }
    }
    for (const browserOnlyToolName of expectedBrowserOnlyToolNames) {
      if (registeredTools.has(browserOnlyToolName)) {
        throw new Error(`expected injected HTML fallback to exclude browser-local tool ${browserOnlyToolName}`)
      }
    }
    if (document.documentElement.dataset.kgWebmcpTools !== expectedSharedContracts.map((tool) => tool.webName).join(',')) {
      throw new Error(
        `expected HTML fallback data-kg-webmcp-tools to match shared contract order, got ${String(document.documentElement.dataset.kgWebmcpTools)}`,
      )
    }

    const listTool = registeredTools.get('knowgrph.list_source_files')
    const readTool = registeredTools.get('knowgrph.read_source_file')
    const readSharedTool = registeredTools.get('knowgrph.read_shared_document')
    const inspectSharedDocumentTool = registeredTools.get('knowgrph.inspect_shared_document_structure')
    const inspectTool = registeredTools.get('knowgrph.inspect_agent_surface')
    if (!listTool || !readTool || !readSharedTool || !inspectSharedDocumentTool || !inspectTool) {
      throw new Error(`expected all injected WebMCP tools to be registered, got ${Array.from(registeredTools.keys()).join(', ')}`)
    }

    const shareToken = encodePublishedDocShareToken({ canonicalPath: 'docs/shared.md' })
    await listTool.execute()
    await readTool.execute({ canonicalPath: 'docs/example.md' })
    await readSharedTool.execute({ shareUrl: `/knowgrph/share/${shareToken}` })
    const sharedStructure = await inspectSharedDocumentTool.execute({ shareUrl: `/knowgrph/share/${shareToken}` })
    const aliasResolver = createPublishedDocIdentityResolver({ defaultAppBasePath: '/knowgrph' })
    const aliasInputs = [
      { shareUrl: `/?kgShare=${shareToken}` },
      { shareUrl: '/?kgWorkspaceId=wk-123&kgCanonicalPath=docs%2Falias.md' },
      { shareUrl: '/?kgPath=%2Fdoc%2Fwk-path%2Fdocs%252Ffrom-path.md' },
      { shareUrl: '/knowgrph/doc-default/docs%2Fdefault-only.md' },
    ]
    const aliasExpectations = aliasInputs.map((input) => aliasResolver({
      ...input,
      baseUrl: 'http://localhost',
      appBasePath: '/knowgrph',
    }))
    for (const aliasInput of aliasInputs) {
      await readSharedTool.execute(aliasInput)
      await inspectSharedDocumentTool.execute(aliasInput)
    }
    const inspection = await inspectTool.execute()

    if (!fetchCalls.includes('/api/storage/source-files')) {
      throw new Error(`expected injected list_source_files to use same-origin storage path, got ${fetchCalls.join(', ')}`)
    }
    if (!fetchCalls.includes('/api/storage/doc-default/docs%2Fexample.md')) {
      throw new Error(`expected injected read_source_file to use same-origin storage path, got ${fetchCalls.join(', ')}`)
    }
    if (!fetchCalls.includes('/api/storage/doc-default/docs%2Fshared.md')) {
      throw new Error(`expected injected read_shared_document to reuse same-origin storage path, got ${fetchCalls.join(', ')}`)
    }
    const expectedAliasFetches = [
      '/api/storage/doc-default/docs%2Fshared.md',
      '/api/storage/doc/wk-123/docs%2Falias.md',
      '/api/storage/doc/wk-path/docs%2Ffrom-path.md',
      '/api/storage/doc-default/docs%2Fdefault-only.md',
    ]
    for (const expectedAliasFetch of expectedAliasFetches) {
      if (!fetchCalls.includes(expectedAliasFetch)) {
        throw new Error(`expected injected shared-document tools to resolve alias form ${expectedAliasFetch}, got ${fetchCalls.join(', ')}`)
      }
    }
    if (aliasExpectations[0]?.canonicalPath !== 'docs/shared.md') {
      throw new Error(`expected canonical resolver kgShare parity, got ${JSON.stringify(aliasExpectations[0])}`)
    }
    if (aliasExpectations[1]?.workspaceId !== 'wk-123' || aliasExpectations[1]?.canonicalPath !== 'docs/alias.md') {
      throw new Error(`expected canonical resolver workspace alias parity, got ${JSON.stringify(aliasExpectations[1])}`)
    }
    if (aliasExpectations[2]?.workspaceId !== 'wk-path' || aliasExpectations[2]?.canonicalPath !== 'docs/from-path.md') {
      throw new Error(`expected canonical resolver kgPath alias parity, got ${JSON.stringify(aliasExpectations[2])}`)
    }
    if (aliasExpectations[3]?.workspaceId !== null || aliasExpectations[3]?.canonicalPath !== 'docs/default-only.md') {
      throw new Error(`expected canonical resolver doc-default parity, got ${JSON.stringify(aliasExpectations[3])}`)
    }
    if ((sharedStructure as { flowConnectionCount?: unknown }).flowConnectionCount !== 1) {
      throw new Error(`expected injected inspect_shared_document_structure to count flow connections, got ${JSON.stringify(sharedStructure)}`)
    }
    if ((sharedStructure as { headingCount?: unknown }).headingCount !== 2) {
      throw new Error(`expected injected inspect_shared_document_structure to count markdown headings, got ${JSON.stringify(sharedStructure)}`)
    }
    if (!fetchCalls.some((url) => url.endsWith('/knowgrph/mcp'))) {
      throw new Error(`expected injected inspect_agent_surface to use the Pages MCP route, got ${fetchCalls.join(', ')}`)
    }
    const staleInspectionFetch = fetchCalls.find((url) =>
      url.endsWith('/knowgrph/health') || url.endsWith('/knowgrph/.well-known/agent-skills/index.json'))
    if (staleInspectionFetch) {
      throw new Error(`expected injected inspect_agent_surface to avoid local readiness fanout, got ${fetchCalls.join(', ')}`)
    }
    const expectedInspection = buildExpectedMockAgentSurfaceInspection('http://localhost/knowgrph')
    if (JSON.stringify(inspection) !== JSON.stringify(expectedInspection)) {
      throw new Error(`expected injected inspect_agent_surface to return the exact shared payload, got ${JSON.stringify(inspection)}`)
    }

    navigatorObject.modelContext = undefined
    if (navigatorObject.modelContext !== fallbackContext
      || readWebMcpContextState(document) !== 'fallback-readable'
      || String(document.documentElement.dataset.kgWebmcpHostContext) !== 'awaiting-model-context'
      || nativeRegistrationSignals.some(signal => !signal.aborted)
      || registeredTools.size !== 0) {
      throw new Error('expected HTML native host teardown to restore fallback readiness and release registrations')
    }
    navigatorObject.modelContext = nativeModelContext
    if (readWebMcpContextState(document) !== 'installed'
      || String(document.documentElement.dataset.kgWebmcpHostContext) !== 'installed'
      || registeredTools.size !== expectedSharedContracts.length) {
      throw new Error('expected HTML native host to rebind the complete tool set on the same context object')
    }
  } finally {
    globalThis.fetch = previousFetch
    restore()
  }
}
