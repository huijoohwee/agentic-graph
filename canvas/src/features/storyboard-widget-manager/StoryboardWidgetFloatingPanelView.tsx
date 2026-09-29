import React from 'react'
import { ArrowDownToDot, ArrowUpFromDot } from 'lucide-react'
import { HorizontalResizeSeparatorHr } from '@/components/ui/VerticalResizeSeparatorHr'
import {
  resolveCanvasKeyTypeValueDensityClassName,
  useCanvasKeyTypeValueRuntime,
  useCanvasKeyTypeValueStaticRowProps,
} from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { KTV_STATUS_TEXT_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import {
  KeyTypeValueHeader,
  KeyTypeValueSectionStack,
} from 'grph-shared/react/keyTypeValueLayout'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { VideoAgentValidationImportControls } from '@/features/video-agent/VideoAgentValidationImportControls'
import { STORYBOARD_VIDEO_AGENT_VALIDATION_IMPORT_OPTIONS } from '@/features/video-agent/videoAgentValidationConfig'
import type { WorkspaceImportUrlOpts } from '@/features/markdown-explorer/workspaceActionBridge'
import { loadLaunchDropdownFallbackModule } from '@/features/toolbar/launchDropdownFallbackModule'
import {
  readStoryboardWidgetFloatingPanelSplitHeightsPx,
  resolveStoryboardWidgetFloatingPanelSplitResize,
  type StoryboardWidgetFloatingPanelSplitHeightsPx,
} from '@/lib/storyboardWidget/storyboardWidgetFloatingPanelSplit'
import { buildStoryboardWidgetPortRows, type StoryboardWidgetPortRow } from '@/lib/storyboardWidget/storyboardWidgetPortRows'
import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'

const STORYBOARD_WIDGET_ROW_DIRECTION_LABEL: Record<StoryboardWidgetPortRow['direction'], string> = {
  input: 'Input',
  output: 'Output',
}

const STORYBOARD_WIDGET_ROW_DIRECTION_ICON: Record<StoryboardWidgetPortRow['direction'], React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  input: ArrowDownToDot,
  output: ArrowUpFromDot,
}

const STORYBOARD_WIDGET_ROW_DIRECTION_CLASS: Record<StoryboardWidgetPortRow['direction'], string> = {
  input: 'border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-700/70 dark:bg-sky-950/30 dark:text-sky-300',
  output: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-950/30 dark:text-emerald-300',
}

function DirectionChip({ direction }: { direction: StoryboardWidgetPortRow['direction'] }) {
  const Icon = STORYBOARD_WIDGET_ROW_DIRECTION_ICON[direction]
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold leading-4',
        STORYBOARD_WIDGET_ROW_DIRECTION_CLASS[direction],
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{STORYBOARD_WIDGET_ROW_DIRECTION_LABEL[direction]}</span>
    </span>
  )
}

function StoryboardWidgetPortRowView({
  row,
  selected,
  selectionActive,
  onSelect,
  staticRowProps,
}: {
  row: StoryboardWidgetPortRow
  selected: boolean
  selectionActive: boolean
  onSelect: (rowKey: string) => void
  staticRowProps: Pick<
    React.ComponentProps<typeof KeyTypeValueStaticRow>,
    'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'
  >
}) {
  return (
    <section
      className={cn(selectionActive && !selected && 'opacity-45 transition-opacity hover:opacity-90')}
      data-kg-storyboard-widget-port-row="1"
      data-kg-storyboard-widget-port-direction={row.direction}
      data-kg-storyboard-widget-port-key={row.portKey}
      data-kg-storyboard-widget-node-id={row.nodeId}
      data-kg-storyboard-widget-port-row-key={row.key}
      data-kg-storyboard-widget-port-selected={selected ? 'true' : 'false'}
      data-kg-storyboard-widget-port-dimmed={selectionActive && !selected ? 'true' : 'false'}
    >
      <KeyTypeValueStaticRow
        {...staticRowProps}
        align="start"
        activeClassName={selected ? UI_THEME_TOKENS.table.rowSelected : staticRowProps.activeClassName}
        onClick={() => onSelect(row.key)}
        keyNode={(
          <span className="flex min-w-0 flex-col leading-4">
            <span className="truncate font-semibold">{row.nodeLabel}</span>
            <span className={cn('truncate text-xs font-normal', UI_THEME_TOKENS.text.tertiary)}>{row.nodeType}</span>
          </span>
        )}
        typeNode={(
          <span className="flex min-w-0 max-w-full items-center justify-start gap-1 overflow-hidden sm:justify-end">
            <DirectionChip direction={row.direction} />
            <span className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.secondary)}>{row.socketType}</span>
          </span>
        )}
        valueNode={(
          <span className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
            <span className="min-w-0 truncate font-mono text-xs">{row.portKey}</span>
            <span className={cn('shrink-0 rounded border px-1 py-0.5 text-xs leading-4', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.tertiary)}>
              {row.connectedEdgeCount}
            </span>
          </span>
        )}
      />
    </section>
  )
}

