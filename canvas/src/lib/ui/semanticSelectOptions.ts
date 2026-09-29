import React from 'react'

export type SemanticSelectOption = {
  value: string
  label: string
  disabled: boolean
  group?: string
}

function textContent(node: React.ReactNode): string {
  return React.Children.toArray(node).map(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? textContent(child.props.children) : String(child)).join('')
}

/** Consume declarative option data without mounting an OS-owned select popup. */
export function readSemanticSelectOptions(children: React.ReactNode, group?: string, disabled = false): SemanticSelectOption[] {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) return []
    const props = child.props
    if (child.type === React.Fragment) return readSemanticSelectOptions(props.children, group, disabled)
    if (child.type === 'optgroup') return readSemanticSelectOptions(props.children, props.label, disabled || !!props.disabled)
    if (child.type !== 'option') throw new Error('PanelSelect accepts option, optgroup, and Fragment children only')
    if (props.hidden) return []
    const label = props.label ?? textContent(props.children)
    return [{ value: String(props.value ?? label), label, disabled: disabled || !!props.disabled, group }]
  })
}
