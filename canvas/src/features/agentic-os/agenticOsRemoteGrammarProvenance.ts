const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/
const AGENTIC_CANVAS_OS_GITHUB_ORIGIN = 'https://github.com'
const AGENTIC_CANVAS_OS_BLOB_PATH_PATTERN = /^\/huijoohwee\/agentic-os\/blob\/(?:main|[0-9a-f]{40})\/catalog\/dictionaries\/(DICTIONARY-(?:COMMAND|SEMANTIC|BINDING)\.md)$/i
const DICTIONARY_REFERENCE_PATTERN = /^(DICTIONARY-(?:COMMAND|SEMANTIC|BINDING)\.md)(#.*)$/

type RemoteGrammarProvenanceEntry = {
  token?: unknown
  kind?: unknown
  sourcePath?: unknown
  sourceUrl?: unknown
}

type DictionaryReference = Readonly<{
  fileName: string
  fragment: string
}>

const normalizeString = (value: unknown): string => String(value || '').trim()

const expectedDictionaryReference = (tokenValue: unknown): Readonly<DictionaryReference & { kind: string }> | null => {
  const token = normalizeString(tokenValue)
  const kind = token.startsWith('/') ? 'command' : token.startsWith('#') ? 'semantic' : token.startsWith('@') ? 'binding' : ''
  const fileName = kind === 'command'
    ? 'DICTIONARY-COMMAND.md'
    : kind === 'semantic'
      ? 'DICTIONARY-SEMANTIC.md'
      : kind === 'binding'
        ? 'DICTIONARY-BINDING.md'
        : ''
  return fileName ? { fileName, fragment: `#${token}`, kind } : null
}

const parseRelativeDictionaryReference = (value: string): DictionaryReference | null => {
  const match = value.match(DICTIONARY_REFERENCE_PATTERN)
  return match ? { fileName: match[1]!, fragment: match[2]! } : null
}

const parseAgenticCanvasOsUrlReference = (value: string): DictionaryReference | null => {
  try {
    const parsed = new URL(value)
    if (parsed.origin !== AGENTIC_CANVAS_OS_GITHUB_ORIGIN
      || parsed.username
      || parsed.password
      || parsed.search) return null
    const pathMatch = parsed.pathname.match(AGENTIC_CANVAS_OS_BLOB_PATH_PATTERN)
    return pathMatch && parsed.hash ? { fileName: pathMatch[1]!, fragment: parsed.hash } : null
  } catch {
    return null
  }
}

const sameDictionaryReference = (left: DictionaryReference, right: DictionaryReference): boolean => (
  left.fileName === right.fileName && left.fragment === right.fragment
)

const rejectEntry = (token: string): never => {
  throw new Error(`Agentic OS remote grammar catalog provenance rejected token ${token || '<unknown>'}`)
}

export function normalizeAgenticOsRemoteGrammarCatalogProvenance<T extends RemoteGrammarProvenanceEntry>(
  entries: readonly T[],
  sourceRevisionValue: unknown,
): T[] {
  const sourceRevision = normalizeString(sourceRevisionValue)
  if (!SOURCE_REVISION_PATTERN.test(sourceRevision)) {
    throw new Error('Agentic OS remote grammar catalog provenance requires an exact source revision')
  }
  const sourceRootUrl = `${AGENTIC_CANVAS_OS_GITHUB_ORIGIN}/huijoohwee/agentic-os/blob/${sourceRevision}/catalog/dictionaries`

  return entries.map(entry => {
    const token = normalizeString(entry.token)
    const expected = expectedDictionaryReference(token)
    const kind = normalizeString(entry.kind).toLowerCase()
    if (!expected || (kind && kind !== expected.kind)) return rejectEntry(token)

    const sourcePathValue = normalizeString(entry.sourcePath)
    const sourceUrlValue = normalizeString(entry.sourceUrl)
    const sourcePathReference = sourcePathValue
      ? parseRelativeDictionaryReference(sourcePathValue) || parseAgenticCanvasOsUrlReference(sourcePathValue)
      : null
    const sourceUrlReference = sourceUrlValue ? parseAgenticCanvasOsUrlReference(sourceUrlValue) : null
    if ((sourcePathValue && !sourcePathReference)
      || (sourceUrlValue && !sourceUrlReference)
      || (!sourcePathReference && !sourceUrlReference)) return rejectEntry(token)
    if ((sourcePathReference && !sameDictionaryReference(sourcePathReference, expected))
      || (sourceUrlReference && !sameDictionaryReference(sourceUrlReference, expected))
      || (sourcePathReference && sourceUrlReference && !sameDictionaryReference(sourcePathReference, sourceUrlReference))) {
      return rejectEntry(token)
    }

    const sourcePath = `${expected.fileName}${expected.fragment}`
    return {
      ...entry,
      token,
      kind: expected.kind,
      sourcePath,
      sourceUrl: `${sourceRootUrl}/${sourcePath}`,
    }
  })
}
