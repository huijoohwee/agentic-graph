import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(process.cwd(), '..', repoRelativePath), 'utf8')

export function testAgentReadyDocsUseCanonicalImplementedContractNames() {
  const mainPath = resolve(process.cwd(), '..', 'docs/documents/knowgrph-agent-ready-prd-tad.md')
  const companionPath = resolve(process.cwd(), '..', 'docs/documents/knowgrph-agent-ready-prd-tad.companion.md')
  const runtimePath = resolve(process.cwd(), '..', 'docs/documents/knowgrph-agent-ready-prd-tad.runtime.md')
  if (!existsSync(mainPath) || !existsSync(companionPath) || !existsSync(runtimePath)) {
    throw new Error('Expected canonical agent-ready PRD/TAD and companion files to exist')
  }

  const docs = [
    readFileSync(mainPath, 'utf8'),
    readFileSync(companionPath, 'utf8'),
    readFileSync(runtimePath, 'utf8'),
    readRepoFile('docs/documents/knowgrph-agent-ready-webmcp-release-note-20260522.md'),
    readRepoFile('docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.md'),
  ].join('\n')

  const required = [
    'id: "md:knowgrph-agent-ready-prd-tad"',
    'doc_type: "Product and Technical Specification"',
    'owner: "cloudflare.pages.agent-ready.surface"',
    'companion: "docs/documents/knowgrph-agent-ready-prd-tad.companion.md"',
    'runtime_companion: "docs/documents/knowgrph-agent-ready-prd-tad.runtime.md"',
    '`knowgrph-agent-ready-prd-tad.companion.md`',
    '`knowgrph-agent-ready-prd-tad.runtime.md`',
    'parent: "docs/documents/knowgrph-agent-ready-prd-tad.md"',
    'owner: "docs.contract.evidence"',
    'owner: "docs.runtime.evidence"',
    '{{md:knowgrph-agent-ready-prd-tad}}',
  ]
  required.forEach(snippet => {
    if (!docs.includes(snippet)) {
      throw new Error(`Expected agent-ready docs to include ${JSON.stringify(snippet)}`)
    }
  })

  const staleId = 'knowgrph-agent-ready-prd-tad-' + 'proposed'
  if (docs.includes(staleId)) {
    throw new Error('Expected agent-ready docs to avoid stale proposed document identity')
  }

  const forbidden = [
    'status: implemented',
    'created: 2026-05-21',
    'updated: 2026-05-29',
    'updated: 2026-05-30',
  ]
  forbidden.forEach(snippet => {
    if (docs.includes(snippet)) {
      throw new Error(`Expected agent-ready docs to omit stale snippet ${JSON.stringify(snippet)}`)
    }
  })
}
