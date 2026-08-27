import fs from 'node:fs'
import path from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { isUnsafeFlowComputeSource, readFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'

const GITHUB_ROOT = path.resolve(process.cwd(), '..', '..')
const HUIJOOHWEE_DOCS_ROOT = path.join(GITHUB_ROOT, 'huijoohwee', 'docs')
const GUIDELINES_ROOT = path.join(GITHUB_ROOT, 'huijoohwee.github.io', 'guidelines')

const YAML_GUIDELINES_PATH = path.join(GUIDELINES_ROOT, 'yaml-frontmatter-guidelines.md')
const MARKDOWN_GUIDELINES_PATH = path.join(GUIDELINES_ROOT, 'markdown-syntax-guidelines.md')
const E2E_VIDEO_DOC_PATHS = [
  path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-video-demo.md'),
  path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-ralphthon-video-demo.md'),
]
const STORYBOARD_TYPED_WRAPPER_DOC_PATH = path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-storyboard-demo.md')
const STORYBOARD_PRODUCT_UI_TYPED_WRAPPER_DOC_PATH = path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-storyboard-product-ui-demo.md')
const STORYBOARD_NEUTRAL_CONTRACT_TYPED_WRAPPER_DOC_PATH = path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-storyboard-neutral-schema-contract-demo.md')
const STORYBOARD_WIDGET_COMPUTING_TEMPLATE_DOC_PATH = path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-storyboard-widget-computing-flow-template.md')
const MISSALPH_STORYBOARD_WIDGET_DEMO_DOC_PATH = path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-missalph-demo.md')
const APPROVED_STORYBOARD_TYPED_WRAPPER_DOC_PATHS = [
  STORYBOARD_TYPED_WRAPPER_DOC_PATH,
  STORYBOARD_PRODUCT_UI_TYPED_WRAPPER_DOC_PATH,
  STORYBOARD_NEUTRAL_CONTRACT_TYPED_WRAPPER_DOC_PATH,
]
const APPROVED_TYPED_WRAPPER_DOC_PATHS = [
  ...E2E_VIDEO_DOC_PATHS,
  ...APPROVED_STORYBOARD_TYPED_WRAPPER_DOC_PATHS,
  STORYBOARD_WIDGET_COMPUTING_TEMPLATE_DOC_PATH,
]
const E2E_TYPED_WRAPPER_DOC_SET = new Set(APPROVED_TYPED_WRAPPER_DOC_PATHS)
const CANONICAL_PLAIN_YAML_DOC_CONTRACTS = [
  { filePath: path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-animatic-demo.md'), renderer: 'gantt', requiresFlow: true },
  { filePath: path.join(HUIJOOHWEE_DOCS_ROOT, 'agenticgraph-storyboard-demo-index.md'), renderer: 'd3', requiresFlow: false },
] as const
const REQUIRED_FLOW_TYPED_SETTING_KEYS = ['direction', 'edgeType', 'snapToGrid', 'computed'] as const
const REQUIRED_STORYBOARD_WIDGET_TYPED_FIXTURE_PRESET: Record<string, string | boolean> = {
  kgCanvasSurfaceMode: '2d',
  kgCanvasRenderMode: '2d',
  kgCanvas2dRenderer: 'storyboard',
  kgDocumentSemanticMode: 'document',
  kgFrontmatterModeEnabled: true,
  kgMultiDimTableModeEnabled: false,
  kgDocumentStructureBaselineLock: false,
}
const REQUIRED_STORYBOARD_TYPED_FIXTURE_PRESET: Record<string, string | boolean> = {
  kgCanvasSurfaceMode: '2d',
  kgCanvasRenderMode: '2d',
  kgCanvas2dRenderer: 'storyboard',
  kgDocumentSemanticMode: 'document',
  kgFrontmatterModeEnabled: true,
  kgMultiDimTableModeEnabled: false,
  kgDocumentStructureBaselineLock: false,
}
const MISSALPH_SOURCE_INPUT_FIELDS = [
  'input_horizon',
  'input_portfolio',
  'input_factor_spec',
  'input_skew_pair',
  'input_macro_catalysts',
  'input_alpha_hypothesis',
  'input_coverage_scope',
  'input_signal_noise_threshold',
  'input_graph_topology_mode',
  'input_consensus_benchmark',
  'input_audience',
  'input_constraints',
  'input_tone',
  'input_metric_label',
] as const

type PlainRecord = Record<string, unknown>
type PublishedStoryboardWidgetDocContract = {
  filePath: string | null
  requiredSummaries: ReadonlyArray<readonly [string, string]>
  requiredNodeTypedFields?: ReadonlyArray<{
    nodeId: string
    fields: readonly string[]
  }>
  requiredNodeLeadingFields?: ReadonlyArray<{
    nodeId: string
    fields: readonly string[]
  }>
  requiredNodeTargetHandles?: ReadonlyArray<{
    nodeId: string
    handles: readonly string[]
  }>
  requiredRunActionInputs?: ReadonlyArray<{
    nodeId: string
    inputs: readonly string[]
  }>
  requiredBodyTokens?: ReadonlyArray<{
    nodeId: string
    tokens: readonly string[]
  }>
  requiredBlankNodeFields?: ReadonlyArray<{
    nodeId: string
    fields: readonly string[]
  }>
  forbiddenFragments?: readonly string[]
  optional: boolean
}

const listMarkdownFiles = (rootPath: string): string[] => {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  return entries.flatMap(entry => {
    const nextPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) return listMarkdownFiles(nextPath)
    return entry.isFile() && nextPath.endsWith('.md') ? [nextPath] : []
  })
}

const readUtf8 = (filePath: string): string => fs.readFileSync(filePath, 'utf8')

const toRepoRelativePath = (filePath: string): string => path.relative(GITHUB_ROOT, filePath)

const resolveMarkdownDocBySemanticFragments = (
  requiredFragments: readonly string[],
  args: { optional?: boolean } = {},
): string | null => {
  const candidates = listMarkdownFiles(HUIJOOHWEE_DOCS_ROOT)
  const found = candidates.find(filePath => {
    const text = readUtf8(filePath)
    return requiredFragments.every(fragment => text.includes(fragment))
  })
  if (found || args.optional) return found || null
  throw new Error(`Expected huijoohwee docs to contain a markdown document with semantic fragments: ${requiredFragments.join(', ')}`)
}

const isPlainRecord = (value: unknown): value is PlainRecord => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

const extractFrontmatterYamlText = (markdownText: string, filePath: string): string => {
  const text = String(markdownText || '')
  if (!text.startsWith('---\n')) {
    throw new Error(`Expected ${toRepoRelativePath(filePath)} to start with a YAML frontmatter block`)
  }
  const endMarkerIndex = text.indexOf('\n---\n', 4)
  if (endMarkerIndex < 0) {
    throw new Error(`Expected ${toRepoRelativePath(filePath)} to close its YAML frontmatter block with ---`)
  }
  return text.slice(4, endMarkerIndex)
}

const readFrontmatterParts = (filePath: string): { yamlText: string; bodyText: string; delimiterCount: number } => {
  const text = readUtf8(filePath)
  if (!text.startsWith('---\n')) {
    throw new Error(`Expected ${toRepoRelativePath(filePath)} to start with a YAML frontmatter block`)
  }
  const endMarkerIndex = text.indexOf('\n---\n', 4)
  if (endMarkerIndex < 0) {
    throw new Error(`Expected ${toRepoRelativePath(filePath)} to close its YAML frontmatter block with ---`)
  }
  return {
    yamlText: text.slice(4, endMarkerIndex),
    bodyText: text.slice(endMarkerIndex + '\n---\n'.length),
    delimiterCount: (text.match(/^---$/gm) || []).length,
  }
}

const readFrontmatterRecord = (filePath: string): PlainRecord => {
  const yamlText = extractFrontmatterYamlText(readUtf8(filePath), filePath)
  const parsed = parseYaml(yamlText)
  if (!isPlainRecord(parsed)) {
    throw new Error(`Expected ${toRepoRelativePath(filePath)} frontmatter to parse as an object`)
  }
  return parsed
}

const assertExactCanvasPreset = (
  filePath: string,
  meta: PlainRecord,
  expected: { renderer: string },
  violations: string[],
) => {
  const requiredPreset: Record<string, string | boolean> = {
    kgCanvasSurfaceMode: '2d',
    kgCanvasRenderMode: '2d',
    kgCanvas2dRenderer: expected.renderer,
    kgDocumentSemanticMode: 'document',
    kgFrontmatterModeEnabled: true,
    kgMultiDimTableModeEnabled: false,
    kgDocumentStructureBaselineLock: false,
  }
  for (const [key, value] of Object.entries(requiredPreset)) {
    if (meta[key] !== value) {
      violations.push(
        `${toRepoRelativePath(filePath)} expected ${key}=${JSON.stringify(value)} but found ${JSON.stringify(meta[key])}`,
      )
    }
  }
}

const isTypedValueWrapper = (value: unknown, expectedKey?: string): value is { key: string; type: string; value: unknown } => {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.length !== 3 || keys[0] !== 'key' || keys[1] !== 'type' || keys[2] !== 'value') return false
  if (typeof value.key !== 'string' || !value.key.trim()) return false
  if (typeof value.type !== 'string' || !value.type.trim()) return false
  if (expectedKey && value.key !== expectedKey) return false
  return true
}

