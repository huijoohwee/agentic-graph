import React from 'react'

import { AnchoredPopover } from '@/components/ui/AnchoredPopover'
import IconButton from '@/components/IconButton'
import { commitActiveCardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import type { WidgetOpenExternalAction } from '@/components/StoryboardWidget/widgetOpenExternalAction'
import { GRAPH_FIELDS_ENTRY_SHORTCUT_NODE_LABEL } from '@/features/panels/views/graph-fields/graphFieldsEntryCommands'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { getRichMediaPanelViewTitle } from '@/lib/render/richMediaSsot'
import { uiToolbarColumnMenuListClassName } from '@/features/toolbar/ui/toolbarStyles'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { Copy, Eraser, ExternalLink, FlipHorizontal2, GitBranch, GitMerge, HelpCircle, Link, PanelRightOpen, Play, Share2, SplitSquareVertical, Trash2, type LucideIcon } from 'lucide-react'
import { ImportUrlPrompt } from '@/features/toolbar/ImportUrlPrompt'
import { unwrapUserProvidedText } from '@/lib/url'

export type WidgetEditorActionsToolbarProps = {
  visible: boolean
  ariaLabel?: string
  navClassName?: string
  navStyle?: React.CSSProperties
  iconSizeClass: string
  iconStrokeWidth: number
  active: boolean
  enableHandlesDisabled: boolean
  convertToLoopDisabled: boolean
  duplicateDisabled: boolean
  richMediaViewToggle?: {
    visible: boolean
    isKtvRows: boolean
    onToggle: () => void
  }
  outputVersionControl?: React.ReactNode
  flipAction?: { flipped: boolean; onFlip: () => void }
  openExternalAction?: WidgetOpenExternalAction
  actionVisibility?: Partial<{
    run: boolean
    updateKvEntry: boolean
    openInSidepane: boolean
    enableHandles: boolean
    probeTree: boolean
    convertToLoop: boolean
    duplicate: boolean
    clearOutput: boolean
    help: boolean
    remove: boolean
  }>
  importUrlAction?: {
    visible: boolean
    initialUrl?: string
    onConfirm: (url: string) => void
  }
  onRun: () => void
  onDuplicate: () => void
  onClearOutput: () => void
  onHelp: () => void
  onRemove: () => void
  onEnableHandlesForAllInputs?: () => void
  onProbeTree?: () => void
  onConvertToLoopNode: () => void
  onUpdateKvEntry?: () => void
  onOpenInSidepane?: () => void
  maxWidthPx?: number
}

type WidgetToolbarActionId =
  | 'flip'
  | 'run'
  | 'clear-output'
  | 'import-url'
  | 'rich-media-view'
  | 'open-external'
  | 'update-kv-entry'
  | 'open-sidepane'
  | 'enable-handles'
  | 'probe-tree'
  | 'convert-loop'
  | 'duplicate'
  | 'help'
  | 'remove'

type WidgetToolbarActionButtonProps = {
  actionId: WidgetToolbarActionId
  className?: string
  disabled?: boolean
  icon: LucideIcon
  iconSizeClass: string
  iconStrokeWidth: number
  importUrl?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>
  title: string
  tooltipContent?: string
}

const WidgetToolbarActionButton = React.forwardRef<HTMLButtonElement, WidgetToolbarActionButtonProps>(function WidgetToolbarActionButton(props, ref) {
  const Icon = props.icon
  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    props.onPointerDown?.(event)
  }, [props])
  const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(event)
  }, [props])
  return (
    <IconButton
      ref={ref}
      title={props.title}
      tooltipContent={props.tooltipContent || props.title}
      showTooltip
      disabled={props.disabled}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={props.className}
      data-kg-bubble-toolbar-action={props.actionId}
      data-kg-import-url={props.importUrl ? '1' : undefined}
      data-kg-selection-surface="bubble-toolbar-action"
      data-kg-toolbar-action={props.actionId}
      data-kg-toolbar-action-label={props.title}
    >
      <span
        role="img"
        aria-label={`${props.title} icon`}
        className="inline-flex shrink-0 items-center justify-center"
        data-kg-bubble-toolbar-icon="1"
        data-kg-selection-surface="bubble-toolbar-icon"
        data-kg-toolbar-action-icon={props.actionId}
      >
        <Icon
          className={props.iconSizeClass}
          strokeWidth={props.iconStrokeWidth}
          aria-hidden={false}
          focusable={false}
          data-kg-toolbar-action-icon-svg={props.actionId}
        />
      </span>
    </IconButton>
  )
})

