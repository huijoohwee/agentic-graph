import {
  getAgenticOsRemoteGrammarCatalogSnapshot,
  hydrateAgenticOsRemoteGrammarCatalogBySigils,
} from './agenticOsRemoteGrammarClient'
import {
  resolveChatInvocationCatalogEntries,
  type ChatInvocationCatalogEntry,
} from '@/features/chat/chatInvocationRegistry'
import { invokeAgenticOsDocsMcpBridge } from '@/features/agent-ready/agenticOsDocsMcpClient'
import {
  isAgenticOsDocsMcpBridgeSuccessBoundToProof,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'

export type AgenticOsMcpInvocationPacket = Readonly<{
  schema: 'knowgrph-knowledge-graph-invocation/v1'
  tool: string
  action: string
  semantics: readonly string[]
  bindings: readonly string[]
  sourceRevision: string
  catalogDigest: string
  routingSchema: typeof AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
  routingDigest: string
}>

export type AgenticOsMcpInvocationResolution = Readonly<{
  mcpTool: string
  invocation: AgenticOsMcpInvocationPacket
  sourceRevision: string
  catalogDigest: string
  entries: readonly ChatInvocationCatalogEntry[]
}>

const MCP_TOOL = /^knowgrph\.[A-Za-z0-9_.-]+$/
const PINNED_DICTIONARY_SOURCE = /\/blob\/[0-9a-f]{40}\/docs\/DICTIONARY-(?:COMMAND|SEMANTIC|BINDING)\.md#/i

const sourceBacked = (
  entry: ChatInvocationCatalogEntry,
  kind: 'command' | 'semantic' | 'binding',
): boolean => entry.kind === kind && PINNED_DICTIONARY_SOURCE.test(String(entry.sourcePath || ''))

const resolveRelatedEntries = (
  catalog: readonly ChatInvocationCatalogEntry[],
  tokens: readonly string[],
  kind: 'semantic' | 'binding',
): readonly ChatInvocationCatalogEntry[] => {
  const byToken = new Map(catalog.map(entry => [entry.token.toLowerCase(), entry]))
  const entries = tokens.map(token => byToken.get(token.toLowerCase()))
  if (
    entries.length === 0
    || entries.some(entry => !entry || !sourceBacked(entry, kind))
    || new Set(tokens.map(token => token.toLowerCase())).size !== tokens.length
  ) {
    throw new Error(`Agentic Canvas OS ${kind} resolution is incomplete or not source-backed.`)
  }
  return entries as readonly ChatInvocationCatalogEntry[]
}

export async function resolveAgenticOsMcpInvocation(
  mcpToolRaw: string,
): Promise<AgenticOsMcpInvocationResolution> {
  const mcpTool = String(mcpToolRaw || '').trim()
  if (!MCP_TOOL.test(mcpTool)) throw new Error('A canonical Knowgrph MCP tool name is required.')
  await hydrateAgenticOsRemoteGrammarCatalogBySigils(['/', '#', '@'])
  const snapshot = getAgenticOsRemoteGrammarCatalogSnapshot()
  if (
    snapshot.hydration.status !== 'fresh'
    || snapshot.routingVerified !== true
    || !/^[0-9a-f]{40}$/.test(snapshot.sourceRevision)
    || !/^[0-9a-f]{64}$/.test(snapshot.catalogDigest)
    || snapshot.routingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
    || !/^[0-9a-f]{64}$/.test(snapshot.routingDigest)
  ) {
    throw new Error('Agentic Canvas OS Skills & Commands routing metadata is not digest-verified.')
  }
  const catalog = resolveChatInvocationCatalogEntries('all', '')
  const commands = catalog.filter(entry => (
    sourceBacked(entry, 'command')
    && (entry.mcpTools || (entry.mcpTool ? [entry.mcpTool] : [])).includes(mcpTool)
  ))
  if (commands.length !== 1) {
    throw new Error(`Agentic Canvas OS did not resolve exactly one source-backed command for ${mcpTool}.`)
  }
  const command = commands[0]!
  const semantics = resolveRelatedEntries(catalog, command.semantics || [], 'semantic')
  const bindings = resolveRelatedEntries(catalog, command.bindings || [], 'binding')
  const tokens = [command.token, ...semantics.map(entry => entry.token), ...bindings.map(entry => entry.token)]
  const expectedProof = {
    sourceRevision: snapshot.sourceRevision,
    catalogDigest: snapshot.catalogDigest,
    routingSchema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
    routingDigest: snapshot.routingDigest,
  }
  const exactResolution = await invokeAgenticOsDocsMcpBridge({ invocationTokens: tokens, expectedProof })
  if (
    !isAgenticOsDocsMcpBridgeSuccessBoundToProof(exactResolution, tokens, expectedProof)
    || exactResolution.invocations.some(invocation => invocation.ok !== true)
  ) {
    throw new Error('Agentic Canvas OS docs MCP did not resolve the complete invocation tuple.')
  }
  return Object.freeze({
    mcpTool,
    invocation: Object.freeze({
      schema: 'knowgrph-knowledge-graph-invocation/v1',
      tool: mcpTool,
      action: command.token,
      semantics: Object.freeze(semantics.map(entry => entry.token)),
      bindings: Object.freeze(bindings.map(entry => entry.token)),
      sourceRevision: snapshot.sourceRevision,
      catalogDigest: snapshot.catalogDigest,
      routingSchema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
      routingDigest: snapshot.routingDigest,
    }),
    sourceRevision: snapshot.sourceRevision,
    catalogDigest: snapshot.catalogDigest,
    entries: Object.freeze([command, ...semantics, ...bindings]),
  })
}
