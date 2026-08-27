export const KNOWGRPH_AGENT_READY_PROMPT_NAMES = Object.freeze({
  researchSourceFiles: 'knowgrph_research_source_files',
  inspectAgentSurface: 'knowgrph_inspect_agent_surface',
})

const normalizeString = (value) => String(value || '').trim()

const clonePrompt = (prompt) => ({
  ...prompt,
  arguments: Array.isArray(prompt.arguments)
    ? prompt.arguments.map((argument) => ({ ...argument }))
    : undefined,
  _meta: prompt._meta && typeof prompt._meta === 'object'
    ? {
        ...prompt._meta,
        tools: Array.isArray(prompt._meta.tools) ? [...prompt._meta.tools] : undefined,
      }
    : undefined,
})

const PROMPT_CONTRACTS = Object.freeze([
  Object.freeze({
    name: KNOWGRPH_AGENT_READY_PROMPT_NAMES.researchSourceFiles,
    title: 'Research Knowgrph Source Files',
    description: 'Guide an MCP host through read-only Knowgrph Source Files research using search and fetch with citation-ready URLs.',
    arguments: Object.freeze([
      Object.freeze({
        name: 'query',
        description: 'Research question or topic to pass to the read-only search tool.',
        required: true,
      }),
      Object.freeze({
        name: 'limit',
        description: 'Optional decimal string for the maximum search results to inspect.',
        required: false,
      }),
      Object.freeze({
        name: 'focus',
        description: 'Optional aspect to prioritize when reading fetched Source Files.',
        required: false,
      }),
    ]),
    _meta: Object.freeze({
      readOnly: true,
      tools: Object.freeze(['search', 'fetch']),
    }),
  }),
  Object.freeze({
    name: KNOWGRPH_AGENT_READY_PROMPT_NAMES.inspectAgentSurface,
    title: 'Inspect Knowgrph Agent Surface',
    description: 'Guide an MCP host through read-only inspection of Knowgrph agent, MCP, and MCP Apps readiness metadata.',
    arguments: Object.freeze([
      Object.freeze({
        name: 'focus',
        description: 'Optional readiness area to emphasize, such as transport, tools, resources, prompts, retrieval, or app metadata.',
        required: false,
      }),
    ]),
    _meta: Object.freeze({
      readOnly: true,
      tools: Object.freeze(['inspect_agent_surface']),
    }),
  }),
])

export const buildKnowgrphAgentReadyPromptContracts = () =>
  PROMPT_CONTRACTS.map(clonePrompt)

const findPromptContract = (name) =>
  PROMPT_CONTRACTS.find((prompt) => prompt.name === normalizeString(name)) || null

const readPromptArg = (args, name) => {
  if (!args || typeof args !== 'object') return ''
  return normalizeString(args[name])
}

const readRequiredPromptArg = (args, name) => {
  const value = readPromptArg(args, name)
  if (!value) {
    throw new Error(`Missing required prompt argument: ${name}`)
  }
  return value
}

const buildPromptMessage = (text) => ({
  role: 'user',
  content: {
    type: 'text',
    text,
  },
})

const buildSourceFilesResearchPromptText = (args = {}) => {
  const query = readRequiredPromptArg(args, 'query')
  const limit = readPromptArg(args, 'limit')
  const focus = readPromptArg(args, 'focus')
  return [
    `Research Knowgrph Source Files for: ${query}`,
    '',
    'Use the MCP server read-only retrieval path:',
    `1. Call search with query=${JSON.stringify(query)}${limit ? ` and limit=${JSON.stringify(limit)}` : ''}.`,
    '2. Select the most relevant returned ids and call fetch for each id before answering.',
    '3. Ground the answer in fetched markdown content and cite the returned result URLs when summarizing.',
    focus ? `4. Prioritize this focus: ${focus}.` : '',
    '',
    'Do not mutate graph, canvas, workspace, storage, or browser-local state for this research prompt.',
  ].filter(Boolean).join('\n')
}

const buildAgentSurfaceInspectionPromptText = (args = {}) => {
  const focus = readPromptArg(args, 'focus')
  return [
    'Inspect the Knowgrph agent-ready surface through the read-only inspect_agent_surface tool.',
    '',
    'Review health, API catalog, MCP server card, A2A card, agent skills, commerce discovery, and mcpAppsServerReadiness.',
    'For MCP Apps readiness, verify tool/resource linkage, output schema, text fallback, structured content, sandbox/security metadata, no-auth security-scheme mirroring, widget accessibility, prompts, search/fetch retrieval, Streamable HTTP, and local stdio support.',
    focus ? `Emphasize this readiness area: ${focus}.` : '',
    '',
    'Report checklist ids and evidence from structuredContent. Do not infer readiness from prose alone.',
  ].filter(Boolean).join('\n')
}

export const getKnowgrphAgentReadyPrompt = (name, args = {}) => {
  const contract = findPromptContract(name)
  if (!contract) {
    throw new Error(`Unknown Knowgrph MCP prompt: ${normalizeString(name)}`)
  }
  if (contract.name === KNOWGRPH_AGENT_READY_PROMPT_NAMES.researchSourceFiles) {
    return {
      description: contract.description,
      messages: [buildPromptMessage(buildSourceFilesResearchPromptText(args))],
    }
  }
  if (contract.name === KNOWGRPH_AGENT_READY_PROMPT_NAMES.inspectAgentSurface) {
    return {
      description: contract.description,
      messages: [buildPromptMessage(buildAgentSurfaceInspectionPromptText(args))],
    }
  }
  throw new Error(`Unhandled Knowgrph MCP prompt: ${contract.name}`)
}