export const WidgetEditorActionsToolbar = React.memo(function WidgetEditorActionsToolbar(args: WidgetEditorActionsToolbarProps) {
  const {
    visible,
    iconSizeClass,
    iconStrokeWidth,
    active,
    enableHandlesDisabled,
    convertToLoopDisabled,
    duplicateDisabled,
    richMediaViewToggle,
    openExternalAction,
    onRun,
    onDuplicate,
    onClearOutput,
    onHelp,
    onRemove,
    onEnableHandlesForAllInputs,
    onProbeTree,
    onConvertToLoopNode,
    onUpdateKvEntry,
    onOpenInSidepane,
    maxWidthPx,
  } = args
  const actionVisibility = args.actionVisibility || {}
  const showRunAction = actionVisibility.run !== false
  const showUpdateKvEntryAction = actionVisibility.updateKvEntry !== false
  const showOpenInSidepaneAction = actionVisibility.openInSidepane !== false
  const showEnableHandlesAction = actionVisibility.enableHandles !== false
  const showProbeTreeAction = actionVisibility.probeTree !== false
  const showConvertToLoopAction = actionVisibility.convertToLoop !== false
  const showDuplicateAction = actionVisibility.duplicate !== false
  const showClearOutputAction = actionVisibility.clearOutput !== false
  const showHelpAction = actionVisibility.help !== false
  const showRemoveAction = actionVisibility.remove !== false
  const importUrlButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const runCaptureActivatedRef = React.useRef(false)
  const removeCaptureActivatedRef = React.useRef(false)
  const [importUrlOpen, setImportUrlOpen] = React.useState(false)
  const [importUrlDraft, setImportUrlDraft] = React.useState('')

  React.useEffect(() => {
    if (!args.importUrlAction?.visible) {
      setImportUrlOpen(false)
      return
    }
    if (importUrlOpen) return
    const initial = String(args.importUrlAction?.initialUrl || '').trim()
    if (initial && initial !== importUrlDraft) setImportUrlDraft(initial)
  }, [args.importUrlAction?.initialUrl, args.importUrlAction?.visible, importUrlDraft, importUrlOpen])

  const handleToolbarPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null
    const interactiveControl = target?.closest('[data-kg-bubble-toolbar-interactive-control="1"]') || null
    const runButton = target?.closest('button[data-kg-toolbar-action="run"]') || null
    const removeButton = target?.closest('button[data-kg-toolbar-action="remove"]') || null
    if (event.button === 0 && runButton) {
      runCaptureActivatedRef.current = true
      event.preventDefault()
      event.stopPropagation()
      commitActiveCardInlineTextEditor()
      onRun()
      return
    }
    if (event.button === 0 && removeButton) {
      removeCaptureActivatedRef.current = true
      event.preventDefault()
      event.stopPropagation()
      onRemove()
      return
    }
    if (interactiveControl) return
    event.stopPropagation()
    if (event.button !== 0) return
    try {
      event.preventDefault()
    } catch {
      void 0
    }
  }, [onRemove, onRun])
  const handleRunClick = React.useCallback(() => {
    if (runCaptureActivatedRef.current) {
      runCaptureActivatedRef.current = false
      return
    }
    commitActiveCardInlineTextEditor()
    onRun()
  }, [onRun])
  const handleRemoveClick = React.useCallback(() => {
    if (removeCaptureActivatedRef.current) {
      removeCaptureActivatedRef.current = false
      return
    }
    onRemove()
  }, [onRemove])

  if (!visible) return null
  return (
    <>
      <nav
        className={cn(
          'Island App-toolbar App-toolbar--compact App-toolbar--touch-scroll pointer-events-auto w-fit shadow-lg',
          args.navClassName || '',
        )}
        aria-label={args.ariaLabel || UI_LABELS.flowWidgetActions}
        data-kg-bubble-toolbar="1"
        data-kg-selection-surface="bubble-toolbar"
        style={{
          ...(typeof maxWidthPx === 'number' && Number.isFinite(maxWidthPx) && maxWidthPx > 0 ? { maxWidth: `${maxWidthPx}px` } : undefined),
          ...(args.navStyle || {}),
        }}
        onPointerDownCapture={handleToolbarPointerDownCapture}
      >
        {args.flipAction ? (
          <WidgetToolbarActionButton
            actionId="flip"
            title={args.flipAction.flipped ? 'Flip to front' : 'Flip to configure'}
            onClick={args.flipAction.onFlip}
            className="App-toolbar__btn"
            icon={FlipHorizontal2}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}
        {showRunAction ? (
          <WidgetToolbarActionButton
            actionId="run"
            title={UI_COPY.flowWidgetRun}
            tooltipContent={UI_COPY.flowWidgetRun}
            onClick={handleRunClick}
            className="App-toolbar__btn"
            icon={Play}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showClearOutputAction ? (
          <WidgetToolbarActionButton
            actionId="clear-output"
            title={UI_LABELS.clearOutput}
            tooltipContent={UI_COPY.flowWidgetClearOutput}
            onClick={onClearOutput}
            className="App-toolbar__btn"
            icon={Eraser}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {args.importUrlAction?.visible ? (
          <WidgetToolbarActionButton
            ref={importUrlButtonRef}
            actionId="import-url"
            title="Import URL"
            tooltipContent="Import URL"
            onClick={() => setImportUrlOpen(prev => !prev)}
            className={cn(
              'App-toolbar__btn',
              importUrlOpen ? UI_THEME_TOKENS.icon.active : '',
            )}
            icon={Link}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
            importUrl
          />
        ) : null}

        {richMediaViewToggle?.visible ? (
          <WidgetToolbarActionButton
            actionId="rich-media-view"
            title={getRichMediaPanelViewTitle(richMediaViewToggle.isKtvRows)}
            tooltipContent={richMediaViewToggle.isKtvRows ? UI_COPY.flowWidgetRichMediaPanelView : UI_COPY.flowWidgetRichMediaKtvRows}
            onClick={richMediaViewToggle.onToggle}
            className={cn('App-toolbar__btn text-[11px]', richMediaViewToggle.isKtvRows ? UI_THEME_TOKENS.icon.active : '')}
            icon={SplitSquareVertical}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {args.outputVersionControl ? (
          <span
            className="inline-flex shrink-0 items-center px-1"
            data-kg-bubble-toolbar-interactive-control="1"
            data-kg-selection-surface="bubble-toolbar-output-version"
          >
            {args.outputVersionControl}
          </span>
        ) : null}

        {openExternalAction?.visible ? (
          <WidgetToolbarActionButton
            actionId="open-external"
            title={openExternalAction.label || 'Open source'}
            tooltipContent={openExternalAction.label || 'Open source'}
            onClick={openExternalAction.onOpen}
            className="App-toolbar__btn"
            icon={ExternalLink}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showUpdateKvEntryAction ? (
          <WidgetToolbarActionButton
            actionId="update-kv-entry"
            title={UI_LABELS.updateKvEntry}
            tooltipContent={UI_LABELS.updateKvEntry}
            onClick={onUpdateKvEntry || (() => {
              emitMainPanelOpen({
                tab: 'workflowManager' as const,
                workflowManagerTab: 'mapping' as const,
              })
            })}
            className="App-toolbar__btn"
            icon={PanelRightOpen}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showOpenInSidepaneAction ? (
          <WidgetToolbarActionButton
            actionId="open-sidepane"
            title={UI_LABELS.openInSidepane}
            tooltipContent={UI_COPY.flowWidgetOpenInSidepane}
            onClick={onOpenInSidepane || (() => {
              emitMainPanelOpen({
                tab: 'workflowManager' as const,
                workflowManagerTab: 'graph' as const,
                workflowManagerEntryLabel: GRAPH_FIELDS_ENTRY_SHORTCUT_NODE_LABEL,
              })
            })}
            className="App-toolbar__btn"
            icon={PanelRightOpen}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showEnableHandlesAction && !enableHandlesDisabled && onEnableHandlesForAllInputs ? (
          <WidgetToolbarActionButton
            actionId="enable-handles"
            title={UI_LABELS.enableHandlesForAllInputs}
            tooltipContent={UI_COPY.flowWidgetEnableHandles}
            onClick={onEnableHandlesForAllInputs}
            className="App-toolbar__btn"
            icon={Share2}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showProbeTreeAction && onProbeTree ? (
          <WidgetToolbarActionButton
            actionId="probe-tree"
            title={UI_LABELS.probeTree}
            tooltipContent={UI_COPY.flowWidgetProbeTree}
            onClick={onProbeTree}
            className="App-toolbar__btn"
            icon={GitBranch}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showConvertToLoopAction && !convertToLoopDisabled ? (
          <WidgetToolbarActionButton
            actionId="convert-loop"
            title={UI_LABELS.convertToLoopNode}
            tooltipContent={UI_COPY.flowWidgetConvertToLoop}
            onClick={onConvertToLoopNode}
            className="App-toolbar__btn"
            icon={GitMerge}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showDuplicateAction && !duplicateDisabled ? (
          <WidgetToolbarActionButton
            actionId="duplicate"
            title={UI_LABELS.duplicate}
            tooltipContent={UI_COPY.flowWidgetDuplicate}
            onClick={onDuplicate}
            className="App-toolbar__btn"
            icon={Copy}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showHelpAction ? (
          <WidgetToolbarActionButton
            actionId="help"
            title={UI_LABELS.help}
            tooltipContent={UI_COPY.flowWidgetHelp}
            onClick={onHelp}
            className="App-toolbar__btn"
            icon={HelpCircle}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}

        {showRemoveAction ? (
          <WidgetToolbarActionButton
            actionId="remove"
            title={UI_LABELS.removeNode}
            tooltipContent={UI_COPY.flowWidgetRemoveNode}
            onClick={handleRemoveClick}
            className={cn('App-toolbar__btn', UI_THEME_TOKENS.status.error.split(' ').slice(0, 2).join(' '))}
            icon={Trash2}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={iconStrokeWidth}
          />
        ) : null}
      </nav>

      <AnchoredPopover
        open={Boolean(args.importUrlAction?.visible && importUrlOpen)}
        anchorEl={importUrlButtonRef.current}
        ariaLabel="Import URL"
        placement="bottom-start"
        minWidthPx={360}
        maxWidthPx={520}
        maxHeightPx={260}
        onClose={() => setImportUrlOpen(false)}
      >
        <section className={`${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border} border rounded p-2 shadow-sm`}>
          <menu className={uiToolbarColumnMenuListClassName} aria-label="Storyboard widget media selector">
            <li>
              <ImportUrlPrompt
                urlDraft={importUrlDraft}
                onChange={setImportUrlDraft}
                autoFocus
                confirmLabel="Set"
                onCancel={() => setImportUrlOpen(false)}
                onConfirm={(nextUrlRaw) => {
                  const cleaned = unwrapUserProvidedText(nextUrlRaw) || nextUrlRaw
                  const next = String(cleaned || '').trim()
                  if (!next) return
                  args.importUrlAction?.onConfirm(next)
                  setImportUrlOpen(false)
                }}
              />
            </li>
          </menu>
        </section>
      </AnchoredPopover>
    </>
  )
})
