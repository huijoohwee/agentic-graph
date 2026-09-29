import type { ReactNode } from 'react'
import {
  KTV_FIELD_GRID_CLASS_NAME,
  KTV_FIELD_CONTROL_GROUP_CLASS_NAME,
  panelFieldDecorationClassName,
  KTV_ROW_LABEL_CELL_CLASS_NAME,
  KTV_ROW_VALUE_CELL_CLASS_NAME,
  KTV_VALUE_ROW_SCROLL_CLASS_NAME,
} from '../ui/keyTypeValueRows.js'
import { UI_THEME_TOKENS } from '../ui/themeTokens.js'

// Older call signatures are adapters only; every variant renders one grid.
export type KeyTypeValueStaticRowLayout =
  | 'keyTypeValue'
  | 'keyValue'
  | 'keyIconValue'
  | 'keyIconSliderInput'

export interface KeyTypeValueStaticRowProps {
  keyNode: ReactNode
  typeNode?: ReactNode
  valueNode: ReactNode
  align?: 'center' | 'start'
  layout?: KeyTypeValueStaticRowLayout
  textSizeClassName: string
  fontClassName: string
  densityClassName: string
  activeClassName?: string
  onClick?: () => void
  className?: string
  id?: string
  dataKgAnchor?: string
}

export interface RightAlignedValueCellProps {
  children: ReactNode
  className?: string
}

export interface SimpleKeyValueRowProps {
  label: ReactNode
  children: ReactNode
  align?: 'center' | 'start'
  className?: string
  textSizeClassName: string
  fontClassName: string
  densityClassName: string
  activeClassName?: string
  onClick?: () => void
}

function buildRootClassName({
  align,
  textSizeClassName,
  fontClassName,
  densityClassName,
  activeClassName,
  onClick,
  className,
}: {
  align: 'center' | 'start'
  textSizeClassName: string
  fontClassName: string
  densityClassName: string
  activeClassName?: string
  onClick?: () => void
  className?: string
}) {
  const alignClassName = align === 'start' ? 'items-start' : 'items-center'
  const cursorClassName = onClick ? 'cursor-pointer' : ''
  return [
    KTV_FIELD_GRID_CLASS_NAME,
    'rounded',
    activeClassName || '',
    textSizeClassName,
    fontClassName,
    densityClassName,
    alignClassName,
    cursorClassName,
    panelFieldDecorationClassName(className),
  ]
    .filter(Boolean)
    .join(' ')
}

export function KeyTypeValueStaticRow({
  keyNode,
  typeNode,
  valueNode,
  align = 'center',
  layout = 'keyTypeValue',
  textSizeClassName,
  fontClassName,
  densityClassName,
  activeClassName,
  onClick,
  className,
  id,
  dataKgAnchor,
}: KeyTypeValueStaticRowProps) {
  return (
    <dl
      id={id}
      data-panel-field-row="true"
      data-kg-anchor={dataKgAnchor}
      className={buildRootClassName({
        align,
        textSizeClassName,
        fontClassName,
        densityClassName,
        activeClassName,
        onClick,
        className,
      })}
      onClick={onClick}
    >
      <dt className={`${KTV_ROW_LABEL_CELL_CLASS_NAME} items-center gap-1 ${UI_THEME_TOKENS.text.primary}`}>
        {keyNode}
      </dt>
      <dd className={`${KTV_ROW_LABEL_CELL_CLASS_NAME} items-center justify-start sm:justify-end ${UI_THEME_TOKENS.text.secondary}`}>
        {layout === 'keyIconSliderInput' ? null : typeNode}
      </dd>
      <dd className={`${KTV_ROW_VALUE_CELL_CLASS_NAME} ${KTV_VALUE_ROW_SCROLL_CLASS_NAME} items-center`}>
        {layout === 'keyIconSliderInput' ? <section className={KTV_FIELD_CONTROL_GROUP_CLASS_NAME}>{typeNode}{valueNode}</section> : valueNode}
      </dd>
    </dl>
  )
}

export function RightAlignedValueCell({ children, className }: RightAlignedValueCellProps) {
  const rootClassName = [KTV_VALUE_ROW_SCROLL_CLASS_NAME, panelFieldDecorationClassName(className)]
    .filter(Boolean)
    .join(' ')
  return <section className={rootClassName}>{children}</section>
}

export function SimpleKeyValueRow({
  label,
  children,
  align,
  className,
  textSizeClassName,
  fontClassName,
  densityClassName,
  activeClassName,
  onClick,
}: SimpleKeyValueRowProps) {
  return (
    <KeyTypeValueStaticRow
      keyNode={label}
      valueNode={children}
      align={align}
      layout="keyValue"
      className={className}
      textSizeClassName={textSizeClassName}
      fontClassName={fontClassName}
      densityClassName={densityClassName}
      activeClassName={activeClassName}
      onClick={onClick}
    />
  )
}
