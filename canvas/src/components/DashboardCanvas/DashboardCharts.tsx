import {
  DashboardBarChart,
  DashboardLineAreaChart,
  DASHBOARD_CHART_TONE_COLORS,
  type DashboardTone,
} from '@agentic-base/views-react/dashboard'

export { DashboardBarChart, DashboardLineAreaChart }

/** Graph data tone classes stay host-owned; chart geometry and SVG stay Base-owned. */
export const TONE_COLORS: Record<DashboardTone, { stroke: string; fill: string; bar: string; chip: string }> = {
  blue: { ...DASHBOARD_CHART_TONE_COLORS.blue, chip: 'border-blue-200 bg-blue-50 text-blue-800' },
  green: { ...DASHBOARD_CHART_TONE_COLORS.green, chip: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  amber: { ...DASHBOARD_CHART_TONE_COLORS.amber, chip: 'border-amber-200 bg-amber-50 text-amber-800' },
  rose: { ...DASHBOARD_CHART_TONE_COLORS.rose, chip: 'border-rose-200 bg-rose-50 text-rose-800' },
  slate: { ...DASHBOARD_CHART_TONE_COLORS.slate, chip: 'border-slate-200 bg-slate-50 text-slate-700' },
}
