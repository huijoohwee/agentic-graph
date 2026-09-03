import { filterTransientStreamingTraceFrontmatterWarnings } from '@/features/markdown-workspace/hooks/useMarkdownApply'

export function testMarkdownApplySuppressesTransientStreamingTraceFrontmatterWarnings() {
  const warnings = filterTransientStreamingTraceFrontmatterWarnings({
    warnings: [
      'Markdown frontmatter YAML parse failed and frontmatter was ignored: missed comma between flow collection entries (line 282, column 66); repair failed: missed comma between flow collection entries (line 282, column 66)',
      'Another warning',
    ],
    activeDocumentPath: '/docs/20260527T123654Z/agentic-os-trace_20260527T123654Z.md',
    streamingWorkspacePath: '/docs/20260527T123654Z/agentic-os-trace_20260527T123654Z.md',
  })
  if (warnings.length !== 1 || warnings[0] !== 'Another warning') {
    throw new Error(`expected streaming trace apply warnings to suppress only transient frontmatter parse warnings, got ${JSON.stringify(warnings)}`)
  }
}

export function testMarkdownApplyPreservesFrontmatterWarningsOutsideActiveStreamingTrace() {
  const warning = 'Markdown frontmatter YAML parse failed and frontmatter was ignored: missed comma between flow collection entries (line 282, column 66); repair failed: missed comma between flow collection entries (line 282, column 66)'
  const warnings = filterTransientStreamingTraceFrontmatterWarnings({
    warnings: [warning],
    activeDocumentPath: '/docs/20260527T123654Z/agenticOs_20260527T123654Z.md',
    streamingWorkspacePath: '/docs/20260527T123654Z/agentic-os-trace_20260527T123654Z.md',
  })
  if (warnings.length !== 1 || warnings[0] !== warning) {
    throw new Error(`expected non-streaming paths to preserve frontmatter parse warnings, got ${JSON.stringify(warnings)}`)
  }
}
