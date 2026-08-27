import { builtInParsers } from '@/features/parsers/default'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { restoreMissingOpeningYamlFrontmatterFence } from '@/lib/markdown/frontmatter'
import { sanitizeProvidedMarkdownPreviewTokensForFrontmatter } from '@/features/markdown/ui/useMarkdownPreviewTokens'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'

export function testMarkdownFrontmatterParseReportsYamlFailureWarnings() {
  const lines = splitMarkdownLines([
    '---',
    'title: "Broken',
    'flow:',
    '  direction: LR',
    '---',
    '',
    '# Body',
  ].join('\n'))

  const parsed = parseMarkdownFrontmatter(lines)
  if (parsed.startIndex !== 5) throw new Error(`expected frontmatter end index 5, got ${parsed.startIndex}`)
  if (Object.keys(parsed.meta).length !== 0) throw new Error('expected invalid frontmatter parse to fall back to empty meta')
  const warningBlob = parsed.warnings.join(' | ')
  if (!warningBlob.includes('Markdown frontmatter YAML parse failed and frontmatter was ignored:')) {
    throw new Error(`expected frontmatter parse failure warning, got: ${warningBlob}`)
  }
}

export function testMarkdownFrontmatterParseRepairsInlineComputeBlockScalarEnvelope() {
  const lines = splitMarkdownLines([
    '---',
    'title: "Recovered Flow"',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: "n-trigger"}',
    '      compute: {key: compute, type: function, value: |',
    '        (inputs) => ({',
    '          output: inputs.input ?? null',
    '        })',
    '      }',
    '  edges: []',
    '---',
    '',
    '# Body',
  ].join('\n'))

  const parsed = parseMarkdownFrontmatter(lines)
  const warningBlob = parsed.warnings.join(' | ')
  if (warningBlob.includes('Markdown frontmatter YAML parse failed and frontmatter was ignored:')) {
    throw new Error(`expected inline compute envelope to repair without dropping frontmatter, got: ${warningBlob}`)
  }
  const flow = parsed.meta.flow as { nodes?: Array<{ compute?: { value?: unknown } }> } | undefined
  const computeValue = flow?.nodes?.[0]?.compute?.value
  if (typeof computeValue !== 'string' || !computeValue.includes('inputs.input')) {
    throw new Error(`expected repaired compute block scalar value, got ${JSON.stringify(computeValue)}`)
  }
}

export function testMarkdownPreviewProvidedTokensDropFrontmatterLeak() {
  const leakedFrontmatterParagraph = {
    type: 'paragraph',
    text: 'title: "AgenticGraph Strybldr Starter Template" graphId: "md:agenticgraph-strybldr-starter-template"',
    startLine: 1,
    endLine: 42,
  } as unknown as TokenWithLines
  const bodyHeading = {
    type: 'heading',
    text: 'AgenticGraph Strybldr Starter Template',
    startLine: 45,
    endLine: 45,
  } as unknown as TokenWithLines

  const sanitized = sanitizeProvidedMarkdownPreviewTokensForFrontmatter(
    [leakedFrontmatterParagraph, bodyHeading],
    44,
  )

  if (sanitized.length !== 1 || sanitized[0] !== bodyHeading) {
    throw new Error('expected provided Markdown preview tokens to drop frontmatter-sourced blocks before Viewer rendering')
  }
}

export function testMarkdownFrontmatterRepairRestoresMissingOpeningFence() {
  const corrupted = [
    'title: "AgenticGraph Strybldr Starter Template"',
    'graphId: "md:agenticgraph-strybldr-starter-template"',
    'kgFrontmatterModeEnabled: true',
    '---',
    '',
    '# AgenticGraph Strybldr Starter Template',
  ].join('\n')

  const repaired = restoreMissingOpeningYamlFrontmatterFence(corrupted)
  if (!repaired.startsWith('---\ntitle: "AgenticGraph Strybldr Starter Template"')) {
    throw new Error('expected missing opening YAML frontmatter fence to be restored before editor/runtime sync')
  }
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(repaired))
  if (parsed.startIndex !== 5 || String(parsed.meta.graphId || '') !== 'md:agenticgraph-strybldr-starter-template') {
    throw new Error(`expected repaired YAML frontmatter to parse with canonical graphId, got ${JSON.stringify(parsed)}`)
  }

  const missingClosing = [
    '---',
    'title: "AgenticGraph Strybldr Starter Template"',
    'graphId: "md:agenticgraph-strybldr-starter-template"',
    'kgFrontmatterModeEnabled: true',
    '',
    '# AgenticGraph Strybldr Starter Template',
  ].join('\n')
  const repairedClosing = restoreMissingOpeningYamlFrontmatterFence(missingClosing)
  if (!repairedClosing.includes('kgFrontmatterModeEnabled: true\n---\n# AgenticGraph Strybldr Starter Template')) {
    throw new Error('expected missing closing YAML frontmatter fence to be restored before the Markdown body heading')
  }
}

export async function testMarkdownParserCarriesFrontmatterParseWarningsThroughParserResult() {
  const markdownSpec = builtInParsers.find(spec => String(spec.id) === 'markdown')
  if (!markdownSpec || typeof markdownSpec.parseAsync !== 'function') {
    throw new Error('expected built-in markdown parser parseAsync to be available')
  }

  const text = [
    '---',
    'title: "Broken',
    'summary: still invalid',
    '---',
    '',
    '# Frontmatter Warning',
    '',
    'Body paragraph.',
  ].join('\n')

  const result = await markdownSpec.parseAsync('frontmatter-warning.md', text)
  const warnings = Array.isArray(result?.warnings) ? result.warnings : []
  const warningBlob = warnings.join(' | ')
  if (!warningBlob.includes('Markdown frontmatter YAML parse failed and frontmatter was ignored:')) {
    throw new Error(`expected markdown parser result to include frontmatter parse warning, got: ${warningBlob}`)
  }
  if (!result.graphData || String(result.graphData.type || '') !== 'Graph') {
    throw new Error('expected markdown parser to still produce graph data after frontmatter parse warning')
  }
}
