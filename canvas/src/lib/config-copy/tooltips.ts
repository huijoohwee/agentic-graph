import { MARKDOWN_DATA_VIEW_COPY } from './markdownDataViewCopy'

export type NumericTooltipValue = number | string;

export interface NumericTooltipOptions {
  defaultValue: NumericTooltipValue;
  min?: NumericTooltipValue;
  max?: NumericTooltipValue;
  interval?: NumericTooltipValue;
  impact: string;
}

export function buildNumericTooltip(options: NumericTooltipOptions): string {
  return buildBoundsImpactTooltip({
    defaultValue: options.defaultValue,
    min: options.min,
    max: options.max,
    interval: options.interval,
    impact: options.impact,
  })
}

export interface RoleActionOutcomeTooltipOptions {
  role: string;
  actions: string[];
  outcome: string;
}

export function buildRoleActionOutcomeTooltip(options: RoleActionOutcomeTooltipOptions): string {
  const actionsPart = options.actions.join(' \u2192 ');
  return `${options.role} \u2192 ${actionsPart} \u2192 ${options.outcome}`;
}

function countWords(text: string): number {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return 0
  return normalized.split(' ').filter(Boolean).length
}

function truncateWords(text: string, maxWords: number): string {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const words = normalized.split(' ');
  if (words.length <= maxWords) return normalized;
  return `${words.slice(0, Math.max(0, maxWords)).join(' ')}\u2026`;
}

function extractClampRangeFromNotes(notes: string): { min?: number; max?: number } {
  const raw = String(notes || '');
  const m = raw.match(/clamps\s+to\s*\[\s*([0-9]*\.?[0-9]+)\s*,\s*([0-9]*\.?[0-9]+)\s*\]/i);
  if (!m) return {};
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {};
  return { min, max };
}

function extractIntervalFromNotes(notes: string): number | undefined {
  const raw = String(notes || '')
  const m = raw.match(/\b(?:interval|step)\s*(?:=|:)?\s*([0-9]*\.?[0-9]+)\b/i)
  if (!m) return undefined
  const value = Number(m[1])
  if (!Number.isFinite(value)) return undefined
  return value
}

function toTooltipRole(area: string): string {
  const raw = String(area || '').trim()
  if (!raw || raw === '\u2014') return 'Settings'
  return raw
}

export function buildSettingsKeyTooltip(params: {
  area: string;
  key: string;
  responsibility: string;
  role?: string;
  actions?: string[];
  outcome?: string;
}): string {
  const role = String(params.role || '').trim() || toTooltipRole(params.area);
  const actions = Array.isArray(params.actions) && params.actions.length > 0
    ? params.actions
    : [`edit ${params.key} in MainPanel → Settings`, 'apply changes via MainPanel header']
  const tooltip = buildRoleActionOutcomeTooltip({
    role,
    actions,
    outcome: String(params.outcome || '').trim() || params.responsibility || 'update runtime behavior',
  });
  return truncateWords(tooltip, 50);
}

export function buildSettingsValueTooltip(params: {
  type: string;
  key: string;
  defaultValue: string | number | boolean | null;
  options?: string[];
  notes?: string;
  impact?: string;
  defaultValueOverride?: string | number | boolean | null;
  min?: string | number;
  max?: string | number;
  interval?: string | number;
  expansionNote?: string;
  contractionNote?: string;
}): string {
  const defaultLabel =
    typeof params.defaultValueOverride !== 'undefined'
      ? String(params.defaultValueOverride ?? '—')
      : params.type === 'boolean'
      ? typeof params.defaultValue === 'boolean'
        ? String(params.defaultValue)
        : 'false'
      : typeof params.defaultValue === 'number' && Number.isFinite(params.defaultValue)
        ? String(params.defaultValue)
        : typeof params.defaultValue === 'string' && params.defaultValue.trim().length > 0
          ? params.defaultValue.trim()
          : '—'

  const noteBounds = extractClampRangeFromNotes(params.notes || '')
  const noteInterval = extractIntervalFromNotes(params.notes || '')
  const resolvedMin = typeof params.min !== 'undefined' ? params.min : noteBounds.min
  const resolvedMax = typeof params.max !== 'undefined' ? params.max : noteBounds.max
  const resolvedInterval = typeof params.interval !== 'undefined' ? params.interval : noteInterval

  if (
    params.type === 'number' ||
    typeof resolvedMin !== 'undefined' ||
    typeof resolvedMax !== 'undefined' ||
    typeof resolvedInterval !== 'undefined' ||
    String(params.expansionNote || '').trim().length > 0 ||
    String(params.contractionNote || '').trim().length > 0
  ) {
    return buildBoundsImpactTooltip({
      defaultValue: defaultLabel,
      min: resolvedMin,
      max: resolvedMax,
      interval: resolvedInterval,
      impact: params.impact,
      expansionNote: params.expansionNote,
      contractionNote: params.contractionNote,
    })
  }

  return [(`Default: ${defaultLabel}`), String(params.impact || '').trim()].filter(Boolean).join('; ')
}