const listTypedWrapperMarkdownDocs = (): string[] => {
  return listMarkdownFiles(HUIJOOHWEE_DOCS_ROOT).filter(filePath => readUtf8(filePath).includes('{key:'))
}

const validateTypedWrapperFixtureFrontmatter = (
  filePath: string,
  violations: string[],
  requiredPreset: Record<string, string | boolean>,
) => {
  const meta = readFrontmatterRecord(filePath)
  for (const [key, expected] of Object.entries(requiredPreset)) {
    if (meta[key] !== expected) {
      violations.push(
        `${toRepoRelativePath(filePath)} expected ${key}=${JSON.stringify(expected)} but found ${JSON.stringify(meta[key])}`,
      )
    }
  }

  const flow = meta.flow
  if (!isPlainRecord(flow)) {
    violations.push(`${toRepoRelativePath(filePath)} expected frontmatter.flow to be an object`)
    return
  }

  for (const key of REQUIRED_FLOW_TYPED_SETTING_KEYS) {
    if (!isTypedValueWrapper(flow[key], key)) {
      violations.push(`${toRepoRelativePath(filePath)} expected flow.${key} to use a {key, type, value} wrapper`)
    }
  }

  if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) {
    violations.push(`${toRepoRelativePath(filePath)} expected flow.nodes to contain typed-wrapper nodes`)
  } else {
    flow.nodes.forEach((node, index) => {
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(filePath)} expected flow.nodes[${index}] to be an object`)
        return
      }
      for (const [key, value] of Object.entries(node)) {
        if (!isTypedValueWrapper(value, key)) {
          violations.push(
            `${toRepoRelativePath(filePath)} expected flow.nodes[${index}].${key} to use a {key, type, value} wrapper`,
          )
        }
      }
    })
  }

  if (!Array.isArray(flow.edges) || flow.edges.length === 0) {
    violations.push(`${toRepoRelativePath(filePath)} expected flow.edges to remain present for Canvas rendering`)
  }
}

export function testHuijoohweeDocsAndGuidelinesForbidAbsoluteRepoPathHardcodes() {
  const targets = [
    ...listMarkdownFiles(HUIJOOHWEE_DOCS_ROOT),
    YAML_GUIDELINES_PATH,
    MARKDOWN_GUIDELINES_PATH,
  ]
  const forbiddenNeedles = [
    `file:///${'Users'}/`,
    `/${'Users'}/`,
  ]
  const violations: Array<{ file: string; needle: string }> = []
  for (const filePath of targets) {
    const text = readUtf8(filePath)
    for (const needle of forbiddenNeedles) {
      if (text.includes(needle)) {
        violations.push({
          file: toRepoRelativePath(filePath),
          needle,
        })
        break
      }
    }
  }
  if (violations.length > 0) {
    const msg = violations.map(v => `${v.file} contains ${JSON.stringify(v.needle)}`).join('\n')
    throw new Error(`Expected docs/guidelines to avoid machine-local repo path hardcodes:\n${msg}`)
  }
}

