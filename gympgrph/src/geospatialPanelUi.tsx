import React from 'react'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import type { PanelTypography } from 'grph-shared/ui/panelTypography'
import { KeyTypeValueRow } from 'agentic-design-system/react/ktv'

export type GeoPanelTypeIconRenderer = (args: { typeLabel: string }) => React.ReactNode

type GeoPanelKtvRowProps = {
  keyNode: React.ReactNode
  typeNode: React.ReactNode
  valueNode: React.ReactNode
  panelTypography: PanelTypography
  isActive?: boolean
  header?: boolean
  align?: 'center' | 'start'
}

type GeoPanelSectionProps = {
  title: string
  panelTypography: PanelTypography
  children: React.ReactNode
}

type GeoPanelValueCellProps = {
  children: React.ReactNode
  className?: string
}

const GeoPanelTypeIconRenderContext = React.createContext<GeoPanelTypeIconRenderer | null>(null)

export const GEOSPATIAL_PANEL_ROOT_CLASS_NAME = `h-full w-full ${UI_THEME_TOKENS.text.primary}`

export function GeoPanelTypeIconProvider(props: {
  children: React.ReactNode
  renderTypeIcon?: GeoPanelTypeIconRenderer
}): React.ReactElement {
  return (
    <GeoPanelTypeIconRenderContext.Provider value={props.renderTypeIcon || null}>
      {props.children}
    </GeoPanelTypeIconRenderContext.Provider>
  )
}

export function GeoPanelValueCell({ children, className }: GeoPanelValueCellProps): React.ReactElement {
  return (
    <span className={[
      'flex w-full min-w-0 max-w-full flex-wrap items-center gap-1 overflow-hidden justify-start sm:justify-end',
      className || '',
    ].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}

export function GeoPanelKtvRow(props: GeoPanelKtvRowProps): React.ReactElement {
  const {
    keyNode,
    typeNode,
    valueNode,
    panelTypography,
    isActive = false,
    header = false,
    align = 'center',
  } = props
  const renderTypeIcon = React.useContext(GeoPanelTypeIconRenderContext)
  const activeClass = header
    ? ''
    : isActive
      ? UI_THEME_TOKENS.table.rowSelected
      : UI_THEME_TOKENS.table.rowHoverHighlight
  const renderedTypeNode = React.useMemo(() => {
    if (header || !renderTypeIcon || typeof typeNode !== 'string') return typeNode
    const typeLabel = typeNode.trim()
    if (!typeLabel) return typeNode
    return renderTypeIcon({ typeLabel }) ?? typeNode
  }, [header, renderTypeIcon, typeNode])
  return <KeyTypeValueRow keyNode={keyNode} typeNode={renderedTypeNode} valueNode={valueNode} align={align}
    className={activeClass}
    keyClassName={header ? UI_THEME_TOKENS.text.secondary + ' font-semibold' : UI_THEME_TOKENS.text.primary}
    typeClassName={UI_THEME_TOKENS.text.secondary} valueClassName={UI_THEME_TOKENS.text.secondary} />
}

export function GeoPanelSection(props: GeoPanelSectionProps): React.ReactElement {
  const { title, panelTypography, children } = props
  return (
    <section className="space-y-0.5" aria-label={`Geo ${title}`}>
      <h3 className={[
        'px-1 pt-2 pb-1 font-semibold',
        panelTypography.microLabelClass,
        UI_THEME_TOKENS.text.secondary,
      ].join(' ')}>
        {title}
      </h3>
      <section className="space-y-0.5" aria-label={`${title} settings`}>{children}</section>
    </section>
  )
}

export const buildGeoPanelButtonClassName = (selected = false, disabled = false): string => [
  `${UI_THEME_TOKENS.control.singleLine} inline-block rounded border text-xs transition-colors`,
  selected
    ? `${UI_THEME_TOKENS.button.activeBorder} ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
    : `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`,
  disabled ? 'cursor-not-allowed opacity-50' : '',
].filter(Boolean).join(' ')
