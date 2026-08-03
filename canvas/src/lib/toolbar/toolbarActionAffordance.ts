import {
  TOOLBAR_ACTION_BINDING_TOKEN,
  TOOLBAR_ACTION_COMMAND_TOKEN,
  TOOLBAR_ACTION_MCP_TOOL_NAME,
  TOOLBAR_ACTION_SEMANTIC_TOKEN,
  buildToolbarActionInvocation,
} from './toolbarActionInvocationContract.mjs'
import type { ToolbarActionId } from './toolbarActionControlRuntime'

export function toolbarActionAffordance(actionId: ToolbarActionId) {
  return {
    'data-kg-selection-affordance': 'toolbar-action',
    'data-kg-toolbar-action': actionId,
    'data-kg-toolbar-action-invocation': buildToolbarActionInvocation(actionId),
    'data-kg-toolbar-action-mcp-tool': TOOLBAR_ACTION_MCP_TOOL_NAME,
    'data-kg-toolbar-action-command': TOOLBAR_ACTION_COMMAND_TOKEN,
    'data-kg-toolbar-action-semantic': TOOLBAR_ACTION_SEMANTIC_TOKEN,
    'data-kg-toolbar-action-binding': TOOLBAR_ACTION_BINDING_TOKEN,
  } as const
}
