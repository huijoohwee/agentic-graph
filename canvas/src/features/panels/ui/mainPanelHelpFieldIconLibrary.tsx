import type React from 'react'
import { DESIGN_ICONS } from '@agentic-base/views-react/controls'
const { ArrowRightLeft, Braces, CalendarClock, CreditCard, Eraser, GitBranch, Hash, Link2, ListChecks, SlidersHorizontal, SquareCheckBig, Table, Type: TextTypeIcon, Users } = DESIGN_ICONS
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

type MainPanelFieldIconComponent = React.ComponentType<{
  className?: string
  strokeWidth?: number | string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

type MainPanelFieldIconMeta = Readonly<{
  category: string
  label: string
  Icon: MainPanelFieldIconComponent
}>

export const MAIN_PANEL_FIELD_ICON_KEYS = [
  'field.scope.node',
  'field.scope.edge',
  'field.origin.custom',
  'field.origin.derived',
  'field.visibility.show',
  'field.visibility.hide',
  'field.type.singleLineText',
  'field.type.longText',
  'field.type.number',
  'field.type.decimal',
  'field.type.checkbox',
  'field.type.multiSelect',
  'field.type.singleSelect',
  'field.type.dateTime',
  'field.type.url',
  'field.type.currency',
  'field.type.json',
] as const

export type MainPanelFieldIconKey = (typeof MAIN_PANEL_FIELD_ICON_KEYS)[number]

export const MAIN_PANEL_FIELD_ICON_META_BY_KEY = {
  'field.scope.node': { category: 'Graph field type', label: 'Node field', Icon: Users },
  'field.scope.edge': { category: 'Graph field type', label: 'Edge field', Icon: GitBranch },
  'field.origin.custom': { category: 'Graph field type', label: 'Custom field', Icon: SlidersHorizontal },
  'field.origin.derived': { category: 'Graph field type', label: 'Derived field', Icon: ArrowRightLeft },
  'field.visibility.show': { category: 'Graph field type', label: MARKDOWN_DATA_VIEW_COPY.showInLabel, Icon: Table },
  'field.visibility.hide': { category: 'Graph field type', label: MARKDOWN_DATA_VIEW_COPY.hideInLabel, Icon: Eraser },
  'field.type.singleLineText': { category: 'Graph field type', label: 'Single line text', Icon: TextTypeIcon },
  'field.type.longText': { category: 'Graph field type', label: 'Long text', Icon: TextTypeIcon },
  'field.type.number': { category: 'Graph field type', label: 'Number', Icon: Hash },
  'field.type.decimal': { category: 'Graph field type', label: 'Decimal', Icon: Hash },
  'field.type.checkbox': { category: 'Graph field type', label: 'Checkbox', Icon: SquareCheckBig },
  'field.type.multiSelect': { category: 'Graph field type', label: 'Multi-select', Icon: ListChecks },
  'field.type.singleSelect': { category: 'Graph field type', label: 'Single-select', Icon: SquareCheckBig },
  'field.type.dateTime': { category: 'Graph field type', label: 'Date Time', Icon: CalendarClock },
  'field.type.url': { category: 'Graph field type', label: 'URL', Icon: Link2 },
  'field.type.currency': { category: 'Graph field type', label: 'Currency', Icon: CreditCard },
  'field.type.json': { category: 'Graph field type', label: 'JSON', Icon: Braces },
} satisfies Record<MainPanelFieldIconKey, MainPanelFieldIconMeta>
