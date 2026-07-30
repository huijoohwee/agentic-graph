import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string => {
  const p = resolve(process.cwd(), '..', repoRelativePath)
  return readFileSync(p, 'utf8')
}

const extractGeneratedSettingKeys = (document: string): string[] =>
  document
    .split('\n')
    .map(line => line.match(/^\| `([^`]+)` \|/)?.[1])
    .filter((key): key is string => Boolean(key))

export function testKgcPromptContractDocsUseCanonicalImplementedNames() {
  const mainPath = resolve(process.cwd(), '..', 'docs/documents/knowgrph-llm-prompt-contract-prd-tad.md')
  const companionPath = resolve(process.cwd(), '..', 'docs/documents/knowgrph-llm-prompt-contract-prd-tad.companion.md')
  const staleBaseName = 'knowgrph-llm-prompt-contract-prd-tad-' + 'proposed'
  const staleMainPath = resolve(process.cwd(), '..', `docs/documents/${staleBaseName}.md`)
  const staleCompanionPath = resolve(process.cwd(), '..', `docs/documents/${staleBaseName}.companion.md`)
  if (!existsSync(mainPath) || !existsSync(companionPath)) {
    throw new Error('Expected canonical KGC prompt contract docs to exist without proposed suffix')
  }
  if (existsSync(staleMainPath) || existsSync(staleCompanionPath)) {
    throw new Error('Expected stale KGC prompt contract proposed docs to be removed')
  }

  const technicalArchitecture = readRepoFile('docs/knowgrph-technical-architecture.md')
  const technicalArchitectureSettings = readRepoFile('docs/knowgrph-technical-architecture.settings.md')
  const referenceDocs = [
    readFileSync(mainPath, 'utf8'),
    readFileSync(companionPath, 'utf8'),
    technicalArchitecture,
    technicalArchitectureSettings,
    readRepoFile('docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.md'),
  ].join('\n')

  const required = [
    'id: knowgrph-llm-prompt-contract-prd-tad',
    'status: Accepted and implemented',
    'version: 0.3.4',
    'See continuation in `knowgrph-llm-prompt-contract-prd-tad.companion.md`',
    'canonical_doc: docs/documents/knowgrph-llm-prompt-contract-prd-tad.md',
    'Typed KGC semantic graph',
    'canvas/src/features/parsers/kgcSemanticGraph.ts',
    'canvas/src/lib/graph/kgcSemanticQuery.ts',
    'untyped legacy references such as `@node:n-trigger` are references only',
  ]
  required.forEach(snippet => {
    if (!referenceDocs.includes(snippet)) {
      throw new Error(`Expected canonical KGC prompt contract docs to include ${JSON.stringify(snippet)}`)
    }
  })
  if (referenceDocs.includes(staleBaseName)) {
    throw new Error('Expected KGC prompt contract references to avoid stale proposed document names')
  }

  const generatedSettingKeys = [
    ...extractGeneratedSettingKeys(technicalArchitecture),
    ...extractGeneratedSettingKeys(technicalArchitectureSettings),
  ]
  const uniqueGeneratedSettingKeys = new Set(generatedSettingKeys)
  if (generatedSettingKeys.length < 500 || uniqueGeneratedSettingKeys.size !== generatedSettingKeys.length) {
    throw new Error(
      `Expected split settings registry to retain at least 500 unique rows, got rows=${generatedSettingKeys.length} unique=${uniqueGeneratedSettingKeys.size}`,
    )
  }
  for (const [label, document] of [
    ['technical architecture part 1', technicalArchitecture],
    ['technical architecture part 2', technicalArchitectureSettings],
  ] as const) {
    const lineCount = document.split('\n').length
    if (lineCount > 600) {
      throw new Error(`Expected ${label} to stay within 600 lines, got ${lineCount}`)
    }
  }
}