function StoryboardWidgetPortDetailRows({ row }: { row: StoryboardWidgetPortRow | null }) {
  const ktvRuntime = useCanvasKeyTypeValueRuntime()
  const compactDensityClassName = resolveCanvasKeyTypeValueDensityClassName(ktvRuntime, 'compact')
  const compactStaticRowProps = {
    textSizeClassName: ktvRuntime.uiPanelKeyValueTextSizeClass,
    fontClassName: ktvRuntime.uiPanelTextFontClass,
    densityClassName: compactDensityClassName,
    activeClassName: UI_THEME_TOKENS.table.rowHoverHighlight,
  } as const

  if (!row) {
    return (
      <section className={cn('px-1 py-2', KTV_STATUS_TEXT_CLASS_NAME)} data-kg-storyboard-widget-port-detail-empty="1">
        Select an input or output row.
      </section>
    )
  }
  const connectedText = row.connectedEdgeIds.length > 0 ? row.connectedEdgeIds.join(', ') : 'None'
  return (
    <section
      className="min-h-0"
      data-kg-storyboard-widget-port-detail-selected-row-key={row.key}
      data-kg-storyboard-widget-port-detail-node-id={row.nodeId}
      data-kg-storyboard-widget-port-detail-port-key={row.portKey}
    >
      <KeyTypeValueHeader keyLabel="Property" typeLabel="Type" valueLabel="Value" stickyOffsetClassName="top-0" />
      <KeyTypeValueSectionStack>
        <KeyTypeValueStaticRow
          {...compactStaticRowProps}
          keyNode="Node"
          typeNode={row.nodeType}
          valueNode={<span className="min-w-0 truncate">{row.nodeLabel}</span>}
        />
        <KeyTypeValueStaticRow
          {...compactStaticRowProps}
          keyNode="Node ID"
          typeNode="id"
          valueNode={<span className="min-w-0 truncate font-mono text-xs">{row.nodeId}</span>}
        />
        <KeyTypeValueStaticRow
          {...compactStaticRowProps}
          keyNode="Port"
          typeNode={<DirectionChip direction={row.direction} />}
          valueNode={<span className="min-w-0 truncate font-mono text-xs">{row.portKey}</span>}
        />
        <KeyTypeValueStaticRow
          {...compactStaticRowProps}
          keyNode="Socket"
          typeNode="type"
          valueNode={<span className="min-w-0 truncate">{row.socketType}</span>}
        />
        <KeyTypeValueStaticRow
          {...compactStaticRowProps}
          align="start"
          keyNode="Edges"
          typeNode={`${row.connectedEdgeCount}`}
          valueNode={<span className="min-w-0 truncate font-mono text-xs" title={connectedText}>{connectedText}</span>}
        />
      </KeyTypeValueSectionStack>
    </section>
  )
}

