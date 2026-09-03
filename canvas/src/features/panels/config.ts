import {
  UI_LABELS,
  SCHEMA_SECTIONS,
  type SchemaSectionId,
  AGENTIC_RAG_CONTEXT_AND_IGNORE_FILTERS_LABEL,
  ORCHESTRATOR_TRAVERSAL_TOOLTIP,
  GRAPH_DATA_TABLE_CURATION_TOOLTIP,
  WORKFLOW_LINKS_TOOLTIP,
  AGENTIC_REASONING_LABELS_TOOLTIP,
  GRAPHRAG_PATH_METADATA_TOOLTIP,
  TRAVERSAL_PRESET_UI_TOOLTIP,
  HELP_CHEATSHEET_ALIGNMENT_TOOLTIP,
  HELP_CODEBASE_INDEX_ENTRY_POINTS_TOOLTIP,
  AGENTIC_GRAPH_RAG_PIPELINE_DESCRIPTION,
  AGENTIC_RAG_SCHEMA_LABEL,
  AGENTIC_RAG_CONTEXT_LABEL,
  AGENTIC_RAG_DATASET_CONTEXT_VOCAB_LABEL,
  GRAPHRAG_PATH_IRI_LABEL,
  AGENTIC_RAG_PATH_EDITOR_INTRO_TEXT,
  AGENTIC_RAG_PATH_LEGEND_EMPTY_TEXT,
  AGENTIC_RAG_PATH_LEGEND_TRAVERSE_TEXT,
  AGENTIC_RAG_PATH_LEGEND_EXAMPLE_TEXT,
  AGENTIC_RAG_PATH_LEGEND_MIXED_TEXT,
  AGENTIC_RAG_PATH_LEGEND_PARSE_ERROR_TEXT,
  GRAPHRAG_PATH_TRAVERSAL_METADATA_MISSING_TEXT,
} from '@/lib/config'

import { CANVAS_SHORTCUT_COPY_LINES } from '@/lib/canvas/interaction-ssot'
import { KANBAN_SHORTCUT_HELP_LINES } from '@/features/markdown/ui/kanban/kanbanShortcutCopy'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

export const PANEL_MIN_PX = 120
export const PANEL_MAX_RATIO = 1.0
export const PANEL_MIN_RATIO = 0.35
export const DEFAULT_BOTTOM_PANEL_HEIGHT_RATIO = PANEL_MIN_RATIO
export const MINIMAP_TINY_GAP_PX = 8

export type WorkflowStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface WorkflowStepCopy {
  id: WorkflowStepId
  label: string
  descriptionShort: string
  descriptionLong?: string
  extraSections?: { key: string; heading: string; body?: string }[]
}

export type WorkflowDescriptionVariant = 'short' | 'long'

export function getWorkflowStepBody(id: WorkflowStepId, variant: WorkflowDescriptionVariant = 'long'): string {
  const step = WORKFLOW_STEP_COPY[id]
  if (variant === 'short') {
    return step.descriptionShort
  }
  return step.descriptionLong ?? step.descriptionShort
}