export function buildSettingsAreaTooltip(area: string, responsibility?: string): string {
  const normalizedResponsibility = typeof responsibility === 'string' && responsibility ? responsibility.trim() : '';
  const base =
    normalizedResponsibility.length > 0
      ? `Settings area for ${normalizedResponsibility.toLowerCase()} keys. Expand to see modules, functions, and notes.`
      : 'Settings area grouping related keys. Expand to see modules, functions, and notes.';
  if (area === 'UI Density: Icons') {
    return `${base} Use uiIconScale to switch between compact and default icon sizes across toolbars and panels.`;
  }
  return base;
}

export function buildDefaultTooltip(params: {
  defaultValue: string | number | boolean | null
  impact: string
}): string {
  const maxWords = 15
  const def =
    typeof params.defaultValue === 'boolean'
      ? String(params.defaultValue)
      : typeof params.defaultValue === 'number' && Number.isFinite(params.defaultValue)
        ? String(params.defaultValue)
        : typeof params.defaultValue === 'string' && params.defaultValue.trim().length > 0
          ? params.defaultValue.trim()
          : '—'
  const base = `Default: ${def}`
  const remaining = Math.max(0, maxWords - countWords(base))
  const impact = remaining > 0 ? truncateWords(String(params.impact || ''), remaining) : ''
  const final = [base, impact].filter(Boolean).join('; ')
  return truncateWords(final, maxWords)
}

function buildBoundsImpactTooltip(options: {
  defaultValue: NumericTooltipValue;
  min?: NumericTooltipValue;
  max?: NumericTooltipValue;
  interval?: NumericTooltipValue;
  impact?: string;
  expansionNote?: string;
  contractionNote?: string;
}): string {
  const segments: string[] = []
  segments.push(`Default: ${options.defaultValue}`)
  if (typeof options.min !== 'undefined') {
    segments.push(`Min: ${options.min}`)
  }
  if (typeof options.max !== 'undefined') {
    segments.push(`Max: ${options.max}`)
  }
  if (typeof options.interval !== 'undefined') {
    segments.push(`Interval: ${options.interval}`)
  }
  const { expansion, contraction, fallbackImpact } = splitImpactText(options.impact || '')
  const expansionText = String(options.expansionNote || expansion).trim()
  const contractionText = String(options.contractionNote || contraction).trim()
  if (expansionText) segments.push(expansionText)
  if (contractionText) segments.push(contractionText)
  if (!expansionText && !contractionText && fallbackImpact) segments.push(fallbackImpact)
  return segments.join('; ')
}

function splitImpactText(rawImpact: string): {
  expansion: string
  contraction: string
  fallbackImpact: string
} {
  const normalized = String(rawImpact || '').trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return { expansion: '', contraction: '', fallbackImpact: '' }
  }
  const segments = normalized.split(';').map(part => part.trim()).filter(Boolean)
  if (segments.length >= 2) {
    return {
      expansion: segments[0],
      contraction: segments[1],
      fallbackImpact: normalized,
    }
  }
  return { expansion: '', contraction: '', fallbackImpact: normalized }
}

export const ORCHESTRATOR_TRAVERSAL_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Orchestrator',
  actions: [
    'execute AgenticRAG traversal presets and edit GraphRAG paths',
    'adjust traversal delay and view mode via the Graph Traversal floating panel and Settings \u2192 Orchestrator',
  ],
  outcome: 'deliver controlled, customizable graph navigation for consistent analysis and sharing',
});

export const ORCHESTRATOR_TRAVERSAL_DELAY_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Orchestrator traversal delay row',
  actions: [
    'share traversalDelayMs across Orchestrator, Renderer, and Graph Traversal floating panel',
    'tune step pacing for graphRAGPath replays and generic traversals',
  ],
  outcome: 'keep AgenticRAG graph navigation smooth, debuggable, and reproducible across runs',
});

