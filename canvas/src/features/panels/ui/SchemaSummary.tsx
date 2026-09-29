import { PanelSelect } from '@/lib/ui/panelFormControls'
import { useGraphStore } from '@/hooks/useGraphStore'
import Tooltip from '@/features/panels/ui/Tooltip'
import { getPanelSurfaceLabel } from '@/features/panels/config'
import { toSchemaImportFileName } from '@/features/schema-editor/utils'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { emitHelpScrollToAnchor } from '@/features/panels/utils/helpPanelEvents'
import { UI_ANCHORS } from '@/lib/config'
import { getUiSectionActionClassName } from '@/lib/ui/sectionChipChrome'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiPrimaryLinkButtonClassName } from '@/features/toolbar/ui/toolbarStyles'

interface SchemaSummaryProps {
  className?: string
  variant?: 'full' | 'inline'
  showTitle?: boolean
  showSchemaSummary?: boolean
  showDataSummary?: boolean
  showLintSummary?: boolean
  onOpenSchemaUiEditor?: () => void
}

export default function SchemaSummary({
  className,
  variant = 'full',
  showTitle,
  showSchemaSummary,
  showDataSummary,
  showLintSummary,
  onOpenSchemaUiEditor,
}: SchemaSummaryProps) {
  const schema = useGraphStore(s => s.schema)
  const data = useGraphStore(s => s.graphData)
  const schemaImportLabel = useGraphStore(s => s.schemaImportLabel)
  const schemaOpOk = useGraphStore(s => s.schemaOpOk)
  const schemaOpMsg = useGraphStore(s => s.schemaOpMsg)
  const lintCount = useGraphStore(s => s.schemaLintCount)
  const lintExamplePath = useGraphStore(s => s.schemaLintExamplePath)
  const lintExamplePaths = useGraphStore(s => s.schemaLintExamplePaths)
  const setSchemaLintActivePath = useGraphStore(s => s.setSchemaLintActivePath)
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || 'text-xs',
  )

  const resolvedShowTitle = showTitle ?? variant === 'full'
  const resolvedShowSchemaSummary = showSchemaSummary ?? true
  const resolvedShowDataSummary = showDataSummary ?? variant === 'full'
  const resolvedShowLintSummary = showLintSummary ?? variant === 'inline'

  const catalog = schema && schema.catalog
  const catalogNodeTypes = catalog && Array.isArray(catalog.nodeTypes) ? catalog.nodeTypes.length : 0
  const catalogEdgeLabels = catalog && Array.isArray(catalog.edgeLabels) ? catalog.edgeLabels.length : 0

  const fallbackNodeTypes =
    schema && schema.nodeStyles && typeof schema.nodeStyles === 'object'
      ? Object.keys(schema.nodeStyles).length
      : 0
  const fallbackEdgeLabels =
    schema && schema.edgeStyles && typeof schema.edgeStyles === 'object'
      ? Object.keys(schema.edgeStyles).length
      : 0

  const nodeTypes = catalogNodeTypes > 0 ? catalogNodeTypes : fallbackNodeTypes
  const edgeLabels = catalogEdgeLabels > 0 ? catalogEdgeLabels : fallbackEdgeLabels
  const nodesCount = data && Array.isArray(data.nodes) ? data.nodes.length : 0
  const edgesCount = data && Array.isArray(data.edges) ? data.edges.length : 0
  const metadata =
    data && typeof data.metadata === 'object' && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : null
  const ontologiesRaw =
    metadata && Object.prototype.hasOwnProperty.call(metadata, 'ontologies')
      ? (metadata.ontologies as unknown)
      : null
  const graphLayersRaw =
    metadata && Object.prototype.hasOwnProperty.call(metadata, 'graphLayers')
      ? (metadata.graphLayers as unknown)
      : null
  const ontologiesCount = Array.isArray(ontologiesRaw) ? ontologiesRaw.length : 0
  const graphLayersCount = Array.isArray(graphLayersRaw) ? graphLayersRaw.length : 0

  const hasSchema = nodeTypes > 0 || edgeLabels > 0
  const hasData = nodesCount > 0 || edgesCount > 0

  const schemaImportFileName = toSchemaImportFileName(schemaImportLabel)

  const schemaOpClass =
    schemaOpOk === true
      ? UI_THEME_TOKENS.status.success
      : schemaOpOk === false
        ? UI_THEME_TOKENS.status.error
        : ''

  let lintContent: JSX.Element | string = 'Lint: not run'
  if (lintCount != null) {
    if (lintCount === 0) {
      lintContent = 'Lint: 0 metadata warnings'
    } else {
      const label = lintCount === 1 ? 'warning' : 'warnings'
      const hasMultipleExamples = Array.isArray(lintExamplePaths) && lintExamplePaths.length > 1
      if (hasMultipleExamples) {
        const currentValue =
          lintExamplePath && lintExamplePaths.includes(lintExamplePath) ? lintExamplePath : ''
        lintContent = (
          <>
            Lint: {lintCount} metadata {label}{' '}
            <PanelSelect
              className={`ml-1 px-1 py-0.5 text-xs border ${UI_THEME_TOKENS.input.border} rounded ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} ${UI_THEME_TOKENS.focus.primaryBorderRing}`}
              value={currentValue}
              onValueChange={selectedValueInput => {
                const nextPath = selectedValueInput
                if (!nextPath) return
                setSchemaLintActivePath(nextPath)
                if (onOpenSchemaUiEditor) {
                  onOpenSchemaUiEditor()
                }
              }}
            >
              <option value="">(examples)</option>
              {lintExamplePaths.map(path => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </PanelSelect>
          </>
        )
      } else if (lintExamplePath) {
        lintContent = (
          <>
            Lint: {lintCount} metadata {label}{' '}
            (e.g.,{' '}
            <button
              type="button"
              className={uiPrimaryLinkButtonClassName}
              onClick={() => {
                if (onOpenSchemaUiEditor) {
                  onOpenSchemaUiEditor()
                }
              }}
            >
              {lintExamplePath}
            </button>
            )
          </>
        )
      } else {
        lintContent = `Lint: ${lintCount} metadata ${label}`
      }
    }
  }

  const sections: Array<JSX.Element> = []
  if (resolvedShowTitle) {
    sections.push(<section key="title" className={`font-semibold uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`}>SCHEMA SUMMARY</section>)
  }
  if (resolvedShowSchemaSummary) {
    sections.push(
      <Tooltip
        key="schema"
        content={
          hasSchema
            ? 'Counts of node types and edge labels in the active schema.'
            : 'No schema is currently applied. Use the Schema Configurator tab to load or edit a schema.'
        }
        maxWidthPx={260}

      >
        <span className={hasSchema ? '' : `${UI_THEME_TOKENS.status.warning} font-medium`}>
          {hasSchema ? (
            <>
              Schema: {nodeTypes} node types · {edgeLabels} edge labels · Import: {schemaImportFileName || 'none'}
              {schemaOpMsg ? (
                <> · <span className={schemaOpClass}>Status: {schemaOpMsg}</span></>
              ) : null}
            </>
          ) : (
            <>
              Schema: none (no schema applied) · Import: {schemaImportFileName || 'none'}
              {schemaOpMsg ? (
                <> · <span className={schemaOpClass}>Status: {schemaOpMsg}</span></>
              ) : null}
            </>
          )}
        </span>
      </Tooltip>,
    )
  }
  if (resolvedShowDataSummary) {
    sections.push(
      <Tooltip
        key="data"
        content={
          hasData
            ? 'Counts of nodes and edges in the loaded graph data.'
            : `No graph data is currently loaded. Use Load Data or the ${getPanelSurfaceLabel('data')} surface to load a dataset.`
        }
        maxWidthPx={260}

      >
        <span className={hasData ? '' : `${UI_THEME_TOKENS.status.warning} font-medium`}>
          {hasData ? (
            <>Data: {nodesCount} nodes · {edgesCount} edges</>
          ) : (
            'Data: none loaded'
          )}
        </span>
      </Tooltip>,
    )
  }
  if (ontologiesCount > 0 || graphLayersCount > 0) {
    const parts: string[] = []
    if (ontologiesCount > 0) {
      parts.push(`Ontologies: ${ontologiesCount}`)
    }
    if (graphLayersCount > 0) {
      parts.push(`Cluster layers: ${graphLayersCount}`)
    }
    sections.push(
      <Tooltip
        key="ontologies"
        content="Counts come from markdown frontmatter ontologies/graphLayers or GraphData metadata. Click to open Help on multi-ontology graphs and cluster layers."
        maxWidthPx={260}

      >
        <button
          type="button"
          className={getUiSectionActionClassName('primary', 'cursor-pointer')}
          onClick={() => {
            try {
              emitMainPanelOpen({ tab: 'help' as const })
              emitHelpScrollToAnchor(UI_ANCHORS.helpGraphLayers)
            } catch {
              void 0
            }
          }}
        >
          {parts.join(' · ')}
        </button>
      </Tooltip>,
    )
  }
  if (resolvedShowLintSummary) {
    sections.push(<span key="lint">{lintContent}</span>)
  }

  return (
    <section className={className ?? (variant === 'full' ? 'mb-1' : undefined)}>
      <section
        className={[
          `inline-flex items-center gap-2 ${UI_THEME_TOKENS.text.secondary}`,
          uiPanelMicroLabelTextSizeClass,
        ].join(' ')}
      >
        {sections.map((section, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 ? <span className={UI_THEME_TOKENS.text.tertiary}>|</span> : null}
            {section}
          </span>
        ))}
      </section>
    </section>
  )
}