export function testE2EVideoFixturesUseTypedFrontmatterValueWrappers() {
  const violations: string[] = []
  const typedWrapperDocs = listTypedWrapperMarkdownDocs()
  const unexpectedTypedWrapperDocs = typedWrapperDocs
    .filter(filePath => !E2E_TYPED_WRAPPER_DOC_SET.has(filePath))
    .map(filePath => `${toRepoRelativePath(filePath)} uses {key, type, value} wrappers outside the approved E2E fixture set`)
  const missingTypedWrapperDocs = E2E_VIDEO_DOC_PATHS
    .filter(filePath => !typedWrapperDocs.includes(filePath))
    .map(filePath => `${toRepoRelativePath(filePath)} is missing typed-wrapper frontmatter content`)

  violations.push(...unexpectedTypedWrapperDocs, ...missingTypedWrapperDocs)

  for (const filePath of E2E_VIDEO_DOC_PATHS) {
    validateTypedWrapperFixtureFrontmatter(filePath, violations, REQUIRED_STORYBOARD_WIDGET_TYPED_FIXTURE_PRESET)
  }

  if (violations.length > 0) {
    throw new Error(`Expected normalized E2E fixtures to keep typed frontmatter value wrappers:\n${violations.join('\n')}`)
  }
}

export function testStoryboardDemoUsesTypedFrontmatterValueWrappers() {
  const violations: string[] = []
  const typedWrapperDocs = listTypedWrapperMarkdownDocs()
  for (const filePath of APPROVED_STORYBOARD_TYPED_WRAPPER_DOC_PATHS) {
    if (!typedWrapperDocs.includes(filePath)) {
      violations.push(`${toRepoRelativePath(filePath)} is missing typed-wrapper frontmatter content`)
      continue
    }
    validateTypedWrapperFixtureFrontmatter(filePath, violations, REQUIRED_STORYBOARD_TYPED_FIXTURE_PRESET)
  }

  const meta = readFrontmatterRecord(STORYBOARD_TYPED_WRAPPER_DOC_PATH)
  const flow = meta.flow
  if (!isPlainRecord(flow)) {
    violations.push(`${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected frontmatter.flow to be an object`)
  } else {
    for (const key of ['direction', 'edgeType', 'balancedViewportPreset'] as const) {
      if (!isTypedValueWrapper(flow[key], key)) {
        violations.push(`${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected flow.${key} to use a {key, type, value} wrapper`)
      }
    }
    if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) {
      violations.push(`${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected flow.nodes to contain typed-wrapper nodes`)
    } else {
      flow.nodes.forEach((node, index) => {
        if (!isPlainRecord(node)) {
          violations.push(`${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected flow.nodes[${index}] to be an object`)
          return
        }
        for (const [key, value] of Object.entries(node)) {
          if (!isTypedValueWrapper(value, key)) {
            violations.push(
              `${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected flow.nodes[${index}].${key} to use a {key, type, value} wrapper`,
            )
          }
        }
      })
      const targetNode = flow.nodes.find(node => isPlainRecord(node) && isTypedValueWrapper(node.id, 'id') && node.id.value === 'SCENE_03')
      if (!isPlainRecord(targetNode) || !isTypedValueWrapper(targetNode.position, 'position')) {
        violations.push(`${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected SCENE_03 to expose wrapped position metadata`)
      } else if (JSON.stringify(targetNode.position.value) !== JSON.stringify({ x: 0, y: -720 })) {
        violations.push(
          `${toRepoRelativePath(STORYBOARD_TYPED_WRAPPER_DOC_PATH)} expected SCENE_03.position to equal {"x":0,"y":-720} but found ${JSON.stringify(targetNode.position.value)}`,
        )
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`Expected storyboard demo to keep normalized typed frontmatter value wrappers:\n${violations.join('\n')}`)
  }
}

