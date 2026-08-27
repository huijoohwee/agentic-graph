import { createBrowserSafeFunctionSource } from './browserFunctionSource.mjs'

export const createPublishedAgentReadyToolExecutors = (args = {}) => {
  const toolNames = args.toolNames || {}
  const defaultWorkspaceId = String(args.defaultWorkspaceId || '').trim()
  const buildStorageDocPath = args.buildStorageDocPath
  const fetchSourceFilesIndexResponse = args.fetchSourceFilesIndexResponse
  const fetchStorageMarkdownResponse = args.fetchStorageMarkdownResponse
  const resolveSharedDocumentInput = args.resolveSharedDocumentInput
  const inspectSharedDocumentStructure = args.inspectSharedDocumentStructure
  const buildAgentSurfaceInspection = args.buildAgentSurfaceInspection
  const normalizeString = (value) => String(value || '').trim()
  const publicBaseUrl = normalizeString(args.publicBaseUrl).replace(/\/+$/, '')
  const normalizeMarkdown = (value) => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const safeDecodeURIComponent = (value) => {
    try {
      return decodeURIComponent(String(value || ''))
    } catch {
      return String(value || '')
    }
  }
  const titleFromCanonicalPath = (canonicalPath) => {
    const pathParts = normalizeString(canonicalPath).split('/').filter(Boolean)
    return pathParts[pathParts.length - 1] || normalizeString(canonicalPath) || 'AgenticGraph Source File'
  }
  const truncateSnippet = (text, maxLength = 220) => {
    const normalized = normalizeString(text).replace(/\s+/g, ' ')
    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, maxLength - 1)}…`
  }
  const searchContentScanMax = Math.max(0, Math.min(50, Number.isFinite(Number(args.searchContentScanMax))
    ? Math.floor(Number(args.searchContentScanMax))
    : 32))
  const searchContentMaxChars = Math.max(1000, Math.min(50000, Number.isFinite(Number(args.searchContentMaxChars))
    ? Math.floor(Number(args.searchContentMaxChars))
    : 24000))
  const searchContentConcurrency = Math.max(1, Math.min(8, Number.isFinite(Number(args.searchContentConcurrency))
    ? Math.floor(Number(args.searchContentConcurrency))
    : 4))
  const SEARCH_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does',
    'for', 'from', 'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'the',
    'this', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with',
  ])
  const tokenizeSearchQuery = (query) =>
    normalizeString(query)
      .toLowerCase()
      .split(/[^a-z0-9:_./-]+/)
      .map(normalizeString)
      .filter((token) => token && !SEARCH_STOPWORDS.has(token))
  const countTokenHits = (haystack, tokens) =>
    tokens.reduce((sum, token) => {
      const normalizedHaystack = String(haystack || '')
      let count = 0
      let startIndex = 0
      while (startIndex < normalizedHaystack.length) {
        const nextIndex = normalizedHaystack.indexOf(token, startIndex)
        if (nextIndex < 0) break
        count += 1
        startIndex = nextIndex + Math.max(1, token.length)
      }
      return sum + count
    }, 0)
  const snippetAroundSearchHit = (text, tokens, maxLength = 260) => {
    const normalized = normalizeString(text).replace(/\s+/g, ' ')
    if (!normalized) return ''
    const lower = normalized.toLowerCase()
    const hitIndex = tokens
      .map((token) => lower.indexOf(token))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0]
    if (!Number.isFinite(hitIndex)) return truncateSnippet(normalized, maxLength)
    const start = Math.max(0, hitIndex - Math.floor(maxLength / 3))
    const end = Math.min(normalized.length, start + maxLength)
    return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`
  }
  const runBoundedConcurrent = async (items, worker) => {
    const results = new Array(items.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(searchContentConcurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await worker(items[index], index)
      }
    })
    await Promise.all(workers)
    return results
  }
  const buildPublicDocUrl = ({ workspaceId = '', canonicalPath = '' } = {}) => {
    const storagePath = buildStorageDocPath(
      normalizeString(canonicalPath),
      normalizeString(workspaceId),
    )
    return publicBaseUrl ? `${publicBaseUrl}${storagePath}` : storagePath
  }

  const requiresStorage = Boolean(
    toolNames.search
    || toolNames.fetch
    || toolNames.listSourceFiles
    || toolNames.readSourceFile
    || toolNames.readSharedDocument
    || toolNames.inspectSharedDocumentStructure,
  )
  if (requiresStorage && typeof buildStorageDocPath !== 'function') {
    throw new Error('buildStorageDocPath is required')
  }
  if ((toolNames.search || toolNames.listSourceFiles) && typeof fetchSourceFilesIndexResponse !== 'function') {
    throw new Error('fetchSourceFilesIndexResponse is required')
  }
  if ((toolNames.fetch || toolNames.readSourceFile || toolNames.readSharedDocument || toolNames.inspectSharedDocumentStructure) && typeof fetchStorageMarkdownResponse !== 'function') {
    throw new Error('fetchStorageMarkdownResponse is required')
  }
  if ((toolNames.readSharedDocument || toolNames.inspectSharedDocumentStructure) && typeof resolveSharedDocumentInput !== 'function') {
    throw new Error('resolveSharedDocumentInput is required')
  }
  if (toolNames.inspectSharedDocumentStructure && typeof inspectSharedDocumentStructure !== 'function') {
    throw new Error('inspectSharedDocumentStructure is required')
  }
  if (toolNames.inspectAgentSurface && typeof buildAgentSurfaceInspection !== 'function') {
    throw new Error('buildAgentSurfaceInspection is required')
  }

  const readSourceFile = async (input = {}) => {
    const canonicalPath = normalizeString(input.canonicalPath)
    if (!canonicalPath) {
      throw new Error('canonicalPath is required')
    }
    const workspaceId = normalizeString(input.workspaceId)
    const response = await fetchStorageMarkdownResponse(buildStorageDocPath(canonicalPath, workspaceId))
    if (!response.ok) {
      throw new Error(`read_source_file failed with ${response.status}`)
    }
    return {
      workspaceId: workspaceId || defaultWorkspaceId,
      canonicalPath,
      markdown: await response.text(),
    }
  }

  const readSharedDocument = async (input = {}) => {
    const resolvedDocument = resolveSharedDocumentInput(input)
    if (!resolvedDocument) {
      throw new Error('shareToken or shareUrl must resolve to a published AgenticGraph document')
    }
    const workspaceId = normalizeString(resolvedDocument.workspaceId)
    const canonicalPath = normalizeString(resolvedDocument.canonicalPath)
    const response = await fetchStorageMarkdownResponse(buildStorageDocPath(canonicalPath, workspaceId))
    if (!response.ok) {
      throw new Error(`read_shared_document failed with ${response.status}`)
    }
    return {
      workspaceId: workspaceId || defaultWorkspaceId,
      canonicalPath,
      markdown: await response.text(),
    }
  }

  const inspectSharedDocument = async (input = {}) => {
    const sharedDocument = await readSharedDocument(input)
    return inspectSharedDocumentStructure(sharedDocument)
  }

  const buildSearchFetchId = ({ workspaceId = '', canonicalPath = '' } = {}) =>
    `kgdoc:${encodeURIComponent(normalizeString(workspaceId))}:${encodeURIComponent(normalizeString(canonicalPath))}`

  const parseSearchFetchId = (id) => {
    const normalizedId = normalizeString(id)
    const stableMatch = normalizedId.match(/^kgdoc:([^:]*):(.*)$/)
    if (stableMatch) {
      return {
        workspaceId: safeDecodeURIComponent(stableMatch[1] || ''),
        canonicalPath: safeDecodeURIComponent(stableMatch[2] || ''),
      }
    }
    const workspaceDocMatch = normalizedId.match(/\/(?:api\/storage\/doc|agenticgraph\/doc)\/([^/\s)]+)\/([^\s)]+)$/)
    if (workspaceDocMatch) {
      return {
        workspaceId: safeDecodeURIComponent(workspaceDocMatch[1] || ''),
        canonicalPath: safeDecodeURIComponent(workspaceDocMatch[2] || ''),
      }
    }
    const defaultDocMatch = normalizedId.match(/\/(?:api\/storage\/doc-default|agenticgraph\/doc-default)\/([^\s)]+)$/)
    if (defaultDocMatch) {
      return {
        workspaceId: '',
        canonicalPath: safeDecodeURIComponent(defaultDocMatch[1] || ''),
      }
    }
    return null
  }

  const extractSearchEntriesFromSourceFilesIndex = (markdownIndex) => {
    const lines = normalizeMarkdown(markdownIndex).split('\n')
    const entriesById = new Map()
    const addEntry = ({ workspaceId = '', canonicalPath = '', line = '' } = {}) => {
      const normalizedCanonicalPath = normalizeString(canonicalPath)
      if (!normalizedCanonicalPath) return
      const normalizedWorkspaceId = normalizeString(workspaceId)
      const id = buildSearchFetchId({
        workspaceId: normalizedWorkspaceId,
        canonicalPath: normalizedCanonicalPath,
      })
      if (entriesById.has(id)) return
      entriesById.set(id, {
        id,
        title: titleFromCanonicalPath(normalizedCanonicalPath),
        url: buildPublicDocUrl({
          workspaceId: normalizedWorkspaceId,
          canonicalPath: normalizedCanonicalPath,
        }),
        snippet: truncateSnippet(line || normalizedCanonicalPath),
        workspaceId: normalizedWorkspaceId || defaultWorkspaceId,
        canonicalPath: normalizedCanonicalPath,
      })
    }
    for (const line of lines) {
      const workspacePattern = /\/(?:api\/storage\/doc|agenticgraph\/doc)\/([^/\s)\]]+)\/([^\s)\]]+)/g
      const defaultPattern = /\/(?:api\/storage\/doc-default|agenticgraph\/doc-default)\/([^\s)\]]+)/g
      for (const match of line.matchAll(workspacePattern)) {
        addEntry({
          workspaceId: safeDecodeURIComponent(match[1] || ''),
          canonicalPath: safeDecodeURIComponent(match[2] || ''),
          line,
        })
      }
      for (const match of line.matchAll(defaultPattern)) {
        addEntry({
          workspaceId: '',
          canonicalPath: safeDecodeURIComponent(match[1] || ''),
          line,
        })
      }
    }
    return Array.from(entriesById.values())
  }

  const searchSourceFiles = async (input = {}) => {
    const query = normalizeString(input.query)
    if (!query) {
      throw new Error('query is required')
    }
    const limit = Math.max(1, Math.min(25, Number.isFinite(Number(input.limit)) ? Math.floor(Number(input.limit)) : 10))
    const response = await fetchSourceFilesIndexResponse()
    if (!response.ok) {
      throw new Error(`search failed with ${response.status}`)
    }
    const markdownIndex = await response.text()
    const entries = extractSearchEntriesFromSourceFilesIndex(markdownIndex)
    const tokens = tokenizeSearchQuery(query)
    const queryPhrase = tokens.join(' ')
    const initialRanked = entries.map((entry) => {
      const haystack = `${entry.title}\n${entry.canonicalPath}\n${entry.workspaceId}\n${entry.snippet}`.toLowerCase()
      const phraseScore = queryPhrase && haystack.includes(queryPhrase) ? tokens.length * 4 : 0
      const tokenScore = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 2 : 0), 0)
      return { ...entry, score: phraseScore + tokenScore }
    })
    const contentCandidates = initialRanked
      .slice()
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, searchContentScanMax)
      .filter((entry) => /\.md(?:$|[?#])/i.test(entry.canonicalPath))
    const contentScores = new Map()
    await runBoundedConcurrent(contentCandidates, async (entry) => {
      const identity = parseSearchFetchId(entry.id)
      if (!identity?.canonicalPath) return null
      try {
        const response = await fetchStorageMarkdownResponse(buildStorageDocPath(identity.canonicalPath, identity.workspaceId))
        if (!response.ok) return null
        const markdown = (await response.text()).slice(0, searchContentMaxChars)
        const lowerMarkdown = markdown.toLowerCase()
        const phraseScore = queryPhrase && lowerMarkdown.includes(queryPhrase) ? tokens.length * 6 : 0
        const tokenHitCount = countTokenHits(lowerMarkdown, tokens)
        const score = phraseScore + tokenHitCount
        if (score <= 0) return null
        contentScores.set(entry.id, {
          score,
          snippet: snippetAroundSearchHit(markdown, tokens),
        })
      } catch {
        return null
      }
      return null
    })
    const ranked = initialRanked
      .map((entry) => {
        const contentScore = contentScores.get(entry.id)
        return {
          ...entry,
          score: entry.score + (contentScore?.score || 0),
          snippet: contentScore?.snippet || entry.snippet,
        }
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, limit)
      .map(({ score, ...entry }) => entry)
    return {
      ids: ranked.map((entry) => entry.id),
      results: ranked,
      query,
      totalResults: ranked.length,
    }
  }

  const fetchSourceFileBySearchId = async (input = {}) => {
    const identity = parseSearchFetchId(input.id)
    if (!identity?.canonicalPath) {
      throw new Error('id must be a stable AgenticGraph Source File id returned by search')
    }
    const sourceFile = await readSourceFile(identity)
    const url = buildPublicDocUrl(identity)
    return {
      id: buildSearchFetchId(identity),
      title: titleFromCanonicalPath(sourceFile.canonicalPath),
      content: sourceFile.markdown,
      text: sourceFile.markdown,
      url,
      metadata: {
        workspaceId: sourceFile.workspaceId,
        canonicalPath: sourceFile.canonicalPath,
        contentType: 'text/markdown',
        source: 'agenticgraph-source-files',
      },
    }
  }

  const executors = {}
  if (toolNames.search) executors[toolNames.search] = searchSourceFiles
  if (toolNames.fetch) executors[toolNames.fetch] = fetchSourceFileBySearchId
  if (toolNames.listSourceFiles) {
    executors[toolNames.listSourceFiles] = async () => {
      const response = await fetchSourceFilesIndexResponse()
      if (!response.ok) {
        throw new Error(`list_source_files failed with ${response.status}`)
      }
      return {
        workspaceId: defaultWorkspaceId,
        markdownIndex: await response.text(),
      }
    }
  }
  if (toolNames.readSourceFile) executors[toolNames.readSourceFile] = readSourceFile
  if (toolNames.readSharedDocument) executors[toolNames.readSharedDocument] = readSharedDocument
  if (toolNames.inspectSharedDocumentStructure) executors[toolNames.inspectSharedDocumentStructure] = inspectSharedDocument
  if (toolNames.inspectAgentSurface) executors[toolNames.inspectAgentSurface] = async () => buildAgentSurfaceInspection()
  return executors
}

export const PUBLISHED_AGENT_READY_TOOL_EXECUTORS_BROWSER_SOURCE =
  createBrowserSafeFunctionSource(createPublishedAgentReadyToolExecutors)