export const WORKFLOW_STEP_COPY: Record<WorkflowStepId, WorkflowStepCopy> = {
  1: {
    id: 1,
    label: 'Schema (decide meaning once)',
    descriptionShort:
      'Schema \u2192 define ontology, validation, and provenance rules \u2192 keep GraphData, loaders, and exporters aligned on one contract.',
    descriptionLong:
      'Define ontology, validation, and provenance rules so GraphData, loaders, and exporters share a single semantic contract for nodes, edges, and properties. Node type labels, edge relations, geo-coordinates, rich text chunks, and embedding placeholders all live in this layer so meaning is decided once and reused everywhere.',
  },
  2: {
    id: 2,
    label: 'UI curation layer',
    descriptionShort:
      'Curation \u2192 curate nodes, edges, and metadata tables \u2192 export lossless CSV/JSON so ingest stays source-agnostic.',
    descriptionLong:
      `Use the in-app ${MARKDOWN_DATA_VIEW_COPY.titleDefault} or an external multidimensional spreadsheet UI backed by a relational store to curate Nodes, Edges, Metadata, and Media URLs. Entity resolution, provenance entry, and manual confidence tagging happen here before export. Exports remain high-fidelity CSV/JSON per table so ingest stays source-agnostic and lossless.`,
  },
  3: {
    id: 3,
    label: 'Ingest',
    descriptionShort:
      'Ingest \u2192 load inputs via Loader, Parser, and Validator \u2192 produce canonical GraphData with stable IDs and preserved provenance.',
    descriptionLong:
      'Load curated exports or raw files through Loader, Parser, and Validator so raw JSON and CSV become canonical GraphData with stable IDs, deduplication, entity resolution, and provenance preserved. Loader validates JSON syntax only, Parser converts JSON to graph objects without domain assumptions, and Validator enforces structural integrity against the active schema.',
  },
  4: {
    id: 4,
    label: 'Enrich',
    descriptionShort:
      'Enrich \u2192 attach embeddings, confidence, and media references \u2192 enable hybrid vector + graph retrieval without changing IDs.',
    descriptionLong:
      'Attach embeddings, confidence scores, and media references to GraphData so retrieval and RAG pipelines can combine vector similarity with graph structure. Chunk text becomes the grounding surface, embeddings capture semantic similarity, and media URLs and confidence signals stay attached as structured metadata for downstream tools.',
  },
  5: {
    id: 5,
    label: 'Index and store',
    descriptionShort:
      'Index \u2192 persist GraphData into canonical stores (DuckDB + vector indexes) \u2192 share one lossless retrieval and analytics layer.',
    descriptionLong:
      'Persist GraphData into DuckDB or other canonical stores with relational tables for nodes and edges plus optional vector indexes. Hybrid retrieval over SQL and vector similarity runs against this canonical store so agents, dashboards, and offline jobs all share the same lossless representation of the graph.',
  },
  6: {
    id: 6,
    label: 'Agentic reasoning',
    descriptionShort:
      `Orchestrator \u2192 run traversal presets and inspect AgenticRAG context \u2192 keep multi-hop graphRAGPath reasoning grounded in schema and provenance.`,
    descriptionLong:
      `Use an orchestrator to plan and run multi-step workflows that combine SQL over DuckDB, vector search, and subgraph traversal over the indexed store. In the Floating Panel → Graph Traversal view, run AgenticRAG traversal presets, inspect Traversal sequence and the AgenticRAG node inspector, and review ${AGENTIC_RAG_CONTEXT_AND_IGNORE_FILTERS_LABEL} so graphRAGPath IRI chains remain traceable, reproducible, and aligned with AgenticRAG JSON-LD schema and context.`,
  },
  7: {
    id: 7,
    label: 'Produce',
    descriptionShort:
      'Produce \u2192 export portable JSON, JSON-LD, and CSV snapshots \u2192 reuse validated graph states across tools and runs.',
    descriptionLong:
      'Generate portable Blueprint JSON, JSON-LD, CSV, GraphML, Cypher, and DuckDB exports so downstream systems can consume fully validated graph snapshots and workflow state. History and Graph Fields configuration can be exported alongside GraphData so schema, field settings, and pipeline steps remain reproducible.',
  },
  8: {
    id: 8,
    label: 'Reuse and render',
    descriptionShort:
      'Render \u2192 visualize in 2D/3D/map without mutating GraphData \u2192 keep appearance a late, replaceable decision.',
    descriptionLong:
      'Render graphs in 2D/3D or map views, or feed exports into indexers, dashboards, and downstream RAG pipelines so appearance and retrieval strategies remain late, replaceable decisions on top of stable GraphData. Visual mappings, level-of-detail, canvas Embed/Overlay mini-visualizations, and schema-driven clusters (controlled by the Clusters toolbar toggle and `schema.metadata["canvas:graphLayers"]`) happen here without altering the canonical store, keeping phase/step-style outlines and overlays domain-agnostic.',
  },
}

export type PanelSurfaceRoleKey =
  | 'stats'
  | 'parser'
  | 'schema'
  | 'data'
  | 'render'
  | 'table'
  | 'history'

export type PanelSurfaceOwner =
  | 'bottomSurface.history'
  | 'bottomSurface.stats'
  | 'floatingPanel.graphTraversal'
  | 'floatingPanel.renderer'
  | 'mainPanel.workflow'
  | 'workspace.editor'
  | 'workspace.graphTable'

