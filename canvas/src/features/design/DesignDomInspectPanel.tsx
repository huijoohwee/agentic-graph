import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { FileCode } from 'lucide-react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PanelReadOnlyField } from '@/lib/ui/panelFormControls'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { getIconSizeClass } from '@/lib/ui'
import { UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'

import type { GraphNode, JSONValue } from '@/lib/graph/types'

export const DESIGN_DOM_INSPECT_ROW_GRID_CLASS_NAME = 'kg-design-dom-inspect-row-grid'

const coerceString = (v: unknown): string => (typeof v === 'string' ? v : String(v || '')).trim()

function readMetaString(node: GraphNode, key: string): string {
  const meta = node.metadata && typeof node.metadata === 'object' ? (node.metadata as Record<string, JSONValue>) : null
  const v = meta ? meta[key] : null
  return typeof v === 'string' ? v.trim() : ''
}

function readProp(node: GraphNode, key: string): JSONValue | null {
  const props = node.properties && typeof node.properties === 'object' ? (node.properties as Record<string, JSONValue>) : null
  return props && Object.prototype.hasOwnProperty.call(props, key) ? (props[key] as JSONValue) : null
}

function readPropString(node: GraphNode, key: string): string {
  const v = readProp(node, key)
  return typeof v === 'string' ? v.trim() : ''
}

function readPropNumber(node: GraphNode, key: string): number | null {
  const v = readProp(node, key)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function KeyValueRow(props: { k: string; v: string | number | null }) {
  const v = props.v
  const value = v == null ? '' : String(v)
  return (
    <PanelReadOnlyField
      label={props.k}
      value={value || '—'}
      className={DESIGN_DOM_INSPECT_ROW_GRID_CLASS_NAME}
      labelClassName="font-mono"
      valueClassName={cn('font-mono break-words', UI_THEME_TOKENS.text.primary)}
    />
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className={cn('px-3 py-2 border-b last:border-b-0', UI_THEME_TOKENS.panel.border)} aria-label={props.title}>
      <section className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{props.title}</section>
      <section className="mt-1">{props.children}</section>
    </section>
  )
}

export default function DesignDomInspectPanel({ active }: { active: boolean }) {
  const panelTypography = usePanelTypography()
  const {
    uiIconScale,
    uiIconStrokeWidth,
    workspaceViewMode,
    canvasRenderMode,
    canvas2dRenderer,
    designRendererWebpageLayoutKey,
    designRendererGraphNodesById,
    selectedNodeId,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      workspaceViewMode: s.workspaceViewMode,
      canvasRenderMode: s.canvasRenderMode,
      canvas2dRenderer: s.canvas2dRenderer,
      designRendererWebpageLayoutKey: s.designRendererWebpageLayoutKey,
      designRendererGraphNodesById: s.designRendererGraphNodesById,
      selectedNodeId: s.selectedNodeId,
    })),
  )

  const isDesignMode = workspaceViewMode === 'canvas' && canvasRenderMode === '2d' && canvas2dRenderer === 'design'
  const hasLayout = isDesignMode && !!designRendererWebpageLayoutKey && Object.keys(designRendererGraphNodesById || {}).length > 0

  const iconSizeClass = getIconSizeClass(uiIconScale)

  const node = React.useMemo(() => {
    if (!hasLayout) return null
    const id = String(selectedNodeId || '').trim()
    if (!id) return null
    return (designRendererGraphNodesById || {})[id] || null
  }, [designRendererGraphNodesById, hasLayout, selectedNodeId])

  const tag = node ? readPropString(node, 'dom:tag') : ''
  const pid = node ? readMetaString(node, 'domParentId') : ''

  const domId = node ? readPropString(node, 'dom:attrs:id') : ''
  const domClass = node ? readPropString(node, 'dom:attrs:class') : ''
  const domRole = node ? readPropString(node, 'dom:attrs:role') : ''
  const domAriaLabel = node ? readPropString(node, 'dom:attrs:ariaLabel') : ''
  const domPlaceholder = node ? readPropString(node, 'dom:attrs:placeholder') : ''
  const domHref = node ? readPropString(node, 'dom:attrs:href') : ''
  const domSrc = node ? readPropString(node, 'dom:attrs:src') : ''
  const domAlt = node ? readPropString(node, 'dom:attrs:alt') : ''

  const width = node ? readPropNumber(node, 'visual:width') : null
  const height = node ? readPropNumber(node, 'visual:height') : null
  const x = node && typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : null
  const y = node && typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : null

  const fill = node ? readPropString(node, 'visual:fill') : ''
  const stroke = node ? readPropString(node, 'visual:stroke') : ''
  const strokeWidth = node ? readPropNumber(node, 'visual:strokeWidth') : null
  const borderRadius = node ? readPropNumber(node, 'visual:borderRadius') : null
  const opacity = node ? readPropNumber(node, 'visual:opacity') : null

  const cssDisplay = node ? readPropString(node, 'css:display') : ''
  const cssPosition = node ? readPropString(node, 'css:position') : ''
  const cssZIndex = node ? readPropString(node, 'css:zIndex') : ''
  const cssBackgroundColor = node ? readPropString(node, 'css:backgroundColor') : ''
  const cssColor = node ? readPropString(node, 'css:color') : ''
  const cssBorderRadius = node ? readPropString(node, 'css:borderRadius') : ''
  const cssBorderWidth = node ? readPropString(node, 'css:borderWidth') : ''
  const cssBorderColor = node ? readPropString(node, 'css:borderColor') : ''
  const cssPadding = node ? readPropString(node, 'css:padding') : ''
  const cssMargin = node ? readPropString(node, 'css:margin') : ''
  const cssGap = node ? readPropString(node, 'css:gap') : ''
  const cssJustifyContent = node ? readPropString(node, 'css:justifyContent') : ''
  const cssAlignItems = node ? readPropString(node, 'css:alignItems') : ''
  const cssFlexDirection = node ? readPropString(node, 'css:flexDirection') : ''
  const cssFlexWrap = node ? readPropString(node, 'css:flexWrap') : ''
  const cssFontSize = node ? readPropString(node, 'css:fontSize') : ''
  const cssFontWeight = node ? readPropString(node, 'css:fontWeight') : ''
  const cssFontFamily = node ? readPropString(node, 'css:fontFamily') : ''
  const cssLineHeight = node ? readPropString(node, 'css:lineHeight') : ''
  const cssLetterSpacing = node ? readPropString(node, 'css:letterSpacing') : ''
  const cssTextTransform = node ? readPropString(node, 'css:textTransform') : ''
  const cssTextAlign = node ? readPropString(node, 'css:textAlign') : ''
  const cssBoxShadow = node ? readPropString(node, 'css:boxShadow') : ''
  const cssOpacity = node ? readPropString(node, 'css:opacity') : ''

  return (
    <section className={cn(UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME, UI_THEME_TOKENS.panel.bg)} aria-label="Inspect" data-main-panel-no-drag="true">
      <section className={cn('px-3 py-2 border-b flex items-center gap-2', UI_THEME_TOKENS.panel.border)} aria-label="Inspect header">
        <FileCode className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        <span className={cn('min-w-0 truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>Inspect</span>
        <span className={cn('ml-auto text-xs font-mono', UI_THEME_TOKENS.text.tertiary)}>
          {hasLayout ? coerceString(selectedNodeId) || '—' : '—'}
        </span>
      </section>

      {!hasLayout ? (
        <p className={cn('p-3 text-sm', UI_THEME_TOKENS.text.secondary)}>
          Switch to Design renderer on a webpage-backed document to inspect computed tokens.
        </p>
      ) : !node ? (
        <p className={cn('p-3 text-sm', UI_THEME_TOKENS.text.secondary)}>Select a frame to inspect.</p>
      ) : (
        <section className={cn('h-full overflow-y-auto', panelTypography.fontClass)} aria-label="Inspect content">
          <Section title="Identity">
            <KeyValueRow k="id" v={coerceString(node.id)} />
            <KeyValueRow k="tag" v={tag || coerceString(node.type)} />
            <KeyValueRow k="label" v={coerceString(node.label)} />
            <KeyValueRow k="pid" v={pid} />
          </Section>
          <Section title="DOM Attributes">
            <KeyValueRow k="dom.id" v={domId} />
            <KeyValueRow k="dom.class" v={domClass} />
            <KeyValueRow k="dom.role" v={domRole} />
            <KeyValueRow k="aria-label" v={domAriaLabel} />
            <KeyValueRow k="placeholder" v={domPlaceholder} />
            <KeyValueRow k="href" v={domHref} />
            <KeyValueRow k="src" v={domSrc} />
            <KeyValueRow k="alt" v={domAlt} />
          </Section>
          <Section title="Layout">
            <KeyValueRow k="x" v={x} />
            <KeyValueRow k="y" v={y} />
            <KeyValueRow k="w" v={width} />
            <KeyValueRow k="h" v={height} />
          </Section>
          <Section title="Visual">
            <KeyValueRow k="fill" v={fill} />
            <KeyValueRow k="stroke" v={stroke} />
            <KeyValueRow k="strokeWidth" v={strokeWidth} />
            <KeyValueRow k="radius" v={borderRadius} />
            <KeyValueRow k="opacity" v={opacity} />
          </Section>
          <Section title="CSS Tokens">
            <KeyValueRow k="display" v={cssDisplay} />
            <KeyValueRow k="position" v={cssPosition} />
            <KeyValueRow k="z-index" v={cssZIndex} />
            <KeyValueRow k="bg" v={cssBackgroundColor} />
            <KeyValueRow k="color" v={cssColor} />
            <KeyValueRow k="borderRadius" v={cssBorderRadius} />
            <KeyValueRow k="borderWidth" v={cssBorderWidth} />
            <KeyValueRow k="borderColor" v={cssBorderColor} />
            <KeyValueRow k="padding" v={cssPadding} />
            <KeyValueRow k="margin" v={cssMargin} />
            <KeyValueRow k="gap" v={cssGap} />
            <KeyValueRow k="justifyContent" v={cssJustifyContent} />
            <KeyValueRow k="alignItems" v={cssAlignItems} />
            <KeyValueRow k="flexDirection" v={cssFlexDirection} />
            <KeyValueRow k="flexWrap" v={cssFlexWrap} />
            <KeyValueRow k="fontSize" v={cssFontSize} />
            <KeyValueRow k="fontWeight" v={cssFontWeight} />
            <KeyValueRow k="fontFamily" v={cssFontFamily} />
            <KeyValueRow k="lineHeight" v={cssLineHeight} />
            <KeyValueRow k="letterSpacing" v={cssLetterSpacing} />
            <KeyValueRow k="textTransform" v={cssTextTransform} />
            <KeyValueRow k="textAlign" v={cssTextAlign} />
            <KeyValueRow k="boxShadow" v={cssBoxShadow} />
            <KeyValueRow k="opacity" v={cssOpacity} />
          </Section>
        </section>
      )}
    </section>
  )
}
