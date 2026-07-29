import React from 'react'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import type { PanelTypography } from 'grph-shared/ui/panelTypography'
import {
  KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME,
  KTV_ROW_LABEL_CELL_CLASS_NAME,
  KTV_ROW_VALUE_CELL_CLASS_NAME,
} from 'grph-shared/ui/keyTypeValueRows'

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
  const alignClass = align === 'start' ? 'items-start' : 'items-center'
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
  const rootClassName = [
    `grid w-full ${KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME} gap-x-2 gap-y-0 rounded`,
    panelTypography.panelTextClass,
    header ? 'h-9 py-0' : 'py-0.5',
    alignClass,
    activeClass,
  ].filter(Boolean).join(' ')
  const labelClassName = [
    KTV_ROW_LABEL_CELL_CLASS_NAME,
    'items-center gap-1 whitespace-nowrap',
    header ? `font-semibold ${UI_THEME_TOKENS.text.secondary}` : UI_THEME_TOKENS.text.primary,
  ].join(' ')
  const typeClassName = [
    KTV_ROW_LABEL_CELL_CLASS_NAME,
    'items-center justify-start sm:justify-end whitespace-nowrap',
    header ? `font-semibold ${UI_THEME_TOKENS.text.secondary}` : UI_THEME_TOKENS.text.secondary,
  ].join(' ')
  const valueClassName = [
    KTV_ROW_VALUE_CELL_CLASS_NAME,
    'items-center',
    header ? `font-semibold ${UI_THEME_TOKENS.text.secondary}` : '',
  ].filter(Boolean).join(' ')

  return (
    <dl className={rootClassName}>
      <dt className={labelClassName}>{keyNode}</dt>
      <dd className={typeClassName}>{renderedTypeNode}</dd>
      <dd className={valueClassName}>{valueNode}</dd>
    </dl>
  )
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
  'inline-flex min-h-[var(--kg-control-height,28px)] min-w-0 items-center justify-center rounded border px-2 py-0.5 text-xs transition-colors',
  selected
    ? `${UI_THEME_TOKENS.button.activeBorder} ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
    : `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`,
  disabled ? 'cursor-not-allowed opacity-50' : '',
].filter(Boolean).join(' ')
