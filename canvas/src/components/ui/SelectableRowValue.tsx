import React from 'react'

export function SelectableRowValue(props: {
  label: string
  value: string
  invocation?: string
  mcpTool?: string
  commandToken?: string
  semanticToken?: string
  bindingToken?: string
}) {
  return (
    <output
      className="relative z-10 ml-auto shrink-0 pointer-events-auto text-xs"
      role="status"
      aria-label={`${props.label}: ${props.value}`}
      data-kg-selection-affordance="row-value"
      data-kg-row-value={props.value}
      data-kg-row-value-invocation={props.invocation || undefined}
      data-kg-row-value-mcp-tool={props.mcpTool || undefined}
      data-kg-row-value-command={props.commandToken || undefined}
      data-kg-row-value-semantic={props.semanticToken || undefined}
      data-kg-row-value-binding={props.bindingToken || undefined}
    >
      {props.value}
    </output>
  )
}
