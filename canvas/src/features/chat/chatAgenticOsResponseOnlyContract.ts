export const AGENTIC_OS_RESPONSE_ONLY_SCHEMA = 'agentic-os-response/v1'

export const hasResponseOnlyAgenticOsMarker = (frontmatter: string): boolean => {
  return /(^|\n)agenticOsResponseOnly:\s*true\b/.test(String(frontmatter || ''))
}

export const isResponseOnlyAgenticOsFrontmatter = (frontmatter: string): boolean => {
  const text = String(frontmatter || '')
  return hasResponseOnlyAgenticOsMarker(text) &&
    /(^|\n)\$schema:\s*["']agentic-os-response\/v1["']/.test(text)
}

export const hasResponseOnlyAgenticOsBody = (markdownBody: string, forbiddenSections: readonly string[]): boolean => {
  const body = String(markdownBody || '').replace(/\r\n/g, '\n')
  if (!/(^|\n)## Response\s*(\n|$)/.test(body)) return false
  return !forbiddenSections.some(section => body.includes(section))
}

export const readResponseOnlyAgenticOsVariableLinkError = (args: {
  frontmatterKeys: ReadonlySet<string>
  refs: readonly string[]
  readRefKey: (ref: string) => string
}): string => {
  for (const key of ['title', 'graphId', 'doc_type', 'date', 'ai_model', 'response'] as const) {
    if (!args.frontmatterKeys.has(key)) return `Response-only AGENTIC_OS frontmatter is missing: ${key}.`
  }
  for (const ref of args.refs) {
    const key = args.readRefKey(ref)
    if (key && !args.frontmatterKeys.has(key)) return `Body variable {{${key}}} is not declared in YAML frontmatter.`
  }
  return ''
}