export const AI_AG_FORCE_CHARGE_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG force charge',
  actions: [
    'set layout.forces.charge to control node repulsion',
    'spread or tighten clusters around traversal overlays and highlights',
  ],
  outcome: 'keep dense graphs readable without fragmenting cluster structure',
})

export const AI_AG_FORCE_COLLISION_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG collision radius',
  actions: [
    'set layout.forces.collisionByType to push nodes apart per node type',
    'reduce overlap for AI-KG layers and traversal playback',
  ],
  outcome: 'maintain legible clusters and labels during multi-hop inspection',
})

export const AI_AG_FORCE_BOX_FORCE_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG box force',
  actions: [
    'toggle layout.forces.boxForce to constrain nodes within the viewport',
    'prevent runaway layouts on large or high-charge graphs',
  ],
  outcome: 'keep traversal replays on-screen without constant refitting',
})

export const AI_AG_FORCE_BOX_FORCE_STRENGTH_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG box force strength',
  actions: [
    'set layout.forces.boxForceStrength to control constraint intensity',
    'balance stability against distortion of natural force layouts',
  ],
  outcome: 'keep nodes visible while preserving the shape of the graph',
})

export const AI_AG_LAYER1_OPACITY_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG layer 1 opacity',
  actions: [
    "set three.layerOpacityByLayer['1'] for the foreground band",
    'keep top-layer concepts readable during traversal replays',
  ],
  outcome: 'preserve focus-layer readability without hiding context entirely',
})

export const AI_AG_LAYER2_OPACITY_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG layer 2 opacity',
  actions: [
    "set three.layerOpacityByLayer['2'] for the mid band",
    'balance context visibility against traversal highlights',
  ],
  outcome: 'keep supporting context present without overpowering the focus layer',
})

export const AI_AG_LAYER3_OPACITY_ROW_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AI KG layer 3 opacity',
  actions: [
    "set three.layerOpacityByLayer['3'] for the background band",
    'keep deep context visible behind traversal overlays',
  ],
  outcome: 'retain depth cues while keeping traversal paths visually dominant',
})

export const WORKFLOW_INDEXING_PARAMETERS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG workflow indexing',
  actions: [
    'configure dataset paths, chunking, embedding model, and maxHops for a run',
    'mirror offline GraphRAG workflow JSON-LD fields in Workflow Manager and the Graph Traversal floating panel',
  ],
  outcome: 'keep indexing configuration consistent across AgenticRAG workflows, traversals, and exports',
});

export const GRAPHRAG_DATASET_INPUT_DIR_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG dataset input directory',
  actions: [
    'set dataset.inputDir for the active rag:GraphRAGWorkflow JSON-LD',
    'align on-disk raw inputs with offline GraphRAG runs',
  ],
  outcome: 'keep GraphRAG workflows reproducible across machines and shared exports',
})

export const GRAPHRAG_DATASET_OUTPUT_DIR_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG dataset output directory',
  actions: [
    'set dataset.outputDir for the active rag:GraphRAGWorkflow JSON-LD',
    'align GraphRAG artifacts output paths with offline runs',
  ],
  outcome: 'keep derived artifacts discoverable across exports and pipeline reruns',
})

export const GRAPHRAG_CHUNK_METHOD_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG chunking method',
  actions: [
    'set chunking.method for the active rag:GraphRAGWorkflow JSON-LD',
    'choose how documents are split before embedding and indexing',
  ],
  outcome: 'keep chunk boundaries stable so retrieval and citations remain comparable',
})

export const GRAPHRAG_CHUNK_SIZE_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG chunk size',
  actions: [
    'set chunking.chunkSize for the active rag:GraphRAGWorkflow JSON-LD',
    'control document chunk granularity before embedding',
  ],
  outcome: 'balance retrieval recall and index size without hard-coded dataset tuning',
})

export const GRAPHRAG_MAX_HOPS_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG max hops',
  actions: [
    'set maxHops for the active rag:GraphRAGWorkflow JSON-LD',
    'control multi-hop neighborhood expansion during retrieval',
  ],
  outcome: 'trade off depth-driven recall against traversal cost and noise',
})

