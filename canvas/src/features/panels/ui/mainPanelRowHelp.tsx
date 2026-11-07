import React from 'react'
import { RightAlignedValueCell, type KeyTypeValueCells } from 'grph-shared/react/keyTypeValueRow'
import Tooltip from './Tooltip'
import { buildRoleActionOutcomeTooltip, buildSettingsValueTooltip } from '@/lib/config-copy/tooltips'

export type MainPanelFieldHelp = {
  role: string
  actions: string[]
  outcome: string
  value: Parameters<typeof buildSettingsValueTooltip>[0]
}

export function buildMainPanelFieldHelp(help: MainPanelFieldHelp) {
  return {
    key: buildRoleActionOutcomeTooltip(help),
    value: buildSettingsValueTooltip(help.value),
  }
}

// Both editable and static rows share hover/focus help; metadata stays with the field owner.
export function MainPanelCellHelp({ content, children, className = '' }: { content: string; children: React.ReactNode; className?: string }) {
  return <Tooltip content={content} maxWidthPx={360} className={`min-w-0 max-w-full ${className}`}>
    <span tabIndex={0} aria-description={content} className="w-full min-w-0 max-w-full">{children}</span>
  </Tooltip>
}

// Compatibility at the row boundary: consume plain legacy help once, without
// changing controls or manufacturing defaults from their current values.
function isPlainTooltip(props: Record<string, unknown>): boolean {
  return typeof props.content === 'string' && Object.keys(props).every(key => [
    'children', 'content', 'className', 'maxWidthPx', 'contentClassName', 'maxWidthFromPrevSibling',
  ].includes(key))
}

function ownsHelp(node: React.ReactNode): boolean {
  return React.Children.toArray(node).some(child => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return false
    const props = child.props
    return child.type === MainPanelCellHelp
      || (child.type === Tooltip && !isPlainTooltip(props))
      || Boolean(props.tooltip || props.controlTooltip)
      || ownsHelp(props.children as React.ReactNode)
  })
}

function declaredBounds(node: React.ReactNode): Pick<MainPanelFieldHelp['value'], 'min' | 'max' | 'interval'> {
  let bounds: ReturnType<typeof declaredBounds> = {}
  React.Children.forEach(node, child => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return
    const { min, max, step, children } = child.props
    if (typeof min === 'number' || typeof min === 'string') bounds.min = min
    if (typeof max === 'number' || typeof max === 'string') bounds.max = max
    if (typeof step === 'number' || typeof step === 'string') bounds.interval = step
    bounds = { ...bounds, ...declaredBounds(children as React.ReactNode) }
  })
  return bounds
}

function prepareHelpNode(node: React.ReactNode, descriptions: string[]): React.ReactNode {
  return React.Children.map(node, child => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return child
    const props = child.props
    if (child.type === Tooltip && isPlainTooltip(props)) {
      descriptions.push(props.content as string)
      return prepareHelpNode(props.children as React.ReactNode, descriptions)
    }
    if (props.children === undefined) return child
    return React.cloneElement(child, {}, prepareHelpNode(props.children as React.ReactNode, descriptions))
  })
}

function fieldLabel(node: React.ReactNode): string {
  return React.Children.toArray(node).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    if (!React.isValidElement<Record<string, unknown>>(child)) return ''
    return fieldLabel(child.props.children as React.ReactNode)
      || String(child.props['aria-label'] || '')
  }).filter(Boolean).join(' ').trim()
}

export function prepareMainPanelRowHelp(cells: KeyTypeValueCells, help?: MainPanelFieldHelp): KeyTypeValueCells {
  const { keyNode, valueNode, typeNode } = cells
  if (ownsHelp(keyNode) || ownsHelp(valueNode) || ownsHelp(typeNode)) return cells
  const keyDescriptions: string[] = [], valueDescriptions: string[] = []
  const key = prepareHelpNode(keyNode, keyDescriptions)
  const value = prepareHelpNode(valueNode, valueDescriptions)
  const type = prepareHelpNode(typeNode, valueDescriptions)
  const label = fieldLabel(key)
  if (!help && !label) return cells
  const legacyKey = [...new Set(keyDescriptions)].join('; ')
  const legacyValue = [...new Set(valueDescriptions)].join('; ')
  const content = help ? buildMainPanelFieldHelp(help) : {
    key: legacyKey.includes('→') ? legacyKey : buildRoleActionOutcomeTooltip({
      role: 'Reader', actions: [`inspect ${label}`],
      outcome: legacyKey || 'read the field and its current value',
    }),
    value: legacyValue.startsWith('Default:') ? legacyValue : buildSettingsValueTooltip({
      key: label, type: 'string', defaultValue: 'Not declared', impact: legacyValue,
      ...declaredBounds(valueNode), ...declaredBounds(typeNode),
    }),
  }
  return {
    typeNode: valueDescriptions.length && typeNode ? <MainPanelCellHelp content={content.value} className="w-full">{type}</MainPanelCellHelp> : type,
    keyNode: <MainPanelCellHelp content={content.key}>{key}</MainPanelCellHelp>,
    valueNode: <MainPanelCellHelp content={content.value} className="w-full justify-end"><RightAlignedValueCell>{value}</RightAlignedValueCell></MainPanelCellHelp>,
  }
}