export function getPanelSurfaceLabel(key: PanelSurfaceRoleKey): string {
  if (key === 'stats') return 'Stats'
  if (key === 'parser') return 'Workflow Manager Parser'
  if (key === 'schema') return 'Workflow Manager Schema Configurator'
  if (key === 'data') return 'Editor Workspace'
  if (key === 'render') return 'Floating Panel Renderer'
  if (key === 'history') return 'History'
  return MARKDOWN_DATA_VIEW_COPY.titleDefault
}

export function getBottomSurfaceTabLabel(key: 'stats' | 'history'): string {
  if (key === 'stats') return 'Stats'
  return 'History'
}

export function getOrchestratorSectionListLabel(): string {
  return `traversal presets, Traversal sequence, AgenticRAG node inspector, ${AGENTIC_RAG_CONTEXT_AND_IGNORE_FILTERS_LABEL}`
}

export const HELP_SHORTCUT_ITEMS: readonly string[] = [
  `Cmd/Ctrl + S — ${UI_LABELS.apply}`,
  `Cmd/Ctrl + Enter — ${UI_LABELS.apply}`,
  'Markdown: Cmd/Ctrl + Enter toggles Markdown Editor/Viewer (applies changes when in Editor).',
  `Cmd/Ctrl + Shift + F — ${UI_LABELS.format}`,
  `Cmd/Ctrl + Z — ${UI_LABELS.undo}`,
  `Cmd/Ctrl + Shift + Z — ${UI_LABELS.redo}`,
  'Editor caret on an object id selects the entity.',
  'In 3D mode, toolbar zoom buttons control the camera.',
  ...CANVAS_SHORTCUT_COPY_LINES,
  'Canvas: Shift + drag from one node to another creates an edge (createMode: shift-drag).',
  'Canvas: Use edge tools in the toolbar to click a source node then a target node (createMode: click-source-target).',
  'Canvas: Prefer creating edges from floating panels or context menus when createMode is panel-only.',
  'Canvas: Click the chevron on a group label to collapse/expand the group (clusters/communities/subgraphs).',
  'Canvas: Alt + double-click a group label expand-selects member nodes/edges.',
  'Canvas: Click the chevron on a collapsed group node to expand the group.',
  ...KANBAN_SHORTCUT_HELP_LINES,
  'Help: Launch re-opens the launch spotlight.',
  'Canvas: Cmd/Ctrl + Shift + G replays the launch spotlight.',
  'Settings: uiIconScale under “UI Density: Icons” controls compact vs default icon size across toolbars and panels.',
  'Canvas: Stratify layout renders an uncluttered parent→child tree using configured edge labels; non-hierarchy edges are omitted so label LOD stays readable on large graphs.',
  'Markdown: Toolbar → Floating Panel → Markdown → Import loads a Markdown document into the markdown workspace / Editor Workspace surfaces.',
  'Markdown: Presentation Mode renders slides split by standalone --- separators. Shortcuts: Space/Right (Next), Shift+Space/Left (Prev), F (Fullscreen), O (Overview), N (Notes).',
  'Markdown: Presentation Mode applies slide `transition` frontmatter and renders $...$/$$...$$ and \\(...\\)/\\[...\\] math via KaTeX.',
  'Mermaid: Double-click a rendered diagram to open a full-screen viewer with Fit and zoom controls (wheel zoom, drag pan).',
] as const

export interface OrchestratorAgenticCopy {
  nodeInspectorTitle: string
  nodeInspectorTooltip: string
  nodeInspectorEmptyIntro: string
  nodeInspectorEmptyExample: string
  nodeInspectorEmptyProvenance: string
  contextSectionTooltip: string
   schemaLabel: string
   contextLabel: string
   datasetContextVocabLabel: string
   graphRagPathIriLabel: string
   pathEditorIntroText: string
   pathLegendEmptyText: string
   pathLegendTraverseText: string
   pathLegendExampleText: string
   pathLegendMixedText: string
   pathLegendParseErrorText: string
   traversalMetadataMissingText: string
  orchestratorTraversalTooltip: string
  graphDataTableCurationTooltip: string
  workflowLinksTooltip: string
  agenticReasoningLabelsTooltip: string
  graphRagPathMetadataTooltip: string
  traversalPresetUiTooltip: string
  helpCheatsheetAlignmentTooltip: string
  helpCodebaseIndexEntryPointsTooltip: string
  graphRagPipelineDescription: string
  orchestratorSectionListLabel: string
}