export function testCanonicalAnimaticAndStoryboardDocsUsePlainYamlFrontmatter() {
  const violations: string[] = []

  for (const { filePath, renderer, requiresFlow } of CANONICAL_PLAIN_YAML_DOC_CONTRACTS) {
    const text = readUtf8(filePath)
    const meta = readFrontmatterRecord(filePath)
    assertExactCanvasPreset(filePath, meta, { renderer }, violations)

    if (text.includes('{key:')) {
      violations.push(`${toRepoRelativePath(filePath)} must keep canonical docs in plain YAML and avoid {key, type, value} wrappers`)
    }

    if (requiresFlow) {
      const flow = meta.flow
      if (!isPlainRecord(flow)) {
        violations.push(`${toRepoRelativePath(filePath)} expected frontmatter.flow to stay present as a plain YAML object`)
      } else {
        if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) {
          violations.push(`${toRepoRelativePath(filePath)} expected flow.nodes to stay present in canonical plain YAML`)
        }
        const firstNode = Array.isArray(flow.nodes) ? flow.nodes[0] : null
        if (!isPlainRecord(firstNode) || typeof firstNode.id !== 'string') {
          violations.push(`${toRepoRelativePath(filePath)} expected canonical flow.nodes[*].id values to stay plain YAML scalars`)
        }
      }
    } else if ('flow' in meta) {
      violations.push(`${toRepoRelativePath(filePath)} should remain an index-style document without an unnecessary flow block`)
    }
  }

  if (violations.length > 0) {
    throw new Error(`Expected canonical animatic/storyboard docs to keep explicit plain-YAML frontmatter presets:\n${violations.join('\n')}`)
  }
}

export function testGuidelinesDescribeCanonicalAndNormalizedFrontmatterContracts() {
  const yamlGuidelines = readUtf8(YAML_GUIDELINES_PATH)
  const markdownGuidelines = readUtf8(MARKDOWN_GUIDELINES_PATH)
  const yamlRequired = [
    'Canonical authored Markdown stays plain YAML for source-of-truth authoring',
    'E2E ingestion and rendering fixtures may use a normalized typed wrapper shape after parsing',
    'Use `{key, type, value}` wrappers only in normalized validation fixtures',
  ]
  const markdownRequired = [
    'Canonical authored Markdown uses plain YAML scalars, arrays, and objects in the `flow:` block.',
    'Normalized E2E pipeline fixtures may wrap individual values as `{key, type, value}` after parsing',
    '- id: {key: id, type: string, value: "w-text-script"}',
  ]
  const missing = [
    ...yamlRequired.filter(snippet => !yamlGuidelines.includes(snippet)).map(snippet => `yaml-frontmatter-guidelines.md missing ${JSON.stringify(snippet)}`),
    ...markdownRequired.filter(snippet => !markdownGuidelines.includes(snippet)).map(snippet => `markdown-syntax-guidelines.md missing ${JSON.stringify(snippet)}`),
  ]
  if (missing.length > 0) {
    throw new Error(`Expected guidelines to describe canonical authoring and normalized E2E frontmatter contracts:\n${missing.join('\n')}`)
  }
}

