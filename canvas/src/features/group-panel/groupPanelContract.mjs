export const GROUP_PANEL_AGENT_READY_TOOL_IDS = Object.freeze({
  controlLocalGroupPanel: 'control_local_group_panel',
})

export const GROUP_PANEL_INVOCATION = Object.freeze({
  command: '/canvas.node.add',
  semantic: '#canvas-selection',
  binding: '@canvas',
  qualifier: 'group-panel',
})

export function buildGroupPanelAgentReadyToolContracts(args) {
  return [{
    name: GROUP_PANEL_AGENT_READY_TOOL_IDS.controlLocalGroupPanel,
    webName: args.buildWebName(GROUP_PANEL_AGENT_READY_TOOL_IDS.controlLocalGroupPanel),
    title: 'Control Local Group Panel',
    description: `Inspect, group, or ungroup the current browser-local canvas selection. The native invocation is ${GROUP_PANEL_INVOCATION.command} ${GROUP_PANEL_INVOCATION.semantic} ${GROUP_PANEL_INVOCATION.binding} ${GROUP_PANEL_INVOCATION.qualifier}.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        operation: { type: 'string', enum: ['inspect', 'group', 'ungroup'] },
        invocation: { type: 'string', minLength: 1, pattern: '\\S' },
        nodeIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
        groupIds: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
      },
      anyOf: [{ required: ['operation'] }, { required: ['invocation'] }],
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['ok', 'operation', 'invocation', 'selection', 'groups'],
    },
    annotations: args.mutationAnnotations,
  }]
}
