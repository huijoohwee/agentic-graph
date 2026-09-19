import React from 'react'
import { controlDashboardWidget } from './dashboardWidgetTools'
import { DASHBOARD_WIDGET_INVOCATION } from './dashboardWidgetToolContract.mjs'
export default function DashboardWidgetCommandPanel() {
  const [invocation, setInvocation] = React.useState(`${DASHBOARD_WIDGET_INVOCATION} operation=inspect`), [message, setMessage] = React.useState('')
  return <section aria-label="Widget invocation">
    <form className="mt-2 border-t pt-2" onSubmit={event => { event.preventDefault(); void controlDashboardWidget({ invocation }).then(result => setMessage(result.operation === 'inspect' ? 'Widget configuration inspected.' : 'Widget command completed.')).catch(error => setMessage(error.message)) }}>
      <label className="block text-xs">Widget command<input aria-label="Widget command" className="my-1 w-full rounded border bg-[var(--kg-surface)] p-2 font-mono" value={invocation} onChange={event => setInvocation(event.target.value)} /></label>
      <button type="submit" className="rounded border px-3 py-2 text-xs">Invoke widget</button>
      <p className="mt-1 text-xs">WebMCP / MCP: <code>agentic-graph.control_local_widget</code></p>
      <p className="mt-1 text-xs">Collapse example: <code>operation=collapse id=mission:index-economics</code>. Use <code>operation=expand</code> to reopen.</p>
      <p className="mt-1 text-xs">Storyboard: <code>operation=create id=graph:my-card</code> creates Widget Card Type 0 once.</p>
    </form>
    {message && <p role="status" className="text-xs">{message}</p>}
  </section>
}