export function testPublishedStoryboardWidgetDocsKeepFrontmatterAsMachineSsot() {
  const contracts: PublishedStoryboardWidgetDocContract[] = [
    {
      filePath: resolveMarkdownDocBySemanticFragments([
        'agenticgraph-mainpanel-superagent-integrations-demo/v1',
        'kgra_superagent_harness',
        'swarm_prediction_world',
        'panel_text_research_brief',
      ]),
      requiredSummaries: [
        ['kgra_superagent_harness', 'swarm simulation task slices'],
        ['swarm_prediction_world', 'bounded deterministic world simulation'],
        ['panel_text_research_brief', 'staged research brief'],
      ],
      optional: false,
    },
    {
      filePath: STORYBOARD_WIDGET_COMPUTING_TEMPLATE_DOC_PATH,
      requiredSummaries: [
        ['source_input', 'granular query, context, audience, format, constraints, evidence, tone, metric label, and metric target inputs'],
        ['compute_summary', 'semantic ports for granular inputs'],
        ['panel_chart_output', 'outputSrcDoc field'],
      ],
      requiredNodeTypedFields: [
        {
          nodeId: 'source_input',
          fields: [
            'input_query',
            'input_context',
            'input_audience',
            'input_format',
            'input_constraints',
            'input_evidence',
            'input_tone',
            'input_metric_label',
            'input_metric_target',
          ],
        },
      ],
      requiredNodeLeadingFields: [
        {
          nodeId: 'source_input',
          fields: [
            'label',
            'position',
            'input_query',
            'input_context',
            'input_audience',
            'input_format',
            'input_constraints',
            'input_evidence',
            'input_tone',
            'input_metric_label',
            'input_metric_target',
          ],
        },
      ],
      requiredNodeTargetHandles: [
        {
          nodeId: 'compute_summary',
          handles: [
            'input_query',
            'input_context',
            'input_audience',
            'input_format',
            'input_constraints',
            'input_evidence',
            'input_tone',
            'input_metric_label',
            'input_metric_target',
          ],
        },
      ],
      requiredBlankNodeFields: [
        {
          nodeId: 'compute_summary',
          fields: ['output', 'imageUrl', 'outputSrcDoc'],
        },
      ],
      forbiddenFragments: [
        'Computed output',
        '500-word baseline',
      ],
      optional: false,
    },
    {
      filePath: MISSALPH_STORYBOARD_WIDGET_DEMO_DOC_PATH,
      requiredSummaries: [
        ['source_input', 'Alpha discovery source'],
        ['compute_summary', 'Synthesises alpha signals'],
        ['panel_alpha_map', 'knowledge-graph canvas'],
      ],
      requiredNodeTypedFields: [
        {
          nodeId: 'source_input',
          fields: MISSALPH_SOURCE_INPUT_FIELDS,
        },
      ],
      requiredNodeTargetHandles: [
        {
          nodeId: 'compute_summary',
          handles: MISSALPH_SOURCE_INPUT_FIELDS,
        },
      ],
      requiredRunActionInputs: [
        {
          nodeId: 'compute_summary',
          inputs: MISSALPH_SOURCE_INPUT_FIELDS,
        },
      ],
      requiredBodyTokens: [
        {
          nodeId: 'compute_summary',
          tokens: MISSALPH_SOURCE_INPUT_FIELDS.map(field => `source_input.${field}`),
        },
      ],
      forbiddenFragments: [
        'Frontmatter keeps',
        'AI Pipeline',
        'Recompute:',
      ],
      optional: false,
    },
    {
      filePath: resolveMarkdownDocBySemanticFragments([
        'horizon, portfolio weights',
        'typed compute function',
        'iframe srcdoc',
        'panel_chart_output',
      ], { optional: true }),
      requiredSummaries: [
        ['source_input', 'horizon, portfolio weights'],
        ['compute_summary', 'typed compute function'],
        ['panel_chart_output', 'iframe srcdoc'],
      ],
      optional: true,
    },
  ]
  const violations: string[] = []

  for (const contract of contracts) {
    if (!contract.filePath) continue
    if (contract.optional && !fs.existsSync(contract.filePath)) continue
    const { yamlText, bodyText, delimiterCount } = readFrontmatterParts(contract.filePath)
    if (delimiterCount !== 2) {
      violations.push(`${toRepoRelativePath(contract.filePath)} expected exactly one opening YAML frontmatter block`)
    }
    if (/(^|\n)## KGC Reading Layer\b/.test(bodyText)) {
      violations.push(`${toRepoRelativePath(contract.filePath)} must not keep a body-side KGC Reading Layer`)
    }
    if (/(^|\n)@(?:node|edge):/.test(bodyText)) {
      violations.push(`${toRepoRelativePath(contract.filePath)} must not keep body-side @node/@edge graph mirrors`)
    }
    if (/(^|\n)flow:\s*(\n|$)/.test(bodyText)) {
      violations.push(`${toRepoRelativePath(contract.filePath)} must not keep body-side flow: graph mirrors`)
    }
    for (const fragment of contract.forbiddenFragments || []) {
      if (yamlText.includes(fragment) || bodyText.includes(fragment)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} must not keep stale generated fragment ${JSON.stringify(fragment)}`)
      }
    }

    const meta = parseYaml(yamlText)
    if (!isPlainRecord(meta) || !isPlainRecord(meta.flow) || !Array.isArray(meta.flow.nodes)) {
      violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter.flow.nodes to own Storyboard Widget nodes`)
      continue
    }
    for (const [nodeId, expectedFragment] of contract.requiredSummaries) {
      const node = meta.flow.nodes.find(candidate => {
        if (!isPlainRecord(candidate)) return false
        const idField = candidate.id
        return isPlainRecord(idField) && idField.value === nodeId
      })
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter node ${nodeId}`)
        continue
      }
      const summary = node['kgc:readingSummary']
      if (!isPlainRecord(summary) || !String(summary.value || '').includes(expectedFragment)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected node ${nodeId} to own kgc:readingSummary containing ${JSON.stringify(expectedFragment)}`)
      }
    }

    for (const required of contract.requiredNodeTypedFields || []) {
      const node = meta.flow.nodes.find(candidate => {
        if (!isPlainRecord(candidate)) return false
        const idField = candidate.id
        return isPlainRecord(idField) && idField.value === required.nodeId
      })
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter node ${required.nodeId}`)
        continue
      }
      for (const fieldKey of required.fields) {
        if (!isTypedValueWrapper(node[fieldKey], fieldKey)) {
          violations.push(`${toRepoRelativePath(contract.filePath)} expected node ${required.nodeId}.${fieldKey} to use a {key,type,value} KTV wrapper`)
        }
      }
    }

    for (const required of contract.requiredNodeLeadingFields || []) {
      const node = meta.flow.nodes.find(candidate => {
        if (!isPlainRecord(candidate)) return false
        const idField = candidate.id
        return isPlainRecord(idField) && idField.value === required.nodeId
      })
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter node ${required.nodeId}`)
        continue
      }
      const fieldKeys = Object.keys(node).filter(key => key !== 'id' && key !== 'type')
      const leading = fieldKeys.slice(0, required.fields.length)
      if (leading.join('\n') !== required.fields.join('\n')) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected node ${required.nodeId} to expose granular KTV input fields before metadata rows`)
      }
    }

    for (const required of contract.requiredNodeTargetHandles || []) {
      const edges = Array.isArray(meta.flow.edges) ? meta.flow.edges : []
      const connectedTargetHandles = new Set<string>()
      for (const edge of edges) {
        if (!isPlainRecord(edge)) continue
        const target = edge.target
        const targetHandle = edge.targetHandle
        if (
          isTypedValueWrapper(target, 'target')
          && target.value === required.nodeId
          && isTypedValueWrapper(targetHandle, 'targetHandle')
          && typeof targetHandle.value === 'string'
        ) {
          connectedTargetHandles.add(targetHandle.value)
        }
      }
      for (const handle of required.handles) {
        if (!connectedTargetHandles.has(handle)) {
          violations.push(`${toRepoRelativePath(contract.filePath)} expected node ${required.nodeId} target handle ${handle} to be connected by a typed edge`)
        }
      }
    }

    for (const required of contract.requiredRunActionInputs || []) {
      const node = meta.flow.nodes.find(candidate => {
        if (!isPlainRecord(candidate)) return false
        const idField = candidate.id
        return isPlainRecord(idField) && idField.value === required.nodeId
      })
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter node ${required.nodeId}`)
        continue
      }
      const runAction = node['canvas:runAction']
      const value = isTypedValueWrapper(runAction, 'canvas:runAction') && isPlainRecord(runAction.value) ? runAction.value : null
      const inputs = new Set(Array.isArray(value?.inputs) ? value.inputs.map(input => String(input || '')) : [])
      for (const input of required.inputs) {
        if (!inputs.has(input)) {
          violations.push(`${toRepoRelativePath(contract.filePath)} expected node ${required.nodeId} canvas:runAction.inputs to include ${input}`)
        }
      }
    }

    for (const required of contract.requiredBodyTokens || []) {
      const node = meta.flow.nodes.find(candidate => {
        if (!isPlainRecord(candidate)) return false
        const idField = candidate.id
        return isPlainRecord(idField) && idField.value === required.nodeId
      })
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter node ${required.nodeId}`)
        continue
      }
      const runAction = node['canvas:runAction']
      const value = isTypedValueWrapper(runAction, 'canvas:runAction') && isPlainRecord(runAction.value) ? runAction.value : null
      const bodyTokens = Array.isArray(value?.bodyTokens) ? value.bodyTokens.filter(isPlainRecord) : []
      const tokens = new Set(bodyTokens.map(token => String(token.token || '')))
      for (const token of required.tokens) {
        if (!tokens.has(token)) {
          violations.push(`${toRepoRelativePath(contract.filePath)} expected node ${required.nodeId} canvas:runAction.bodyTokens to include ${token}`)
        }
      }
    }

    for (const required of contract.requiredBlankNodeFields || []) {
      const node = meta.flow.nodes.find(candidate => {
        if (!isPlainRecord(candidate)) return false
        const idField = candidate.id
        return isPlainRecord(idField) && idField.value === required.nodeId
      })
      if (!isPlainRecord(node)) {
        violations.push(`${toRepoRelativePath(contract.filePath)} expected frontmatter node ${required.nodeId}`)
        continue
      }
      for (const fieldKey of required.fields) {
        const field = node[fieldKey]
        if (!isTypedValueWrapper(field, fieldKey) || field.value !== '') {
          violations.push(`${toRepoRelativePath(contract.filePath)} expected reusable node ${required.nodeId}.${fieldKey} to keep an empty KTV value`)
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`Expected published Storyboard Widget docs to keep frontmatter as the machine SSOT:\n${violations.join('\n')}`)
  }
}

// ---------------------------------------------------------------------------
// Runnable compliance: all storyboardWidget *-demo.md docs must carry the required
// template keys and declare correct panel routing on every typed diagram entry.
// ---------------------------------------------------------------------------

const STORYBOARD_WIDGET_DEMO_GLOB = path.join(HUIJOOHWEE_DOCS_ROOT, '*-demo.md')

const listStoryboardWidgetDemoDocs = (): string[] => {
  if (!fs.existsSync(HUIJOOHWEE_DOCS_ROOT)) return []
  return fs
    .readdirSync(HUIJOOHWEE_DOCS_ROOT)
    .filter(name => name.endsWith('-demo.md'))
    .map(name => path.join(HUIJOOHWEE_DOCS_ROOT, name))
    .filter(fp => {
      const text = fs.readFileSync(fp, 'utf8')
      return /kgCanvas2dRenderer:\s*["']?storyboard["']?/m.test(text)
    })
}

const RUNNABLE_REQUIRED_KEYS = [
  'schema: "kgc-computing-flow/v1"',
  'kgWorkflowManagerModeEnabled: true',
  'kgAutoSaveEnabled: true',
  'kgAutoSaveDebounceMs',
  'kgAutoSaveOn',
] as const

type DiagramPanelContract = { floatingPanelView: string; bottomPanelTab: string }
const DIAGRAM_TYPE_PANEL_CONTRACTS: Record<string, DiagramPanelContract> = {
  mermaid_architecture:  { floatingPanelView: 'architecture',  bottomPanelTab: 'architecture'  },
  mermaid_eventmodeling: { floatingPanelView: 'eventModeling', bottomPanelTab: 'eventModeling' },
  mermaid_gitgraph:      { floatingPanelView: 'gitGraph',      bottomPanelTab: 'gitGraph'      },
  mermaid_gantt:         { floatingPanelView: 'gantt',         bottomPanelTab: 'gantt'         },
}

export function testStoryboardWidgetDemoRunnableStructure() {
  const demoPaths = listStoryboardWidgetDemoDocs()
  const violations: string[] = []

  for (const filePath of demoPaths) {
    const rel = toRepoRelativePath(filePath)
    const text = fs.readFileSync(filePath, 'utf8')

    // 1. Required template keys
    for (const key of RUNNABLE_REQUIRED_KEYS) {
      if (!text.includes(key)) {
        violations.push(`${rel}: missing required key "${key}"`)
      }
    }

    // 2. Parses as a frontmatter flow graph
    const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(filePath), text)
    if (!parsed) {
      violations.push(`${rel}: does not parse as a frontmatter flow graph`)
      continue
    }

    const nodes: readonly { id?: unknown; type?: unknown; properties?: unknown }[] =
      parsed.graphData.nodes || []
    const nodeById = new Map(
      nodes.map(n => [String((n.properties as Record<string, unknown> | null)?.id ?? n.id ?? ''), n]),
    )

    // 3. At least one InputWidget with canvas:widgetCard
    const hasInput = nodes.some(n => {
      const props = (n.properties || {}) as Record<string, unknown>
      return (
        String(n.type || props['type'] || '').includes('InputWidget') &&
        typeof props['canvas:widgetCard'] === 'object'
      )
    })
    if (!hasInput) {
      violations.push(`${rel}: no InputWidget node with canvas:widgetCard`)
    }

    // 4. At least one compute node with non-empty inline compute source
    const computeNodes = nodes.filter(n => {
      const props = (n.properties || {}) as Record<string, unknown>
      const t = String(n.type || props['type'] || '')
      return t === 'ComputeWidget' || t === 'TextGeneration'
    })
    if (computeNodes.length === 0) {
      violations.push(`${rel}: no ComputeWidget or TextGeneration nodes found`)
    }
    for (const n of computeNodes) {
      const source = readFlowComputeSource(n as never)
      if (!source) {
        const id = String((n.properties as Record<string, unknown> | null)?.id ?? n.id ?? '?')
        violations.push(`${rel}: compute node "${id}" has no inline compute source`)
        continue
      }
      if (isUnsafeFlowComputeSource(source)) {
        const id = String((n.properties as Record<string, unknown> | null)?.id ?? n.id ?? '?')
        violations.push(`${rel}: compute node "${id}" inline compute source is unsafe`)
      }
    }

    // 5. Image/video RichMediaPanel nodes must use typed handles
    for (const n of nodes) {
      const props = (n.properties || {}) as Record<string, unknown>
      if (String(n.type || props['type'] || '') !== 'RichMediaPanel') continue
      const mediaType = String(props['media_type'] || '')
      if (mediaType === 'image' && typeof props['imageAssetUrl'] === 'undefined') {
        const id = String(props['id'] ?? n.id ?? '?')
        violations.push(`${rel}: image RichMediaPanel "${id}" missing typed imageAssetUrl field`)
      }
      if (mediaType === 'video' && typeof props['videoUrl'] === 'undefined') {
        const id = String(props['id'] ?? n.id ?? '?')
        violations.push(`${rel}: video RichMediaPanel "${id}" missing typed videoUrl field`)
      }
    }

    // 6. flow_diagrams entries with typed diagram kinds must declare panel routing
    const frontmatterMeta = ((parsed.graphData.metadata || {}) as Record<string, unknown>).frontmatterMeta as Record<string, unknown> | null
    const flowDiagramsRaw = frontmatterMeta?.flow_diagrams
    if (isPlainRecord(flowDiagramsRaw)) {
      const diagrams = isPlainRecord(flowDiagramsRaw.value) ? flowDiagramsRaw.value : flowDiagramsRaw
      for (const [key, entry] of Object.entries(diagrams)) {
        if (!isPlainRecord(entry)) continue
        const diagramType = String(entry.type || '')
        const contract = DIAGRAM_TYPE_PANEL_CONTRACTS[diagramType]
        if (!contract) continue
        if (!entry.floatingPanelView) {
          violations.push(`${rel}: flow_diagrams.${key} (${diagramType}) missing floatingPanelView`)
        } else if (entry.floatingPanelView !== contract.floatingPanelView) {
          violations.push(`${rel}: flow_diagrams.${key} floatingPanelView should be "${contract.floatingPanelView}", got "${String(entry.floatingPanelView)}"`)
        }
        if (entry.floatingPanelOpen !== true) {
          violations.push(`${rel}: flow_diagrams.${key} (${diagramType}) missing floatingPanelOpen: true`)
        }
        if (!entry.bottomPanelTab) {
          violations.push(`${rel}: flow_diagrams.${key} (${diagramType}) missing bottomPanelTab`)
        } else if (entry.bottomPanelTab !== contract.bottomPanelTab) {
          violations.push(`${rel}: flow_diagrams.${key} bottomPanelTab should be "${contract.bottomPanelTab}", got "${String(entry.bottomPanelTab)}"`)
        }
        if (entry.bottomPanelOpen !== true) {
          violations.push(`${rel}: flow_diagrams.${key} (${diagramType}) missing bottomPanelOpen: true`)
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Runnable demo compliance violations (${violations.length}):\n${violations.map(v => `  - ${v}`).join('\n')}\n\nSee huijoohwee.github.io/guidelines/yaml-frontmatter-guidelines.md#runnable-demo-compliance`,
    )
  }
}

