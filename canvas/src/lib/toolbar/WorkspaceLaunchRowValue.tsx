import React from 'react'
import { SelectableRowValue } from '@/components/ui/SelectableRowValue'
import {
  WORKSPACE_LAUNCH_BINDING_TOKEN,
  WORKSPACE_LAUNCH_COMMAND_TOKEN,
  WORKSPACE_LAUNCH_MCP_TOOL_NAME,
  WORKSPACE_LAUNCH_SEMANTIC_TOKEN,
  buildWorkspaceLaunchInvocation,
} from './workspaceLaunchInvocationContract.mjs'
import type { WorkspaceLaunchOptionId } from './workspaceLaunchControlRuntime'

export function WorkspaceLaunchRowValue(props: {
  label: string
  value: string
  optionId: WorkspaceLaunchOptionId
}) {
  return (
    <SelectableRowValue
      label={props.label}
      value={props.value}
      invocation={buildWorkspaceLaunchInvocation(props.optionId)}
      mcpTool={WORKSPACE_LAUNCH_MCP_TOOL_NAME}
      commandToken={WORKSPACE_LAUNCH_COMMAND_TOKEN}
      semanticToken={WORKSPACE_LAUNCH_SEMANTIC_TOKEN}
      bindingToken={WORKSPACE_LAUNCH_BINDING_TOKEN}
    />
  )
}