export const ORCHESTRATOR_AGENTIC_COPY: OrchestratorAgenticCopy = {
  nodeInspectorTitle: 'AgenticRAG node inspector',
  nodeInspectorTooltip:
    'AgenticRAG node inspector → inspect chunk_text, embedding, geo, media_url, provenance, and graphRAGPath for the selected node → align AgenticRAG schema, context, and graphRAGPath IRI with codebasePath provenance for pipeline debugging.',
  nodeInspectorEmptyIntro:
    'Select a node to inspect AgenticRAG fields (chunk_text, embedding, geo, media_url, provenance).',
  nodeInspectorEmptyExample:
    'Start with nodes such as src/main.py or src/optimization.py::class:Optimizer and use Orchestrator traversal presets to play their graphRAGPath chains.',
  nodeInspectorEmptyProvenance:
    'When provenance includes a codebasePath value, click it to open the referenced file in the Editor Workspace and keep AgenticRAG inspection grounded in the source.',
  contextSectionTooltip:
    'AgenticRAG context and ignore filters → compare dataset @context and ignore patterns against canonical AgenticRAG context IRI → keep Floating Panel Graph Traversal runs aligned with RACI catalog, schema, and markdown pipeline filters.',
  schemaLabel: AGENTIC_RAG_SCHEMA_LABEL,
  contextLabel: AGENTIC_RAG_CONTEXT_LABEL,
  datasetContextVocabLabel: AGENTIC_RAG_DATASET_CONTEXT_VOCAB_LABEL,
  graphRagPathIriLabel: GRAPHRAG_PATH_IRI_LABEL,
  pathEditorIntroText: AGENTIC_RAG_PATH_EDITOR_INTRO_TEXT,
  pathLegendEmptyText: AGENTIC_RAG_PATH_LEGEND_EMPTY_TEXT,
  pathLegendTraverseText: AGENTIC_RAG_PATH_LEGEND_TRAVERSE_TEXT,
  pathLegendExampleText: AGENTIC_RAG_PATH_LEGEND_EXAMPLE_TEXT,
  pathLegendMixedText: AGENTIC_RAG_PATH_LEGEND_MIXED_TEXT,
  pathLegendParseErrorText: AGENTIC_RAG_PATH_LEGEND_PARSE_ERROR_TEXT,
  traversalMetadataMissingText: GRAPHRAG_PATH_TRAVERSAL_METADATA_MISSING_TEXT,
  orchestratorTraversalTooltip: ORCHESTRATOR_TRAVERSAL_TOOLTIP,
  graphDataTableCurationTooltip: GRAPH_DATA_TABLE_CURATION_TOOLTIP,
  workflowLinksTooltip: WORKFLOW_LINKS_TOOLTIP,
  agenticReasoningLabelsTooltip: AGENTIC_REASONING_LABELS_TOOLTIP,
  graphRagPathMetadataTooltip: GRAPHRAG_PATH_METADATA_TOOLTIP,
  traversalPresetUiTooltip: TRAVERSAL_PRESET_UI_TOOLTIP,
  helpCheatsheetAlignmentTooltip: HELP_CHEATSHEET_ALIGNMENT_TOOLTIP,
  helpCodebaseIndexEntryPointsTooltip: HELP_CODEBASE_INDEX_ENTRY_POINTS_TOOLTIP,
  graphRagPipelineDescription: AGENTIC_GRAPH_RAG_PIPELINE_DESCRIPTION,
  orchestratorSectionListLabel: getOrchestratorSectionListLabel(),
}

export const PANEL_SURFACE_ROLE_OWNERS: Record<PanelSurfaceRoleKey, PanelSurfaceOwner> = {
  stats: 'bottomSurface.stats',
  parser: 'mainPanel.workflow',
  schema: 'mainPanel.workflow',
  data: 'workspace.editor',
  render: 'floatingPanel.renderer',
  table: 'workspace.graphTable',
  history: 'bottomSurface.history',
}