// ---------------------------------------------------------------------------
// Compute integrity: forbid stale * 1000 multipliers, hardcoded inflated values,
// and frozen run_status:done outputs across all huijoohwee/docs/*.md files.
// ---------------------------------------------------------------------------

export function testStoryboardWidgetComputeIntegrity() {
  if (!fs.existsSync(HUIJOOHWEE_DOCS_ROOT)) return

  const allDocs = fs
    .readdirSync(HUIJOOHWEE_DOCS_ROOT)
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(HUIJOOHWEE_DOCS_ROOT, name))

  const violations: string[] = []

  for (const filePath of allDocs) {
    const rel = toRepoRelativePath(filePath)
    const text = fs.readFileSync(filePath, 'utf8')

    // 1. Stale * 1000 scaling in compute functions
    if (/const\s+rev0\s*=\s*rn\([^)]+\)\s*\*\s*1000/.test(text)) {
      violations.push(`${rel}: stale "rev0 * 1000" multiplier — use real dollar inputs directly`)
    }
    if (/const\s+thr\s*=\s*mt\s*\*\s*1000/.test(text)) {
      violations.push(`${rel}: stale "thr = mt * 1000" multiplier — metric_target is already a dollar amount`)
    }

    // 2. Hardcoded inflated output values from a prior * 1000 run
    const staleOutputPatterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\$150,529,352/, label: '$150,529,352 (inflated by * 1000)' },
      { pattern: /\$350,000,000/, label: '$350,000,000 (inflated threshold)' },
      { pattern: /\$360,944,612/, label: '$360,944,612 (inflated upside)' },
      { pattern: /\$1,061,546.*at 37%/, label: '$1,061,546 at 37% (inflated downside)' },
    ]
    for (const { pattern, label } of staleOutputPatterns) {
      if (pattern.test(text)) {
        violations.push(`${rel}: stale hardcoded output value ${label}`)
      }
    }

    // 3. Compute nodes with run_status "done" and frozen markdown output
    // A done status with a non-empty output block means the output is from a
    // prior run and will NOT update on next Run unless the user manually resets.
    // Per the universality/neutrality contract, idle is the only valid initial state.
    const hasDoneStatus = /run_status: \{key: run_status, type: string, value: "done"\}/.test(text)
    const hasFrozenOutput = /output:\s*\n\s+key: output\s*\n\s+type: markdown\s*\n\s+value: \|\s*\n\s+## /.test(text)
    if (hasDoneStatus && hasFrozenOutput) {
      violations.push(`${rel}: compute node has run_status "done" with frozen markdown output — reset to idle or clear output before committing`)
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Compute integrity violations (${violations.length}):\n${violations.map(v => `  - ${v}`).join('\n')}\n\nSee huijoohwee.github.io/guidelines/yaml-frontmatter-guidelines.md#compute-integrity`,
    )
  }
}
