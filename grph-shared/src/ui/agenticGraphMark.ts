/** Native Agentic Graph mark shared by browser and edge-rendered account surfaces. */
export const agenticGraphMark = {
  viewBox: '0 0 32 32',
  path: 'm8 9 16 7-16 7V9Z',
  nodes: [[8, 9], [24, 16], [8, 23]],
  radius: 3,
  strokeWidth: 2,
} as const

// Trusted static geometry only; no request data is interpolated into this markup.
export const agenticGraphMarkSvg = `<svg viewBox="${agenticGraphMark.viewBox}" fill="none" stroke="currentColor" stroke-width="${agenticGraphMark.strokeWidth}" aria-hidden="true" focusable="false" data-kg-agentic-graph-mark="1"><path d="${agenticGraphMark.path}"/>${agenticGraphMark.nodes.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${agenticGraphMark.radius}"/>`).join('')}</svg>`
