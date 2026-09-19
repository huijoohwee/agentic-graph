import { applyDashboardWidgetCommand, buildDashboardWidgetToolContract } from '../canvas/src/components/DashboardCanvas/dashboardWidgetContract.mjs';
export const WIDGET_COMMAND_TOOL = 'agentic-graph.control_local_widget';
export const buildWidgetCommandToolDefinition = () => {
  const contract = buildDashboardWidgetToolContract();
  return { ...contract, name: WIDGET_COMMAND_TOOL,
    description: `${contract.description} This stdio tool returns an authored document, not a claim that browser IndexedDB was changed. Import it at the returned path or use workspace_artifact for an explicitly configured host workspace.`,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true } };
};
export const runWidgetCommand = (input = {}) => ({ ...applyDashboardWidgetCommand(input.document ?? { version: 1, widgets: {} }, input), surface: 'document' });