export type HelpStepKey = 'shortcuts' | 'cheatsheet' | 'commandMenu' | 'cloudflareMedia' | 'panelTour' | 'workflowLinks' | 'icons'

export interface HelpStepCopy {
  id: HelpStepKey
  title: string
  descriptionShort?: string
  descriptionLong?: string
}

export const HELP_STEP_COPY: Record<HelpStepKey, HelpStepCopy> = {
  shortcuts: {
    id: 'shortcuts',
    title: 'Shortcuts',
    descriptionShort: 'Keyboard and canvas shortcuts update live as you search in the Help header.',
    descriptionLong:
      'Keyboard and canvas shortcuts update live as you search in the Help header so you can discover actions like Apply, Format, replaying the launch spotlight, and canvas gestures without leaving the active workspace.',
  },
  cheatsheet: {
    id: 'cheatsheet',
    title:
      'Help tab → surface Behavior cheatsheet, icons, panel tour, and workflow links → connect shortcuts, selection modes, Renderer presets, and Orchestrator traversal helpers → keep panel usage aligned with GraphRAG workflow stages and AgenticRAG graph navigation for consistent, repeatable graph analysis.',
    descriptionShort:
      'Selection and creation modes shape how zoom, node drag, toolbar edge tools, and selection-based D3 visualizations work together.',
    descriptionLong:
      `Selection and creation modes shape how zoom, node drag, toolbar edge tools, and selection-driven D3 visualizations work together. The cheatsheet pairs canvas gestures with panel and workspace behavior plus selection-aware mini-charts (${MARKDOWN_DATA_VIEW_COPY.titleDefault} aggregates, dataset inspector distributions, hierarchy, cluster layers, and path visualizations) so selections and creation flows stay predictable as you switch between modes.`,
  },
  commandMenu: {
    id: 'commandMenu',
    title: 'Command Menu',
    descriptionShort:
      'Reference the shared `/` and `@` command catalog used by inline editors, Workflow Manager graph fields, canvas cards, widgets, and Markdown Viewer blocks.',
    descriptionLong:
      'The Command Menu section is the reference owner for shared slash actions, variable actions, reference actions, keyword actions, and media insertion commands. Runtime insertion still happens in the active editor; FloatingPanel Media owns the current `@` image, audio, video, webpage, iframe, YouTube, and graph rich-media list.',
  },
  cloudflareMedia: {
    id: 'cloudflareMedia',
    title: 'Cloudflare media',
    descriptionShort:
      'Runtime storage references for generated media: R2 blobs, D1 provenance, KV access-cache TTL, and Durable Object canvas-room sync.',
    descriptionLong:
      'Cloudflare media documents the runtime-ready storage topology for generated image, audio, and video assets without repo-local fake ids. R2 owns blobs, D1 owns media metadata and provenance, KV owns bounded access-cache TTL entries when bound, and Durable Objects own multi-user canvas-room sync state.',
  },
  panelTour: {
    id: 'panelTour',
    title: 'MainPanel tabs',
  },
  workflowLinks: {
    id: 'workflowLinks',
    title: 'Workflow links',
    descriptionShort:
      'Jump into the guided workflow or related panels that align with the 8-step GraphRAG pipeline.',
    descriptionLong:
      `Workflow links provide jump targets into guided Workflow Manager sections (including Graph Fields) so you can follow the Schema → Curation → Ingest → Enrich → Index → Reason → Produce → Reuse sequence from the RACI catalog without manually hunting for tabs. The Reason stage maps to the Floating Panel Graph Traversal surface (${getOrchestratorSectionListLabel()}) anchored to AgenticRAG JSON-LD graphRAGPath and context IRIs.`,
  },
  icons: {
    id: 'icons',
    title: 'Icon Library',
    descriptionShort: `These icons appear in MainPanel Collaboration Type rows, settings-derived MainPanel tabs, FloatingPanel view buttons including Media, and the ${UI_LABELS.graphFields} section header/table. Icons in this legend reuse the same UI Density: Icons settings so panel and data-view surfaces stay visually aligned.`,
    descriptionLong:
      `The Icon Library documents how MainPanel type icons, FloatingPanel view icons including Media, scope, origin, visibility, and field-type icons map to shared panel concepts so Collaboration, Integrations, MCP, Maps, Commerce, Settings, ${MARKDOWN_DATA_VIEW_COPY.titleDefault}, Workflow Manager graph fields, Schema Configurator, and AgenticRAG pipelines interpret the same visual language consistently. The legend follows the shared UI Density: Icons settings so toolbar, header, ${MARKDOWN_DATA_VIEW_COPY.titleDefault}, and tooltip icons remain visually aligned.`,
  },
}