export const GRAPHRAG_EMBEDDING_PROVIDER_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG embedding provider',
  actions: [
    'set embeddingModel.provider for the active rag:GraphRAGWorkflow JSON-LD',
    'select which embedding backend to use during indexing',
  ],
  outcome: 'keep embedding runs consistent across machines and exported workflows',
})

export const GRAPHRAG_EMBEDDING_MODEL_NAME_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG embedding model name',
  actions: [
    'set embeddingModel.modelName for the active rag:GraphRAGWorkflow JSON-LD',
    'select the embedding model used for chunk vectors',
  ],
  outcome: 'control embedding quality and cost while keeping retrieval comparable across runs',
})

export const GRAPHRAG_IGNORE_PATTERNS_VALUE_TOOLTIP = buildDefaultTooltip({
  defaultValue: '',
  impact: 'Comma-separated patterns; matching paths are ignored during codebase indexing',
})

export const TRAVERSAL_PRESETS_SECTION_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Traversal presets and helpers',
  actions: [
    'edit rag:TraversalRule entries, DuckDbQueryConfig helpers, and graphRAGPath presets used by Orchestrator and Renderer',
    'run generic graph queries while keeping traversal paths, label filters, and selection-driven helpers aligned with Renderer highlights and workflow JSON-LD',
  ],
  outcome:
    'keep AgenticRAG graphRAGPath presets reproducible across sessions and shared between Orchestrator and Renderer.',
});

export const TRAVERSAL_EDITOR_AND_LAYERS_SECTION_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Traversal editor',
  actions: [
    'edit traversal delay and traversal helpers over AgenticRAG GraphData',
    'coordinate Orchestrator playback with 2D/3D Renderer appearance',
  ],
  outcome:
    'produce readable, repeatable graph navigation tuned to current AgenticRAG graph state.',
});

export const TRAVERSAL_SEQUENCE_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Traversal sequence',
  actions: [
    'inspect nodes, edges, hops, and multiHop chains from the last traversal',
  ],
  outcome:
    'debug AgenticRAG graphRAGPath IRI steps for GraphRAG and generic queries without leaving Orchestrator playback.',
});

export const TRAVERSAL_SEQUENCE_MODE_LABEL_GRAPH_RAG = 'Agentic GraphRAG path';

export const TRAVERSAL_SEQUENCE_MODE_LABEL_GENERIC = 'Generic traversal query';

export const DUCKDB_SQL_FIELD_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'DuckDB SQL field',
  actions: [
    'edit parameterized graph queries for traversal helpers',
  ],
  outcome:
    'keep text-mode SQL aligned with AgenticRAG traversal and Renderer overlays.',
});

export const DUCKDB_QUERY_PRESETS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'DuckDB query presets',
  actions: [
    'map duckdbQueries[].id to reusable traversal helpers',
  ],
  outcome:
    'keep SQL-based graph queries discoverable alongside Orchestrator presets.',
});

export const DUCKDB_QUERY_PRESET_ID_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'DuckDB query preset id',
  actions: [
    'select which duckdbQueries[].sql and description are active',
  ],
  outcome:
    'keep traversal helper labels in sync with underlying DuckDB SQL and GraphRAG overlays.',
});

export const DUCKDB_QUERY_PRESET_DESCRIPTION_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'DuckDB query preset description',
  actions: [
    'summarize traversal helper purpose and scope',
  ],
  outcome:
    'keep DuckDB presets self-documenting in Graph Traversal UI.',
});

export const GRAPHRAG_WORKFLOW_SUMMARY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'GraphRAG workflow summary',
  actions: [
    'show graphId, retrieval method, and workflow source for the active GraphRAG workflow',
    'connect Workflow, Orchestrator, and Renderer views back to the same rag:GraphRAGWorkflow JSON-LD',
  ],
  outcome:
    'keep traversal presets, traces, and exports anchored to a single AgenticRAG workflow document.',
});

export const AGENTIC_RAG_CONTEXT_IRI_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'AgenticRAG context IRI',
  actions: [
    'share graphContextUrl across GraphRAG workflows, generic traversals, and QA',
    'align workspace context with codebase index context IRIs and offline AgenticRAG runs',
  ],
  outcome:
    'keep reasoning, tracing, and exports aligned around a single AgenticRAG context URL.',
});

export const ORCHESTRATOR_TRACING_OPTIONS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Orchestrator tracing options',
  actions: [
    'reuse workspace-wide traversalDelayMs configured in the traversal delay row',
    'tune graphRAGPath replay pacing, debug logs, and trace exports for traversals',
  ],
  outcome:
    'keep AgenticRAG graph navigation timing and tracing controls consistent across runs and workflows.',
});

