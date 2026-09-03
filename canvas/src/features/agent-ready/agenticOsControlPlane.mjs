/**
 * The product shell lives below /agentic-graph, while authenticated runtime
 * orchestration is an agentic-os control-plane concern. Keep the two origins
 * joined deliberately so a storefront URL cannot accidentally advertise a
 * non-existent product-relative control plane.
 */
export const AGENTIC_OS_CONTROL_PLANE_MCP_PATH = '/agentic-os/control-plane/mcp'

export const resolveAgenticOsControlPlaneMcpUrl = (baseUrl = '') => {
  const value = String(baseUrl || '').trim()
  if (!value) return ''
  try {
    return `${new URL(value).origin}${AGENTIC_OS_CONTROL_PLANE_MCP_PATH}`
  } catch {
    return ''
  }
}
