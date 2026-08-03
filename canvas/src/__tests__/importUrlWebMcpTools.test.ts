import Ajv2020 from 'ajv/dist/2020.js'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { buildImportUrlWebMcpToolBuilders } from '@/features/agent-ready/importUrlWebMcpTools'
import { NativeImportUrlMutationError } from '@/features/chat/nativeImportUrlInvocation'

export async function testImportUrlWebMcpControlUsesCanonicalStructuredExecutor(): Promise<void> {
  const contracts = buildKnowgrphAgentReadyToolContracts({
    defaultWorkspaceId: 'kgws:test',
    includeBrowserOnlyTools: true,
  })
  const readOnlyCount = contracts.filter(contract => contract.annotations?.readOnlyHint === true).length
  const guardedControlCount = contracts.filter(contract => contract.annotations?.readOnlyHint === false).length
  if (contracts.length !== 46 || readOnlyCount !== 30 || guardedControlCount !== 16) {
    throw new Error(`expected 46 WebMCP tools split 30/16, got ${contracts.length} split ${readOnlyCount}/${guardedControlCount}`)
  }

  const toolId = KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalImportUrl
  if (toolId !== 'control_local_import_url') {
    throw new Error(`expected canonical Import URL tool id, got ${String(toolId)}`)
  }
  const contract = contracts.find(candidate => candidate.name === toolId)
  if (!contract || contract.webName !== 'knowgrph.control_local_import_url') {
    throw new Error('expected shared contract to expose knowgrph.control_local_import_url')
  }
  if (
    contract.annotations?.readOnlyHint !== false
    || contract.annotations?.destructiveHint !== true
    || contract.annotations?.openWorldHint !== true
    || contract.annotations?.idempotentHint !== false
  ) {
    throw new Error(`expected guarded open-world Import URL annotations, got ${JSON.stringify(contract.annotations)}`)
  }
  const ajv = new Ajv2020({ strict: false })
  const validateInput = ajv.compile(contract.inputSchema)
  if (validateInput({ url: 'https://example.com/', documentSemanticMode: 'document' })) {
    throw new Error('expected documentSemanticMode without canvas2dRenderer to fail schema validation')
  }
  if (!validateInput({ url: 'https://example.com/', canvas2dRenderer: 'design', documentSemanticMode: 'document' })) {
    throw new Error(`expected structured renderer input to validate, got ${JSON.stringify(validateInput.errors)}`)
  }
  const validateOutput = ajv.compile(contract.outputSchema)

  const calls: Record<string, unknown>[] = []
  const expectedResult = {
    source: 'https://example.com/',
    invocation: '/ingest-url @url:https://example.com/ @reference-policy #canvas',
    createdPaths: ['/example.md'],
    removedPaths: [],
    renderer: null,
    documentSemanticMode: null,
    outputText: '# URL imported',
  }
  const builders = buildImportUrlWebMcpToolBuilders(
    name => {
      const found = contracts.find(candidate => candidate.name === name)
      if (!found) throw new Error(`missing test contract ${name}`)
      return found
    },
    async input => {
      calls.push(input)
      return expectedResult
    },
  )
  const tool = builders[toolId]()
  const input = { url: 'https://example.com/' }
  const result = await tool.execute(input)
  if (tool.name !== 'knowgrph.control_local_import_url' || calls.length !== 1 || calls[0] !== input || result !== expectedResult) {
    throw new Error('expected Import URL WebMCP control to delegate once to the canonical structured executor')
  }
  if (!validateOutput(result)) {
    throw new Error(`expected typed Import URL output to validate, got ${JSON.stringify(validateOutput.errors)}`)
  }

  const expectedKnowledgeGraphResult = {
    kind: 'knowledge-graph' as const,
    source: 'https://github.com/example/repository',
    invocation: '/ingest-url @url:https://github.com/example/repository @reference-policy #canvas',
    renderer: null,
    documentSemanticMode: null,
    graphId: 'kg:graph:0123456789abcdef0123456789abcdef',
    snapshotDigest: 'a'.repeat(64),
    complete: true as const,
    counts: { sources: 3, nodes: 8, edges: 7 },
    projectionToken: 'kg:projection:0123456789abcdef01234567',
    projectionComplete: true,
    projectionTruncated: false,
    projectionLimit: 1_000,
    projectionCounts: { nodes: 8, edges: 7 },
    outputText: '# Knowledge graph imported',
  }
  const knowledgeGraphTool = buildImportUrlWebMcpToolBuilders(
    name => {
      const found = contracts.find(candidate => candidate.name === name)
      if (!found) throw new Error(`missing test contract ${name}`)
      return found
    },
    async () => expectedKnowledgeGraphResult,
  )[toolId]()
  const knowledgeGraphResult = await knowledgeGraphTool.execute({
    url: 'https://github.com/example/repository',
  }) as typeof expectedKnowledgeGraphResult
  if (knowledgeGraphResult !== expectedKnowledgeGraphResult || 'createdPaths' in knowledgeGraphResult) {
    throw new Error(`expected a path-free discriminated knowledge graph result, got ${JSON.stringify(knowledgeGraphResult)}`)
  }
  if (!validateOutput(knowledgeGraphResult)) {
    throw new Error(`expected knowledge graph Import URL output to validate, got ${JSON.stringify(validateOutput.errors)}`)
  }

  const expectedFailure = {
    status: 'error' as const,
    source: 'https://example.com/',
    invocation: '/ingest-url @url:https://example.com/ @reference-policy #canvas',
    createdPaths: ['/partial.md'],
    removedPaths: ['/replaced.md'],
    renderer: null,
    documentSemanticMode: null,
    mutationState: 'partial' as const,
    error: 'finalize failed',
    outputText: '# URL import failed\n\n- Inspect the workspace before retrying this non-idempotent import.',
  }
  const failureTool = buildImportUrlWebMcpToolBuilders(
    name => {
      const found = contracts.find(candidate => candidate.name === name)
      if (!found) throw new Error(`missing test contract ${name}`)
      return found
    },
    async () => {
      throw new NativeImportUrlMutationError(expectedFailure)
    },
  )[toolId]()
  const failureResult = await failureTool.execute(input)
  if (failureResult !== expectedFailure) {
    throw new Error(`expected WebMCP to return the typed partial-mutation result, got ${JSON.stringify(failureResult)}`)
  }
  if (!validateOutput(failureResult)) {
    throw new Error(`expected partial-mutation output to validate, got ${JSON.stringify(validateOutput.errors)}`)
  }
}