export const IGNORE_CODEBASE_PATHS_LABEL = 'Ignore codebase paths';

export const IGNORE_CODEBASE_PATHS_TOOLTIP =
  'Ignore codebase paths \u2192 exclude selected files and directories from AgenticRAG indexing and traversal \u2192 keep GraphRAG workflows focused on relevant code while avoiding noisy or generated artifacts.';

export const GRAPH_FIELDS_ICON_LEGEND_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Help Icon Library legend',
  actions: [
    'align FloatingPanel Media, scope, origin, visibility, and field-type badges with shared panel and graph-field semantics',
  ],
  outcome:
    `keep Workflow Manager, inline command flows, schema design, and ${MARKDOWN_DATA_VIEW_COPY.titleDefault} behavior grounded in the same JSON-LD-backed graph schema.`,
});

export const WORKFLOW_LINKS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Workflow links',
  actions: [
    'jump into Workflow Manager sections mapped to the 8-stage GraphRAG pipeline, including embedded Graph Fields',
  ],
  outcome:
    'keep Schema, Curation, Index, and Agentic reasoning steps aligned with AgenticRAG JSON-LD exports.',
});

export const AGENTIC_REASONING_LABELS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Agentic reasoning labels',
  actions: [
    'mirror the Agentic GraphRAG pipeline from docs/agenticgraph-raci-document.md',
  ],
  outcome:
    'keep Workflow, Orchestrator, and Renderer steps aligned with the same end-to-end AgenticRAG graph pipeline.',
});

export const GRAPHRAG_PATH_METADATA_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'graphRAGPath metadata',
  actions: [
    'capture end-to-end GraphRAG paths for the codebase index',
  ],
  outcome:
    'trace how AgenticRAG pipelines move from Canvas, through parser scripts, into a GraphRAG-ready JSON-LD index.',
});

export const GRAPH_FIELDS_GRAPH_DATA_TABLE_MAPPING_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Graph Fields',
  actions: [
    `define node and edge field metadata, JSON-LD roles, and ${MARKDOWN_DATA_VIEW_COPY.mappingLabel}`,
    'sync column visibility, frozen areas, and samples with schema presets',
  ],
  outcome:
    'see docs/agenticgraph-schema-document.md for AgenticRAG JSON-LD table mapping examples.',
});

export const GRAPH_DATA_TABLE_CURATION_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: MARKDOWN_DATA_VIEW_COPY.titleDefault,
  actions: [
    'curate, filter, and export node and edge records',
  ],
  outcome:
    'produce JSON (default), AgenticRAG JSON-LD, or CSV snapshots aligned with schema and codebase index.',
});

export const TOOL_MENU_SOURCE_FILES_DESCRIPTION =
  'Source Files \u2192 import or export supported formats \u2192 keep Markdown, HTML, PDF, JSON-LD, and JSON ingest paths consistent without hardcoding dataset-specific rules.';

export const TOOL_MENU_VALIDATION_DESCRIPTION =
  `Validation \u2192 export graph-wide and selection-only validation reports \u2192 keep JSON and Markdown summaries aligned with AgenticRAG schema and ${MARKDOWN_DATA_VIEW_COPY.titleDefault} curation.`;

export const TOOL_MENU_PARSER_DESCRIPTION =
  'Parser \u2192 manage parser scripts and custom configurations \u2192 keep AgenticRAG graph ingestion paths versioned so CSV, JSON, and JSON-LD inputs map cleanly into schema-aligned GraphData.';

export const TOOL_MENU_SCHEMA_CONFIG_DESCRIPTION =
  'Schema Configurator (Graph Fields) \u2192 define generic node/edge types, validation rules, and visualization presets \u2192 ensure GraphData, AgenticRAG Node/Edge schema, and Graph Fields stay aligned for ingest, traversal, and export.';

export const TOOL_MENU_GRAPH_FIELDS_DESCRIPTION =
  `Graph Fields \u2192 configure node/edge field mappings and table columns \u2192 keep ${MARKDOWN_DATA_VIEW_COPY.titleDefault}, schema-config, and AgenticRAG JSON-LD mapping aligned with Orchestrator traversal semantics.`;