export type SchemaStepKey =
  | '3'
  | '3.1'
  | '3.1.1'
  | '3.2'
  | '3.2.1'
  | '3.3'
  | '3.3.1'
  | '3.3.2'
  | '3.3.3'

export interface SchemaStepCopy {
  id: SchemaStepKey
  badge: string
  title: string
  descriptionShort?: string
  descriptionLong?: string
}

export interface SchemaFlowIntroCopy {
  descriptionShort: string
  descriptionLong?: string
}

export const SCHEMA_FLOW_INTRO: SchemaFlowIntroCopy = {
  descriptionShort: 'Zero-to-one schema flow for applying presets, tuning rules, and customizing UI.',
  descriptionLong:
    'Use the Schema Configurator tab to apply schema-config presets, refine node and edge behavior, and customize UI so each dataset’s graph matches its workflow and render presets.',
}

export const SCHEMA_STEP_COPY: Record<SchemaStepKey, SchemaStepCopy> = {
  '3': {
    id: '3',
    badge: 'Step 3',
    title: 'Schema Configurator',
    descriptionShort: 'Apply schema-config presets to style nodes, edges, and layouts.',
    descriptionLong:
      'Apply schema-config JSON presets from data/config/schema/ to style nodes, edges, and 2D/3D layout so visual styling and layout forces stay aligned with each dataset and workflow.',
  },
  '3.1': {
    id: '3.1',
    badge: 'Step 3.1',
    title: 'Apply presets from data/config/schema/',
  },
  '3.1.1': {
    id: '3.1.1',
    badge: 'Step 3.1.1.',
    title: 'Apply and manage schema-config presets',
    descriptionShort: 'Manage the active schema-config preset with Apply, Clear, and Reset.',
    descriptionLong:
      'Use Apply, Clear Schema, and Reset with the toolbar actions to manage the active schema-config preset from data/config/schema/ so you can safely iterate on presets without losing a known-good configuration.',
  },
  '3.2': {
    id: '3.2',
    badge: 'Step 3.2',
    title: 'Tune node, edge, and layout rules',
    descriptionShort: 'Tune node, edge, and layout rules for the active schema-config.',
    descriptionLong:
      'Adjust behavior, label styles, endpoints, routing, and performance for the active schema-config after presets have been applied so hover, selection, and physics feel consistent with the workflow you are modeling.',
  },
  '3.2.1': {
    id: '3.2.1',
    badge: 'Step 3.2.1.',
    title: 'Refine schema behavior and layout',
    descriptionShort: 'Refine schema behavior and layout in Advanced settings.',
    descriptionLong:
      'Use Advanced to edit per-node and per-edge rules, grouping, layout forces, and performance tuning for the active schema-config, focusing on higher-level behaviors like clustering, link distances, and label visibility.',
  },
  '3.3': {
    id: '3.3',
    badge: 'Step 3.3',
    title: 'Customize node and edge UI',
    descriptionShort: 'Customize node and edge UI for the active schema-config.',
    descriptionLong:
      'Use the UI Editor to customize node and edge UI for the active schema-config. Use the Text Editor to edit the underlying schema-config file directly when you need to script changes or copy presets between projects.',
  },
  '3.3.1': {
    id: '3.3.1',
    badge: 'Step 3.3.1.',
    title: 'Customize node and edge UI with Schema UI Editor',
    descriptionShort: 'Use Schema UI Editor to adjust per-type node and edge styles.',
    descriptionLong:
      'Use Schema UI Editor to adjust per-type node and edge styles while the Text Editor opens the schema-config JSON for direct edits, keeping visual tweaks and underlying schema-config JSON in sync.',
  },
  '3.3.2': {
    id: '3.3.2',
    badge: 'Step 3.3.2',
    title: 'Validation and rules',
    descriptionShort: 'Configure validation and rules for per-type node and edge properties.',
  },
  '3.3.3': {
    id: '3.3.3',
    badge: 'Step 3.3.3',
    title: 'Layout',
    descriptionShort: 'Tune layout forces and distances for the active schema-config.',
  },
}