export function StoryboardWidgetFloatingPanelView() {
  const compactStaticRowProps = useCanvasKeyTypeValueStaticRowProps('compact')
  const graphData = useActiveGraphRenderData(true)
  const summary = React.useMemo(() => buildStoryboardWidgetPortRows(graphData), [graphData])
  const selectedRowKey = useGraphStore(s => s.storyboardWidgetSelectedPortRowKey || '')
  const setSelectedRowKey = useGraphStore(s => s.setStoryboardWidgetSelectedPortRowKey)
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const listRef = React.useRef<HTMLElement | null>(null)
  const rowsPaneRef = React.useRef<HTMLElement | null>(null)
  const detailsPaneRef = React.useRef<HTMLElement | null>(null)
  const resizeHandleRef = React.useRef<HTMLHRElement | null>(null)
  const [splitHeightsPx, setSplitHeightsPx] = React.useState<StoryboardWidgetFloatingPanelSplitHeightsPx | null>(null)
  const splitHeightsPxRef = React.useRef<StoryboardWidgetFloatingPanelSplitHeightsPx | null>(splitHeightsPx)
  splitHeightsPxRef.current = splitHeightsPx
  const totalCount = summary.rows.length
  const rowKeys = React.useMemo(() => new Set(summary.rows.map(row => row.key)), [summary.rows])
  const selectedRow = React.useMemo(
    () => summary.rows.find(row => row.key === selectedRowKey) || null,
    [selectedRowKey, summary.rows],
  )
  const handleSelectRow = React.useCallback((rowKey: string) => {
    const key = String(rowKey || '').trim()
    setSelectedRowKey(selectedRowKey === key ? null : key)
  }, [selectedRowKey, setSelectedRowKey])
  const importUrlFallback = React.useCallback(async (urlRaw: string, opts?: WorkspaceImportUrlOpts) => {
    const importOptions = opts || STORYBOARD_VIDEO_AGENT_VALIDATION_IMPORT_OPTIONS
    const module = await loadLaunchDropdownFallbackModule()
    await module.importUrlFallback({
      urlRaw,
      canvas2dRenderer: importOptions.canvas2dRenderer === 'storyboard' || importOptions.canvas2dRenderer === 'design' ? importOptions.canvas2dRenderer : 'd3',
      documentSemanticMode: importOptions.documentSemanticMode,
      pushUiToast,
    })
  }, [pushUiToast])

  React.useEffect(() => {
    if (!selectedRowKey) return
    if (rowKeys.has(selectedRowKey)) return
    setSelectedRowKey(null)
  }, [rowKeys, selectedRowKey, setSelectedRowKey])

  React.useLayoutEffect(() => {
    if (!selectedRowKey) return
    const root = listRef.current
    if (!root) return
    const selector = `[data-kg-storyboard-widget-port-row-key="${selectedRowKey.replace(/["\\]/g, '\\$&')}"]`
    const row = root.querySelector<HTMLElement>(selector)
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedRowKey])

  const readCurrentSplitHeightsPx = React.useCallback(() => {
    return splitHeightsPxRef.current || readStoryboardWidgetFloatingPanelSplitHeightsPx({
      rowsElement: rowsPaneRef.current,
      detailsElement: detailsPaneRef.current,
    })
  }, [])

  React.useEffect(() => {
    const el = resizeHandleRef.current
    if (!el) return
    return bindResizeSeparatorDragRuntime<StoryboardWidgetFloatingPanelSplitHeightsPx>({
      resizeHandleEl: el,
      cursor: 'row-resize',
      readCurrentValue: readCurrentSplitHeightsPx,
      setPreviewValue: setSplitHeightsPx,
      commitValue: setSplitHeightsPx,
      resolveNextValueFromPointerDrag: input => resolveStoryboardWidgetFloatingPanelSplitResize({
        startHeightsPx: input.startValue,
        deltaY: input.deltaY,
      }),
    })
  }, [readCurrentSplitHeightsPx])

  const rowsPaneStyle = splitHeightsPx
    ? { flex: `0 0 ${splitHeightsPx.rows}px` }
    : { flex: '1 1 62%' }
  const detailsPaneStyle = splitHeightsPx
    ? { flex: `1 1 ${splitHeightsPx.details}px` }
    : { flex: '0 1 38%' }

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-2"
      aria-label="Storyboard Widget inputs and outputs"
      data-kg-storyboard-widget-floating-panel="1"
      data-kg-storyboard-widget-port-count={totalCount}
      data-kg-storyboard-widget-input-count={summary.inputCount}
      data-kg-storyboard-widget-output-count={summary.outputCount}
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <section className="min-w-0">
          <section className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>Storyboard Widget</section>
          <section className={cn('truncate text-xs', UI_THEME_TOKENS.text.secondary)} data-kg-storyboard-widget-port-summary="1">
            {summary.inputCount} inputs, {summary.outputCount} outputs, {summary.connectedCount} connected
          </section>
        </section>
      </header>
      <section className="flex min-h-0 flex-1 flex-col" data-kg-storyboard-widget-port-split="1">
        <section
          ref={rowsPaneRef}
          className="min-h-0 overflow-hidden"
          style={rowsPaneStyle}
          data-kg-storyboard-widget-port-list-pane="1"
        >
          <section ref={listRef} className={cn(UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME, 'h-full min-h-0 px-1 pb-2')} data-kg-storyboard-widget-port-list="1">
            <KeyTypeValueHeader keyLabel="Node" typeLabel="Port" valueLabel="Key / edges" />
            {totalCount > 0 ? (
              <KeyTypeValueSectionStack>
                {summary.rows.map(row => (
                  <StoryboardWidgetPortRowView
                    key={row.key}
                    row={row}
                    selected={selectedRowKey === row.key}
                    selectionActive={!!selectedRowKey}
                    onSelect={handleSelectRow}
                    staticRowProps={compactStaticRowProps}
                  />
                ))}
              </KeyTypeValueSectionStack>
            ) : (
              <section className={cn('px-1 py-2', KTV_STATUS_TEXT_CLASS_NAME)}>
                No Storyboard Widget inputs or outputs.
              </section>
            )}
          </section>
        </section>
        <HorizontalResizeSeparatorHr
          ref={resizeHandleRef}
          ariaLabel="Resize Storyboard Widget rows and details"
          className="kg-storyboard-widget-floating-panel-split-resize"
          data-kg-storyboard-widget-port-split-resize="1"
          tabIndex={0}
        />
        <section
          ref={detailsPaneRef}
          className={cn(UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME, 'min-h-0 px-1 pb-2 pt-1')}
          style={detailsPaneStyle}
          data-kg-storyboard-widget-port-detail-panel="1"
        >
          <header className="flex items-center justify-between gap-2 px-1 pb-1">
            <section className={cn('min-w-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>Details</section>
            {selectedRow ? (
              <section className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.secondary)}>
                {selectedRow.connectedEdgeCount} edges
              </section>
            ) : null}
          </header>
          <VideoAgentValidationImportControls
            runtimeInput={graphData}
            optionMode="import"
            importUrlFallback={importUrlFallback}
            importUrlOpts={STORYBOARD_VIDEO_AGENT_VALIDATION_IMPORT_OPTIONS}
            containerClassName={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.text.secondary)}
            fieldClassName={cn('min-h-8 min-w-0 rounded border px-2 py-1 text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
            textAreaClassName={cn('min-h-16 min-w-0 rounded border px-2 py-1 text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
            actionClassName={cn('min-h-8 rounded border px-2 text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            containerAriaLabel="Storyboard Widget video-agent validation import controls"
            docPathAriaLabel="Storyboard Widget video-agent validation document path"
            urlsAriaLabel="Storyboard Widget video-agent validation import URLs"
            actionsAriaLabel="Storyboard Widget video-agent validation URL actions"
            optionAriaLabel={option => `Import validation ${option.label}`}
            optionButtonLabel={option => `Import ${option.label}`}
            showFieldLabels
            storyboardWidgetDataHook
          />
          <StoryboardWidgetPortDetailRows row={selectedRow} />
        </section>
      </section>
    </section>
  )
}