export const TOOL_MENU_RENDER_DESCRIPTION =
  'Renderer \u2192 manage 2D/3D render presets and layout configurations \u2192 store JSON-LD (default) and YAML definitions that align camera, forces, and layer opacity with AgenticRAG traversal and selection semantics.';

export const RENDERER_PALETTE_LIFECYCLE_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Renderer palette lifecycle roles',
  actions: [
    'map renderer:palette.nodes.idea/hypothesis/execution/pivot/alert to lifecycle buckets',
  ],
  outcome:
    'keep blue/yellow/green/orange/red colors aligned with core ideas, hypotheses, execution, pivots, and alerts.',
});

export const RENDERER_PALETTE_ENTRY_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Renderer palette entry',
  actions: [
    'set renderer:palette colors in schema.metadata to style nodes, edges, and clusters',
    'keep lifecycle colors aligned with presets and exports',
  ],
  outcome: 'make graphs visually consistent across sessions without hard-coded theme overrides',
})

export const RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP = buildDefaultTooltip({
  defaultValue: '',
  impact: 'Hex color; updates fills and outlines for matching nodes, edges, and clusters',
})

export const RENDERER_HOVER_CONTENT_KEY_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Hover tooltip content',
  actions: [
    'choose which fields appear in the hover tooltip (Type, ID, Props)',
    'reduce hover noise while keeping debugging info accessible',
  ],
  outcome: 'keep hover inspection fast and readable on dense graphs',
})

export const RENDERER_HOVER_CONTENT_VALUE_TOOLTIP = buildDefaultTooltip({
  defaultValue: 'Type, ID, Props',
  impact: 'Disable fields to reduce clutter; props may be large on codebase graphs',
})

export const TOOL_MENU_SETTINGS_DESCRIPTION =
  'Settings \u2192 manage workspace-level presets and defaults \u2192 store JSON-LD (default) and YAML configuration for canvas UI, traversal, and rendering so sessions reload with consistent AgenticRAG behavior.';

export const TOOL_MENU_HISTORY_DESCRIPTION =
  'History \u2192 manage snapshots of GraphData and schema state \u2192 import or export AgenticRAG JSON-LD history files that capture curated graph states, schema presets, and traversal workflows for later comparison or rollback.';

export const AGENTIC_RAG_PARSER_DESCRIPTION =
  'Parser \u2192 map CSV, JSON, or JSON-LD into AgenticRAG graph JSON-LD \u2192 apply schema-aware defaults and Custom Parser configs to keep node, edge types and metadata aligned with the AgenticRAG schema and codebase index.';

export const AGENTIC_RAG_CONTEXT_AND_IGNORE_FILTERS_LABEL = 'AgenticRAG context and ignore filters';

export const WORKFLOW_STEP3_PARSER_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Parser tab',
  actions: [
    'load parser specs, apply presets, and run ingest flows',
  ],
  outcome:
    'keep CSV/JSON inputs mapped predictably into AgenticRAG GraphData.',
});

export const WORKFLOW_STEP6_ORCHESTRATOR_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Orchestrator presets',
  actions: [
    'run Agentic GraphRAG traversal helpers from the Orchestrator tab',
  ],
  outcome:
    'keep traversal docs and behavior aligned with the Graph Traversal floating panel.',
});

export const WORKFLOW_STEP8_BOTTOM_TABS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Bottom panel tabs',
  actions: [
    'combine Data, Table, and Render views on GraphData',
  ],
  outcome:
    'validate, visualize, and export layouts with consistent AgenticRAG semantics.',
});

export const TRAVERSAL_PRESET_UI_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Traversal controls',
  actions: [
    'set start node, max depth, label filters, helpers, and DuckDB queries',
  ],
  outcome:
    'drive Agentic GraphRAG traversals from the renderer.',
});

export const HELP_CHEATSHEET_ALIGNMENT_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Canvas cheatsheet',
  actions: [
    'pair selection and creation modes with the active panel surfaces',
  ],
  outcome:
    'keep Orchestrator traversal and AgenticRAG node inspector aligned with current Canvas focus.',
});

export const RENDER_TRAVERSAL_BUTTON_LABEL_GRAPH_RAG =
  'Agentic GraphRAG path (graphRAGPath.traverse)';

export const HELP_CODEBASE_INDEX_ENTRY_POINTS_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Markdown pipeline entry points',
  actions: [
    'copy or show the markdown-to-graph pipeline command',
  ],
  outcome:
    'run the markdown \u2192 JSON-LD graph and schema pipeline from your terminal.',
});

