import fs from 'node:fs'
import path from 'node:path'

export type ResearchAgentDemoFixture = {
  path: string
  basename: string
  workspacePath: string
  sourceFile: string
  text: string
}

const DOCS_WORKSPACE_ROOT = '/docs'

const RESEARCH_AGENT_DEMO_SIGNATURES = [
  'agenticgraph-mainpanel-superagent-integrations-demo/v1',
  'superagent_harness_demo',
  'kgra_superagent_harness',
] as const

const findAgenticGraphRoot = (startDir: string): string => {
  let current = path.resolve(startDir)
  for (let i = 0; i < 8; i += 1) {
    if (
      fs.existsSync(path.join(current, 'canvas', 'src')) &&
      fs.existsSync(path.join(current, 'agenticgraph_parser'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return path.resolve(startDir)
}

const listMarkdownFiles = (rootPath: string): string[] => {
  if (!fs.existsSync(rootPath)) return []
  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  return entries.flatMap(entry => {
    const nextPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) return listMarkdownFiles(nextPath)
    return entry.isFile() && nextPath.endsWith('.md') ? [nextPath] : []
  })
}

const textMatchesResearchAgentDemo = (text: string): boolean => {
  return RESEARCH_AGENT_DEMO_SIGNATURES.every(signature => text.includes(signature))
}

const findSemanticResearchAgentDemoPath = (rootPath: string): string | null => {
  for (const candidate of listMarkdownFiles(rootPath)) {
    const text = fs.readFileSync(candidate, 'utf8')
    if (textMatchesResearchAgentDemo(text)) return candidate
  }
  return null
}

export function resolveResearchAgentDemoPath(startDir = process.cwd()): string {
  const explicitPath = String(process.env.AGENTICGRAPH_RESEARCH_AGENT_DEMO_PATH || '').trim()
  if (explicitPath) return path.resolve(explicitPath)

  const agenticgraphRoot = findAgenticGraphRoot(startDir)
  const publishedDocsRoot = String(process.env.AGENTICGRAPH_PUBLISHED_DOCS_ROOT || '').trim()
  const searchRoots = [
    publishedDocsRoot ? path.resolve(publishedDocsRoot) : '',
    path.resolve(agenticgraphRoot, '..', 'huijoohwee', 'docs'),
    path.resolve(agenticgraphRoot, 'docs', 'documents'),
  ].filter(Boolean)

  for (const rootPath of searchRoots) {
    const found = findSemanticResearchAgentDemoPath(rootPath)
    if (found) return found
  }

  throw new Error(`expected a markdown demo with signatures ${RESEARCH_AGENT_DEMO_SIGNATURES.join(', ')} under ${searchRoots.join(', ') || startDir}`)
}

export function readResearchAgentDemoFixture(): ResearchAgentDemoFixture {
  const demoPath = resolveResearchAgentDemoPath()
  const text = fs.readFileSync(demoPath, 'utf8')
  if (!text.trim()) throw new Error(`expected research agent demo markdown at ${demoPath} to be non-empty`)
  if (!textMatchesResearchAgentDemo(text)) {
    throw new Error(`expected research agent demo markdown at ${demoPath} to expose the semantic demo signatures`)
  }
  const basename = path.basename(demoPath)
  const workspacePath = `${DOCS_WORKSPACE_ROOT}/${basename}`
  return {
    path: demoPath,
    basename,
    workspacePath,
    sourceFile: `workspace:${workspacePath}`,
    text,
  }
}
