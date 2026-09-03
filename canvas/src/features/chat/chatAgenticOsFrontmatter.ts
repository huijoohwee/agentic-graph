export type SplitFrontmatterBodyResult = {
  frontmatter: string
  body: string
}

const GENERIC_TEMPLATE_DOC_VAR_KEYS = new Set<string>(['variable', 'key'])

export const splitLeadingFrontmatterAndBody = (raw: string): SplitFrontmatterBodyResult | null => {
  const text = String(raw || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  let lead = 0
  while (lead < lines.length && !String(lines[lead] || '').trim()) lead += 1
  if (!/^---\s*$/.test(String(lines[lead] || ''))) return null
  for (let i = lead + 1; i < lines.length; i += 1) {
    if (!/^---\s*$/.test(String(lines[i] || ''))) continue
    return {
      frontmatter: lines.slice(lead + 1, i).join('\n'),
      body: lines.slice(i + 1).join('\n').trim(),
    }
  }
  return null
}

export const extractTopLevelYamlKeys = (frontmatter: string): Set<string> => {
  const keys = new Set<string>()
  const lines = String(frontmatter || '').split('\n')
  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]{0,48})\s*:\s*/.exec(line)
    if (!m) continue
    const key = String(m[1] || '').trim()
    if (!key) continue
    keys.add(key)
  }
  return keys
}

export const extractSecondLevelYamlKeys = (frontmatter: string, parentKey: string): Set<string> => {
  const out = new Set<string>()
  const text = String(frontmatter || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const parentLabel = `${String(parentKey || '').trim()}:`
  let startIdx = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (String(lines[i] || '').startsWith(parentLabel)) {
      startIdx = i
      break
    }
  }
  if (startIdx < 0) return out
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = String(lines[i] || '')
    if (!line.trim()) continue
    if (!/^\s+/.test(line)) break
    const m = /^\s{2}([A-Za-z_][A-Za-z0-9_-]{0,48})\s*:\s*/.exec(line)
    if (!m) continue
    const key = String(m[1] || '').trim()
    if (key) out.add(key)
  }
  return out
}

export const isFrontmatterVarKeyDeclared = (args: {
  frontmatter: string
  topLevelKeys: Set<string>
  varKey: string
  dottedParents?: string[]
}): boolean => {
  const key = String(args.varKey || '')
    .replace(/\\([|:])/g, '$1')
    .replace(/\\+$/g, '')
    .trim()
  if (!key) return false
  if (GENERIC_TEMPLATE_DOC_VAR_KEYS.has(key)) return true
  if (args.topLevelKeys.has(key)) return true
  const idxDot = key.indexOf('.')
  if (idxDot < 0) return false
  const parent = key.slice(0, idxDot).trim()
  const child = key.slice(idxDot + 1).trim()
  if (!parent || !child) return false
  const allowedParents = Array.isArray(args.dottedParents) && args.dottedParents.length
    ? new Set(args.dottedParents)
    : null
  if (allowedParents && !allowedParents.has(parent)) return false
  if (!args.topLevelKeys.has(parent)) return false
  // Allow canonical wildcard docs references like {{runtime.*}} in template prose.
  if (child === '*') return true
  const secondLevelKeys = extractSecondLevelYamlKeys(args.frontmatter, parent)
  return secondLevelKeys.has(child)
}