export const LAUNCH_SPOTLIGHT_TOUR_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Launch Spotlight tour',
  actions: [
    'guide users through parser, data, schema, and render tabs',
    'track prerequisites like dataset load, schema apply, and traversal run',
  ],
  outcome:
    'keep onboarding aligned with AgenticRAG GraphRAG workflow stages across the main and floating panels.',
});

export const WORKFLOW_TAB_HEADER_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Workflow Manager tab',
  actions: [
    'organize the 8-step AgenticRAG graph pipeline across parser, schema, curation, orchestrator, and render stages',
    'anchor the workflow surfaces and exports to the same rag:GraphRAGWorkflow JSON-LD document',
  ],
  outcome:
    'keep step ordering and workflow JSON-LD exports reproducible across AgenticRAG runs.',
});

export const HELP_TAB_HEADER_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Help tab',
  actions: [
    'surface shortcuts, canvas behavior, panel tours, and workflow links for the workspace',
    'connect Workflow, Graph Fields, Parser, Schema, and Orchestrator views when navigating AgenticRAG presets and graph views',
  ],
  outcome:
    'keep panel usage aligned with GraphRAG workflow stages and AgenticRAG graph navigation.',
});

export const SETTINGS_TAB_HEADER_TOOLTIP = buildRoleActionOutcomeTooltip({
  role: 'Settings tab',
  actions: [
    'centralize AgenticRAG presets, layout, canvas interaction, and renderer defaults',
    'share UI settings and traversal tuning across Parser, Orchestrator, and Render tabs',
  ],
  outcome:
    'keep AgenticRAG graph navigation, rendering, and panel behavior consistent across sessions.',
});

export const PANEL_TOUR_GRAPH_DATA_TABLE_LOCATION =
  `The canvas UI is organized into the toolbar, main panel, floating panel, and bottom surface so that data curation, schema design, and workflow exports stay in sync. The ${MARKDOWN_DATA_VIEW_COPY.titleDefault} is the spreadsheet-like view of nodes and edges used alongside Workflow Manager and the markdown workspace.`;

export const GRAPH_FIELDS_ICON_LEGEND_REUSE_TEXT =
  'MainPanel Collaboration Type rows, settings-derived Integrations/MCP/Maps/Payments/Settings rows, FloatingPanel view buttons, and node/edge tooltip field-type icons reuse this legend and follow the same UI Density: Icons setting.';

export const GRAPH_FIELDS_HIDDEN_TOGGLE_TOOLTIP_TEXT =
  `Directive: Toggle · Subject: ${MARKDOWN_DATA_VIEW_COPY.titleDefault} visibility · Verb: controls · Object: whether this field appears as a column while remaining available to AgenticRAG pipelines.`;

import { readEnvString } from '../config.env';

export const GRAPH_FIELDS_DESCRIPTION_TOOLTIP_TEXT =
  `Directive: Document · Subject: field meaning · Verb: describes · Object: how this field maps to AgenticRAG JSON-LD so agents, schema docs, and ${MARKDOWN_DATA_VIEW_COPY.titleDefault} share a consistent interpretation.`;

export const AGENTIC_GRAPHRAG_PIPELINE_DESCRIPTION =
  'Agentic GraphRAG pipeline \u2192 align Workflow, Orchestrator, Renderer, and codebase index traversals with a shared rag:GraphRAGWorkflow JSON-LD document \u2192 keep graphRAGPath metadata, context IRIs, and traversal rules consistent across UI and offline pipelines.';

const MARKDOWN_PIPELINE_INPUT_REL_PATH = readEnvString(
  'VITE_MARKDOWN_PIPELINE_INPUT_REL_PATH',
  'docs/agenticgraph-pipeline-document.md',
);

export const CODEBASE_INDEX_PIPELINE_OUTPUT_DIR = readEnvString(
  'VITE_MARKDOWN_PIPELINE_OUTPUT_DIR',
  'data/outputs/agenticgraph-workflow-preview',
);

const MARKDOWN_PIPELINE_BASENAME = readEnvString(
  'VITE_MARKDOWN_PIPELINE_BASENAME',
  'agenticgraph-pipeline-document',
);

function buildMarkdownPipelineCommand(inputRelPath: string, outputDirRelPath: string): string {
  const input = inputRelPath.trim();
  const outputDir = outputDirRelPath.trim();
  return `python -m agenticgraph_parser markdown --input ${input} --output-dir ${outputDir}`;
}

