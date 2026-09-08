import fs from 'node:fs'
import path from 'node:path'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'

export type ResearchAgentDemoFixture = {
  path: string
  basename: string
  workspacePath: string
  sourceFile: string
  text: string
}

const DOCS_WORKSPACE_ROOT = '/docs'

const RESEARCH_AGENT_DEMO_SIGNATURES = [
  'agentic-graph-mainpanel-superagent-integrations-demo/v1',
  'superagent_harness_demo',
  'kgra_superagent_harness',
] as const

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

const findSemanticResearchAgentDemo = (rootPath: string): { path: string; text: string } | null => {
  for (const candidate of listMarkdownFiles(rootPath)) {
    const text = fs.readFileSync(candidate, 'utf8')
    if (textMatchesResearchAgentDemo(text)) return { path: candidate, text }
  }
  return null
}

export function readResearchAgentDemoFixture(): ResearchAgentDemoFixture {
  const explicitPath = String(process.env.AGENTIC_OS_RESEARCH_AGENT_DEMO_PATH || '').trim()
  const publishedDocsRoot = String(process.env.AGENTIC_OS_PUBLISHED_DOCS_ROOT || '').trim()
  const source = (() => {
    if (!explicitPath && publishedDocsRoot) {
      const found = findSemanticResearchAgentDemo(path.resolve(publishedDocsRoot))
      if (!found) throw new Error(`expected a research demo with signatures ${RESEARCH_AGENT_DEMO_SIGNATURES.join(', ')} under ${publishedDocsRoot}`)
      return found
    }
    // Product regression data owns the default. Published validation is explicit.
    const demoPath = explicitPath ? path.resolve(explicitPath) : resolveRepoTestDataPath('mainpanel-superagent-integration-regression.md')
    return { path: demoPath, text: fs.readFileSync(demoPath, 'utf8') }
  })()
  const { path: demoPath, text } = source
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
