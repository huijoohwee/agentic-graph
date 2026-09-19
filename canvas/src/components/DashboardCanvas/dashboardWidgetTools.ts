import { buildDashboardWidgetToolContract, applyDashboardWidgetCommand, DASHBOARD_WIDGET_TOOL_ID, resolveWidgetCommand } from './dashboardWidgetContract.mjs'
import { mutateDashboardWidgets, parseDashboardWidgets } from './dashboardWidgetConfiguration'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { DASHBOARD_WIDGETS_PATH } from './dashboardWidgetConfiguration'

export async function controlDashboardWidget(input: Record<string, unknown> = {}) {
  const request = resolveWidgetCommand(input)
  if (request.operation === 'create') return (await import('./dashboardRegistryWidgetCommand')).createRegistryWidget(request)
  let result: ReturnType<typeof applyDashboardWidgetCommand>
  const apply = (document: ReturnType<typeof parseDashboardWidgets>) => {
    if (input.document && JSON.stringify(parseDashboardWidgets(JSON.stringify(input.document))) !== JSON.stringify(document)) throw Error('The expected widget document changed. Inspect it again before applying.')
    result = applyDashboardWidgetCommand(document, request)
    return result.document
  }
  if (['inspect', 'export'].includes(request.operation)) {
    const fs = await getWorkspaceFs(); apply(parseDashboardWidgets(await fs.readFileText(DASHBOARD_WIDGETS_PATH)))
  } else await mutateDashboardWidgets(apply)
  return { ...result!, surface: 'browser-workspace' }
}
export function buildDashboardWidgetToolBuilders() {
  const contract = buildDashboardWidgetToolContract()
  return { [DASHBOARD_WIDGET_TOOL_ID]: () => ({ ...contract, name: contract.webName, execute: controlDashboardWidget }) }
}
