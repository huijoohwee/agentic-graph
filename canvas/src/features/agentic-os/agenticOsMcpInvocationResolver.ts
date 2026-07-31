import {
  getAgenticOsRemoteGrammarCatalogSnapshot,
  hydrateAgenticOsRemoteGrammarCatalogBySigils,
  type AgenticOsRemoteGrammarCatalogEntry,
} from './agenticOsRemoteGrammarClient'
import type { ChatInvocationCatalogEntry } from '@/features/chat/chatInvocationRegistry'
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

type AgenticOsSourceInvocationResolution = Readonly<{
  invocation: AgenticOsMcpInvocationPacket
  sourceRevision: string
  catalogDigest: string
  entries: readonly ChatInvocationCatalogEntry[]
}>

export type AgenticOsMcpInvocationResolution = AgenticOsSourceInvocationResolution & Readonly<{
  mcpTool: string
}>

export type AgenticOsCommandInvocationResolution = AgenticOsSourceInvocationResolution & Readonly<{
  command: string
}>

const MCP_TOOL = /^knowgrph\.[A-Za-z0-9_.-]+$/
const COMMAND_TOKEN = /^\/[A-Za-z0-9_.-]{1,96}$/
const PINNED_DICTIONARY_SOURCE = /\/blob\/[0-9a-f]{40}\/docs\/DICTIONARY-(?:COMMAND|SEMANTIC|BINDING)\.md#/i
const DICTIONARY_KINDS = new Set(['command', 'semantic', 'binding'])

const toCatalogEntry = (entry: AgenticOsRemoteGrammarCatalogEntry): ChatInvocationCatalogEntry | null => {
  const kind = String(entry.kind || '').trim().toLowerCase()
  const token = String(entry.token || '').trim()
  if (!DICTIONARY_KINDS.has(kind) || !token) return null
  const sourcePath = String(entry.sourceUrl || entry.sourcePath || '').trim()
  const mcpTools = [...new Set([
    ...(entry.mcpTools || []),
    entry.mcpTool || '',
  ].map(value => String(value || '').trim()).filter(Boolean))]
  return {
    id: `${kind}:${token.replace(/^[/#@]+/, '').replace(/[^A-Za-z0-9._-]+/g, '-').toLowerCase()}`,
    kind: kind as 'command' | 'semantic' | 'binding',
    token,
    label: String(entry.label || token).trim(),
    summary: String(entry.summary || entry.intent || '').trim(),
    group: `Agentic OS ${kind} dictionary`,
    sourcePath,
    keywords: [...new Set([
      ...(entry.keywords || []),
      String(entry.intent || '').trim(),
      sourcePath,
    ].filter(Boolean))],
    ...(mcpTools.length ? { mcpTool: mcpTools[0], mcpTools } : {}),
    ...(entry.semantics?.length ? { semantics: [...entry.semantics] } : {}),
    ...(entry.bindings?.length ? { bindings: [...entry.bindings] } : {}),
  }
}

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

const loadVerifiedSourceCatalog = async (): Promise<{
  catalog: readonly ChatInvocationCatalogEntry[]
  snapshot: ReturnType<typeof getAgenticOsRemoteGrammarCatalogSnapshot>
}> => {
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
  return {
    snapshot,
    catalog: snapshot.entries.map(toCatalogEntry).filter(Boolean) as readonly ChatInvocationCatalogEntry[],
  }
}

const resolveSourceBackedCommand = async (args: {
  target: string
  matches: (entry: ChatInvocationCatalogEntry) => boolean
}): Promise<AgenticOsSourceInvocationResolution> => {
  const { catalog, snapshot } = await loadVerifiedSourceCatalog()
  const commands = catalog.filter(entry => sourceBacked(entry, 'command') && args.matches(entry))
  if (commands.length !== 1) {
    throw new Error(`Agentic Canvas OS did not resolve exactly one source-backed command for ${args.target}.`)
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
    invocation: Object.freeze({
      schema: 'knowgrph-knowledge-graph-invocation/v1',
      tool: args.target,
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

export async function resolveAgenticOsMcpInvocation(
  mcpToolRaw: string,
): Promise<AgenticOsMcpInvocationResolution> {
  const mcpTool = String(mcpToolRaw || '').trim()
  if (!MCP_TOOL.test(mcpTool)) throw new Error('A canonical Knowgrph MCP tool name is required.')
  const resolution = await resolveSourceBackedCommand({
    target: mcpTool,
    matches: entry => (entry.mcpTools || (entry.mcpTool ? [entry.mcpTool] : [])).includes(mcpTool),
  })
  return Object.freeze({ mcpTool, ...resolution })
}

export async function resolveAgenticOsCommandInvocation(
  commandRaw: string,
): Promise<AgenticOsCommandInvocationResolution> {
  const command = String(commandRaw || '').trim()
  if (!COMMAND_TOKEN.test(command)) throw new Error('A canonical Agentic Canvas OS command token is required.')
  const resolution = await resolveSourceBackedCommand({
    target: command,
    matches: entry => entry.token.toLowerCase() === command.toLowerCase(),
  })
  return Object.freeze({ command, ...resolution })
}