export const CODEBASE_INDEX_PIPELINE_COMMAND = buildMarkdownPipelineCommand(
  MARKDOWN_PIPELINE_INPUT_REL_PATH,
  CODEBASE_INDEX_PIPELINE_OUTPUT_DIR,
);

export const CODEBASE_INDEX_PIPELINE_GRAPH_REL_PATH = `${CODEBASE_INDEX_PIPELINE_OUTPUT_DIR}/${MARKDOWN_PIPELINE_BASENAME}-graph-data.jsonld`;

export const CODEBASE_INDEX_PIPELINE_SCHEMA_REL_PATH = `${CODEBASE_INDEX_PIPELINE_OUTPUT_DIR}/${MARKDOWN_PIPELINE_BASENAME}-schema-config.jsonld`;

export const CODEBASE_INDEX_PIPELINE_ORCHESTRATOR_REL_PATH = `${CODEBASE_INDEX_PIPELINE_OUTPUT_DIR}/${MARKDOWN_PIPELINE_BASENAME}-orchestrator-config.yaml`;

export const HELP_PIPELINE_COMMAND_TEXT = CODEBASE_INDEX_PIPELINE_COMMAND;

export const PIPELINE_COMMAND_COPIED_STATUS_TEXT = 'Copied markdown pipeline command to clipboard';

export const PIPELINE_COMMAND_FALLBACK_STATUS_TEXT = `Run markdown pipeline in terminal: ${HELP_PIPELINE_COMMAND_TEXT}`;

export const PIPELINE_COMMAND_RUNNING_STATUS_TEXT =
  'Running markdown pipeline and loading markdown graph, schema, and workflow outputs\u2026';

export const PIPELINE_COMMAND_LOADED_STATUS_TEXT =
  'Loaded markdown graph, schema, and workflow from markdown pipeline outputs.';

export const DATASET_EMPTY_TEXT = 'No dataset loaded.';

export const SELECTION_INSPECTOR_EMPTY_TEXT = 'Select a node or edge to edit its properties.';

export const PARSER_JSONLD_EDGE_MAPPING_PIPELINE_DESCRIPTION =
  'Load into GraphData \u2192 JSON-LD \u2192 Graph edges/@id \u2192 Orchestrator. Checked relations become allowedRelations in the generated GraphRAG workflow JSON-LD.';

export const AGENTIC_RAG_SCHEMA_LABEL = 'AgenticRAG schema:';

export const AGENTIC_RAG_CONTEXT_LABEL = 'AgenticRAG context:';

export const AGENTIC_RAG_DATASET_CONTEXT_VOCAB_LABEL = 'Dataset context/vocab:';

export const GRAPHRAG_PATH_IRI_LABEL = 'graphRAGPath IRI:';

export const AGENTIC_RAG_PATH_EDITOR_INTRO_TEXT =
  'Agentic GraphRAG path metadata for the current graph or selected node.';

export const AGENTIC_RAG_PATH_LEGEND_EMPTY_TEXT = 'No AgenticRAG paths detected.';

export const AGENTIC_RAG_PATH_LEGEND_TRAVERSE_TEXT =
  'Active AgenticRAG path: traverse (query + multi-hop path over node ids).';

export const AGENTIC_RAG_PATH_LEGEND_EXAMPLE_TEXT =
  'Active AgenticRAG path: example (hops[] describing narrative reasoning steps).';

export const AGENTIC_RAG_PATH_LEGEND_MIXED_TEXT =
  'Active AgenticRAG path: mixed (both traverse[] node ids and hops[] narrative steps).';

export const AGENTIC_RAG_PATH_LEGEND_PARSE_ERROR_TEXT =
  'AgenticRAG path metadata is present but could not be parsed for legend.';

export const GRAPHRAG_PATH_TRAVERSAL_METADATA_MISSING_TEXT =
  'No graphRAGPath traversal metadata found on this graph.';

export const RUN_CODEBASE_INDEX_PIPELINE_LABEL = 'Run markdown pipeline';

export const AGENTIC_RAG_NODE_JSON_COPY_LABEL = 'Copy AgenticRAG node JSON';

export const AGENTIC_RAG_NODE_JSON_STATUS_NONE = 'No AgenticRAG node selected';

export const AGENTIC_RAG_NODE_JSON_STATUS_COPIED = 'AgenticRAG node JSON copied';
