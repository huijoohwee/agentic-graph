import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { FLOW_RUN_ALL_PHASES } from '@/lib/storyboardWidget/runAllSequenceSsot'

function buildMarkdown(): string {
  const lines: string[] = []
  lines.push('# agentic-graph - Storyboard Widget Run All Sequence Reference (Runtime SSOT)')
  lines.push('')
  lines.push('App SSOT entrypoint: `canvas/src/lib/storyboardWidget/runAllSequenceSsot.ts`')
  lines.push('Generated file: `docs/documents/agentic-graph-flow-run-all-reference.md`.')
  lines.push('')
  lines.push('Validation fixture: pass an operator-owned Markdown file explicitly; do not default to sibling sandbox demo paths.')
  lines.push('')
  lines.push(...serializeMarkdownPipeTable({
    columns: ['Sequence', 'phase id', 'label'],
    rows: FLOW_RUN_ALL_PHASES.map((phase, index) => [index + 1, `\`${phase.id}\``, phase.label]),
  }))
  lines.push('')
  lines.push('Run-order policy:')
  lines.push(`- Execute in phase order: ${FLOW_RUN_ALL_PHASES.map(phase => phase.label).join(' -> ')}.`)
  lines.push('- Keep ordering stable by node position (`y`, then `x`, then `id`) inside each phase.')
  lines.push('- Prioritize scene images that feed video reference edges before other scene images.')
  lines.push('')
  lines.push('Computing-flow policy:')
  lines.push('- Run All reads connected widget inputs through the shared Storyboard Widget computing-flow helpers, not through renderer-local DOM state.')
  lines.push('- Each phase consumes and emits values by semantic port key and normalized schema path; duplicate visible labels must not collapse ports, fields, or connected values.')
  lines.push('- Empty `null` / `undefined` branch outputs are stop signals and must not be forwarded to downstream phases.')
  lines.push('- Generated widget outputs write into existing graph nodes only. Run All must not rewrite Storyboard Widget layout, rich-media panel frames, or edge topology while computing.')
  lines.push('- Once a Probe-Tree root has generated continuation cards, that root is lineage-only for Run All; selected child cards own their independent continuation runs.')
  lines.push('- Storyboard toolbar routing uses the Strybldr video handoff only for a graph identified as Strybldr. Other multi-Widget Storyboards dispatch to the shared workflow runner.')
  lines.push('')
  lines.push('Source-history policy:')
  lines.push('- Live graph publication is synchronous. Each completed node then performs one awaited durable active-source write; publication must not start a competing fire-and-forget source write.')
  lines.push('- A graph that is already serialized in the active Markdown source is an accepted no-op, not a rejected publication, and creates no duplicate document version.')
  lines.push('- Each changed stage records a GitGraph document version labeled `Run All i/n: <card>` or `Chat Run All i/n: <card>` so toolbar and LLM Chat runs remain traceable by card.')
  lines.push('')
  return lines.join('\n')
}

function main(): void {
  const filePath = fileURLToPath(import.meta.url)
  const rootDir = path.resolve(path.dirname(filePath), '../../..')
  const outputPath = path.join(rootDir, 'docs/documents/agentic-graph-flow-run-all-reference.md')
  fs.writeFileSync(outputPath, buildMarkdown(), 'utf8')
  process.stdout.write(`Wrote ${outputPath}\n`)
}

main()
