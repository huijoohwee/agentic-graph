import path from 'node:path'
import { pathToFileURL } from 'node:url'

type SealionRuntimeModule = {
  AGENTICGRAPH_SEALION_MCP_API_KEY_ENV: string
  AGENTICGRAPH_SEALION_MCP_TOOL_NAMES: Record<string, string>
  callSealionSidecarTool: (
    toolName: string,
    args: Record<string, unknown>,
    options: {
      env: Record<string, string>
      fetchImpl: typeof fetch
    },
  ) => Promise<{ ok: boolean, tool: string, upstreamUrl: string, result: Record<string, unknown> }>
}

const importSealionRuntime = async (): Promise<SealionRuntimeModule> => {
  const runtimeUrl = pathToFileURL(path.resolve(process.cwd(), '..', 'mcp', 'sealion-sidecar-runtime.js')).href
  return await import(runtimeUrl) as SealionRuntimeModule
}

const buildJsonResponse = (payload: unknown, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(payload), { status: 200, headers })

export async function testSealionSidecarRuntimeCallsHostedMcpToolWithServerKey() {
  const runtime = await importSealionRuntime()
  const calls: Array<{ body: Record<string, unknown>, authorization: string, sessionId: string }> = []
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    calls.push({
      body,
      authorization: headers.get('authorization') || '',
      sessionId: headers.get('mcp-session-id') || '',
    })
    if (body.method === 'initialize') {
      return buildJsonResponse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26' } }, { 'mcp-session-id': 'session-1' })
    }
    if (body.method === 'tools/call') {
      return buildJsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            languages: ['english'],
            variant: 'singapore_colloquial_english',
            code_switching: false,
          },
        },
      })
    }
    return buildJsonResponse({ jsonrpc: '2.0', result: {} })
  }) as typeof fetch

  const payload = await runtime.callSealionSidecarTool(
    runtime.AGENTICGRAPH_SEALION_MCP_TOOL_NAMES.detectLanguageVariant,
    { text: 'Can lah' },
    { env: { [runtime.AGENTICGRAPH_SEALION_MCP_API_KEY_ENV]: 'sk-test' }, fetchImpl },
  )

  if (payload.tool !== 'detect_language_variant' || payload.result.variant !== 'singapore_colloquial_english') {
    throw new Error(`expected hosted sidecar result to surface structured content, got ${JSON.stringify(payload)}`)
  }
  if (calls[0]?.authorization !== 'Bearer sk-test') {
    throw new Error(`expected SEA-LION MCP bridge to use server-side bearer key, got ${JSON.stringify(calls)}`)
  }
  const toolsCall = calls.find(call => call.body.method === 'tools/call')
  if (!toolsCall || toolsCall.sessionId !== 'session-1') {
    throw new Error(`expected tools/call to reuse MCP session id, got ${JSON.stringify(calls)}`)
  }
}

export async function testSealionSidecarRuntimeRequiresCanonicalServerKey() {
  const runtime = await importSealionRuntime()
  try {
    await runtime.callSealionSidecarTool(runtime.AGENTICGRAPH_SEALION_MCP_TOOL_NAMES.safetyCheck, { mode: 'prompt_only', prompt: 'x' }, { env: {}, fetchImpl: fetch })
  } catch (error) {
    if (String(error instanceof Error ? error.message : error).includes(runtime.AGENTICGRAPH_SEALION_MCP_API_KEY_ENV)) return
    throw error
  }
  throw new Error('expected missing SEA-LION MCP API key to fail closed')
}