export interface SchemaSectionCopy {
  id: SchemaSectionId
  title: string
  descriptionShort?: string
  descriptionLong?: string
}

const SCHEMA_SECTION_STEP_MAP: Record<SchemaSectionId, SchemaStepKey> = {
  schemaApplyPresets: '3.1',
  schemaTuneRules: '3.2',
  schemaCustomizeUi: '3.3',
  schemaValidationRules: '3.3.2',
}

export function getSchemaSectionCopy(id: SchemaSectionId): SchemaSectionCopy {
  const section = SCHEMA_SECTIONS.find(s => s.id === id)
  const stepKey = SCHEMA_SECTION_STEP_MAP[id]
  const step = SCHEMA_STEP_COPY[stepKey]
  return {
    id,
    title: section?.label ?? step.title,
    descriptionShort: step.descriptionShort,
    descriptionLong: step.descriptionLong,
  }
}

export interface SchemaSidebarItem extends SchemaSectionCopy {
  sectionId: SchemaSectionId
}

export function getSchemaSidebarItems(): SchemaSidebarItem[] {
  return SCHEMA_SECTIONS.map(section => {
    const copy = getSchemaSectionCopy(section.id)
    return {
      sectionId: section.id,
      id: copy.id,
      title: copy.title,
      descriptionShort: copy.descriptionShort,
      descriptionLong: copy.descriptionLong,
    }
  })
}

export type ParserStepKey = 'parserSelection' | 'parserData'

export interface ParserStepCopy {
  id: ParserStepKey
  badge: string
  title: string
  descriptionShort?: string
  tooltip?: string
  descriptionLong?: string
}

export const PARSER_STEP_COPY: Record<ParserStepKey, ParserStepCopy> = {
  parserSelection: {
    id: 'parserSelection',
    badge: 'Parser',
    title: 'Select AgenticRAG parser spec',
    descriptionShort: 'Choose AgenticRAG-compatible parser specs to map CSV or JSON into Graph JSON-LD.',
    tooltip:
      'Parser selection → choose AgenticRAG parser specs for CSV or JSON inputs → map raw rows into GraphData nodes and edges that stay structurally aligned with the active AgenticRAG schema.',
    descriptionLong:
      'Select, import, or clear AgenticRAG parser specs so Loader and Parser stay generic across datasets. Parser specs convert arbitrary CSV or JSON into AgenticRAG-compliant GraphData objects, using structural-only validation with no domain semantics while remaining aligned with the active node, edge, and graph schemas.',
  },
  parserData: {
    id: 'parserData',
    badge: 'Data',
    title: 'Import, validate, and inspect graph',
    descriptionShort: 'Load datasets, apply presets, and review validation before export.',
    tooltip:
      'Parser data → validate and inspect parsed GraphData structure and metrics → confirm node and edge quality, JSON-LD mapping, and summary stats before moving into schema tuning, Orchestrator traversal, and Renderer presets.',
    descriptionLong:
      'Load datasets, apply workflow presets, and review validation before export. The Data section surfaces structural validation errors, warnings, and summary metrics so you can confirm GraphData quality before moving into schema tuning, enrichment, and export.',
  },
}

export type PipelineStageKey = 'ingestValidate' | 'agenticReasoning' | 'renderInspect'

export interface PipelineStageCopy {
  id: PipelineStageKey
  badge: string
  workflowStepId: WorkflowStepId
  descriptionShort: string
  descriptionLong?: string
}

