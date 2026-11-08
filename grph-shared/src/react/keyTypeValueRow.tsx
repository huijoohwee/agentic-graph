import { KeyTypeValueRow as BaseKeyTypeValueRow, DesignIcon } from '@agentic-base/views-react/controls'
import type { ReactNode } from 'react'
import {
  KTV_FIELD_CONTROL_GROUP_CLASS_NAME,
  panelFieldDecorationClassName,
  KTV_VALUE_ROW_SCROLL_CLASS_NAME,
} from '../ui/keyTypeValueRows.js'
import { UI_THEME_TOKENS } from '../ui/themeTokens.js'

// Older call signatures are adapters only; every variant renders one grid.
export type KeyTypeValueStaticRowLayout =
  | 'keyTypeValue'
  | 'keyValue'
  | 'keyIconValue'
  | 'keyIconSliderInput'

export type KeyTypeValueCells = { keyNode: ReactNode; typeNode?: ReactNode; valueNode: ReactNode }

export interface KeyTypeValueStaticRowProps {
  presentCells?: (cells: KeyTypeValueCells) => KeyTypeValueCells
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
  presentCells?: KeyTypeValueStaticRowProps['presentCells']
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

export function KeyTypeValueContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`agentic-ktv-container ${className}`.trim()}>{children}</section>
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
  presentCells,
}: KeyTypeValueStaticRowProps) {
  const cells = presentCells ? presentCells({ keyNode, typeNode, valueNode }) : { keyNode, typeNode, valueNode }
  const sliderLayout = layout === 'keyIconSliderInput'
  return <BaseKeyTypeValueRow id={id} dataKgAnchor={dataKgAnchor} align={align} onClick={onClick}
    keyNode={cells.keyNode}
    typeNode={sliderLayout ? <DesignIcon name="Hash" label="Number" /> : cells.typeNode}
    valueNode={sliderLayout ? <section className={KTV_FIELD_CONTROL_GROUP_CLASS_NAME}>{cells.typeNode}{cells.valueNode}</section> : cells.valueNode}
    className={[activeClassName, onClick ? 'cursor-pointer' : '', panelFieldDecorationClassName(className)].filter(Boolean).join(' ')}
    keyClassName={UI_THEME_TOKENS.text.primary} typeClassName={UI_THEME_TOKENS.text.secondary} valueClassName={UI_THEME_TOKENS.text.secondary} />
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
  presentCells,
}: SimpleKeyValueRowProps) {
  return (
    <KeyTypeValueStaticRow
      presentCells={presentCells}
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
