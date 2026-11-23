// E4 coverage meta-contract: explicit accounting for non-literal source reads in
// video-agent family contract tests. `declared` paths participate in coverage
// assertions; `exempt` entries skip dynamic-read fail-loud accounting with a reason.
export type SourceContractReadManifestEntry = {
  file: string
  kind: 'declared' | 'exempt'
  paths?: readonly string[]
  reason: string
}

export const SOURCE_CONTRACT_READ_MANIFEST: readonly SourceContractReadManifestEntry[] = [
  {
    file: 'canvas/src/__tests__/videoAgentMediaProjection.test.ts',
    kind: 'declared',
    paths: [
      'canvas/src/components/StoryboardCanvas.tsx',
      'canvas/src/components/StoryboardWidget/WidgetEditorFormContent.tsx',
      'canvas/src/components/RichMediaPanelDirectMediaSurface.tsx',
    ],
    reason: 'literal-array loop with non-literal call site (readFileSync(resolve(process.cwd(), src, ...relativePath)))',
  },
  {
    file: 'canvas/src/__tests__/videoAgentValidationInput.test.ts',
    kind: 'exempt',
    reason: 'dynamic external validation-input directory scan and external doc path; no static product-source reads',
  },
  {
    file: 'canvas/src/__tests__/agenticVideoCanvasDemoRuntimeReady.test.ts',
    kind: 'exempt',
    reason: 'pinned sibling agentic-os docs (E3 separate batch); repo docs reads are auto-excluded by classification',
  },
]