export const PIPELINE_STAGE_COPY: Record<PipelineStageKey, PipelineStageCopy> = {
  ingestValidate: {
    id: 'ingestValidate',
    badge: 'Ingest / Validate',
    workflowStepId: 3,
    descriptionShort: WORKFLOW_STEP_COPY[3].descriptionShort,
    descriptionLong: WORKFLOW_STEP_COPY[3].descriptionLong,
  },
  agenticReasoning: {
    id: 'agenticReasoning',
    badge: 'Agentic Reasoning',
    workflowStepId: 6,
    descriptionShort: WORKFLOW_STEP_COPY[6].descriptionShort,
    descriptionLong: WORKFLOW_STEP_COPY[6].descriptionLong,
  },
  renderInspect: {
    id: 'renderInspect',
    badge: 'Render / Inspect',
    workflowStepId: 8,
    descriptionShort: WORKFLOW_STEP_COPY[8].descriptionShort,
    descriptionLong: WORKFLOW_STEP_COPY[8].descriptionLong,
  },
}

export type RenderPanelSectionKey =
  | 'presetsAndTuning'
  | 'datasetInspector'
  | 'codebaseIndexPipeline'
  | 'mediaNodes'

export interface RenderPanelSectionCopy {
  id: RenderPanelSectionKey
  title: string
  badge?: string
  descriptionShort?: string
  descriptionLong?: string
  tooltip?: string
  viewToggleHelper?: string
}

export const RENDER_PANEL_SECTION_COPY: Record<RenderPanelSectionKey, RenderPanelSectionCopy> = {
  presetsAndTuning: {
    id: 'presetsAndTuning',
    badge: PIPELINE_STAGE_COPY.renderInspect.badge,
    title: 'Render / Inspect (Renderer, indexers)',
    descriptionShort:
      'Apply renderer presets and tune 2D/3D layout settings for AgenticRAG GraphData and traversal overlays.',
    descriptionLong:
      'Use renderer presets and 2D/3D tuning controls to align appearance with AgenticRAG graph semantics and GraphRAG traversal highlights while keeping visual choices as a late, replaceable layer on top of GraphData.',
    tooltip:
      'Renderer presets → map AgenticRAG nodes, edges, and traversal overlays into 2D/3D camera and layout settings → keep visual styling replaceable while preserving GraphRAG semantics and Orchestrator playback clarity.',
  },
  datasetInspector: {
    id: 'datasetInspector',
    badge: 'Dataset',
    title: 'Dataset Inspector',
    descriptionShort:
      'Inspect GraphData size, distinct relationships, and AgenticRAG context for the active dataset.',
    descriptionLong:
      'Use the Dataset Inspector to review node and edge counts, distinct (source,label,target) relationships, and AgenticRAG @context alignment so render presets and traversal workflows stay grounded in the underlying JSON-LD graph.',
    tooltip:
      'Dataset Inspector → summarize GraphData size, distinct relationships, and AgenticRAG @context alignment → ground render presets and traversal workflows in the actual JSON-LD graph for reliable inspection.',
  },
  codebaseIndexPipeline: {
    id: 'codebaseIndexPipeline',
    badge: 'Markdown',
    title: 'Markdown pipeline',
    descriptionShort:
      'Copy the markdown→graph pipeline command for terminal execution.',
    descriptionLong:
      'Use the Markdown pipeline section to copy the end-to-end markdown→JSON-LD graph and schema command so documentation GraphData, AgenticRAG schema bindings, and orchestrator configs stay in sync between offline runs and the canvas Floating Panel renderer surface.',
    tooltip:
      'Markdown pipeline → copy the markdown→graph pipeline → keep documentation GraphData, schema configs, and Floating Panel renderer/Orchestrator views synchronized between offline runs and the canvas.',
  },
  mediaNodes: {
    id: 'mediaNodes',
    badge: 'Media',
    title: 'Media nodes',
    descriptionShort:
      'Summarize media-capable nodes and control Rich Media and opacity.',
    descriptionLong:
      'Media nodes are created during ingest based on media_url, media_kind, iframe_url, video, image, and related properties. This section summarizes media-capable nodes and exposes Rich Media and opacity controls so renderer decisions stay view-only while media metadata remains attached to GraphData.',
    tooltip:
      'Media nodes → list nodes with media_url and media_kind inferred from ingestion → treat Rich Media and opacity as view-level toggles without mutating GraphData so media overlays remain a replaceable renderer choice.',
    viewToggleHelper:
      'Circle-only: highlight media-capable nodes. Panel-only: render media panels without mutating GraphData.',
  },
}
