import { CHAT_TABLE_PERSISTENCE_CONTRACT_PROMPT } from './chatTablePersistenceContract'

export const CHAT_STORYBOARD_TEMPLATE_SCHEMA = 'agentic-os-2d-renderer-storyboard-template/v1'

export const CHAT_STORYBOARD_TEMPLATE_SLASH_ROUTES = [
  '/memory.seed',
  '/source.normalize',
  '/harness.define',
  '/canvas.project',
  '/runtime-ready.check',
  '/validation.run',
  '/deploy.guard',
] as const

export const CHAT_STORYBOARD_TEMPLATE_SEMANTIC_ROUTES = [
  '#frontmatter',
  '#harness',
  '#token-economics',
  '#runtime-ready',
  '#canvas',
  '#approval-gate',
  '#dev-only',
  '#no-hardcode',
] as const

export const CHAT_STORYBOARD_TEMPLATE_BINDING_ROUTES = [
  '@source.frontmatter',
  '@source.body',
  '@local-harness',
  '@runtime-proof',
  '@cost-log',
  '@canvas',
  '@operator',
  '@dev-only',
] as const

export const CHAT_STORYBOARD_TEMPLATE_CONTRACT_PROMPT = [
  'agentic-graph 2D RENDERER STORYBOARD TEMPLATE CONTRACT:',
  `- Align with schema \`${CHAT_STORYBOARD_TEMPLATE_SCHEMA}\` as structural guidance only; never clone template prose or generated fixture data.`,
  '- Plain no-slash chat stays Markdown/`response:` YAML; do not emit standalone AGENTIC_OS frontmatter unless a recognized runtime invocation selects the AGENTIC_OS contract.',
  '- Storyboard/frontmatter intent is data: `kgCanvasSurfaceMode: "2d"`, `kgCanvasRenderMode: "2d"`, `kgCanvas2dRenderer: "storyboard"`, `kgDocumentSemanticMode: "document"`, `kgFrontmatterModeEnabled: true`, `kgMultiDimTableModeEnabled: false`, and `kgStrybldrStoryboard: true`.',
  '- Runtime readiness is evidence-gated: `runtime_readiness.status` cannot become runtime-ready without local proof; keep paid calls at 0 and provider job IDs, stream URLs, generated asset URLs, and proof paths blank until returned evidence exists.',
  '- Publish is fail-closed: Prod mirror and Cloudflare remain blocked until explicit operator instruction.',
  '- Storyboard dataflow stages stay source-owned: Source -> Ideation -> Invocation -> Storyboard -> Runtime -> Publish, with `flow.nodes`, `flow.edges`, `flow_diagrams`, and `strybldr_storyboard.elements` describing the same workflow.',
  '- Semantic HTML projection uses `main`, `section`, `article`, `header`, `nav`, `aside`, `figure`, and `figcaption`; generic `div` is layout-only and never the primary surface boundary. Table DOM is derived at runtime from persisted Markdown pipe tables only.',
  CHAT_TABLE_PERSISTENCE_CONTRACT_PROMPT,
  '- Guardrails: no hardcoded source-specific media IDs, credentials, provider IDs, stream URLs, transcripts, generated assets, stale renderer aliases, downstream panel patches, or source-template backfill.',
].join('\n')

export const CHAT_STORYBOARD_TEMPLATE_AGENTIC_OS_DIRECTIVE_PROMPT = [
  'Storyboard template Agentic OS directive context:',
  `- Slash routes: ${CHAT_STORYBOARD_TEMPLATE_SLASH_ROUTES.join(', ')}.`,
  `- Semantic routes: ${CHAT_STORYBOARD_TEMPLATE_SEMANTIC_ROUTES.join(', ')}.`,
  `- Binding routes: ${CHAT_STORYBOARD_TEMPLATE_BINDING_ROUTES.join(', ')}.`,
  '- Recognized command outputs must stay inside the selected response contract; attached-media source analysis remains response-shaped, while only explicit computing-flow requests use the computing-flow scaffold.',
].join('\n')
