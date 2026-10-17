import { resolve } from 'node:path'

export async function reportMissionFailure({ error, phaseObservation, page, errors, requests, streamed, pending, output }) {
  console.error(error.message)
  console.error('Completed mission checkpoints:', JSON.stringify(phaseObservation.snapshot()))
  console.error('Mission entry state:', await page.evaluate(() => ({
    ready: window.__AG_MAIN_PANEL_OPEN_READY__,
    dashboard: document.querySelector('#dashboard-surface-agentic-os-panel')?.textContent.slice(0, 4000),
    modules: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/src/')).slice(-12)
      .map(entry => ({ path: new URL(entry.name).pathname, duration: entry.duration })),
    tabs: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map(node => node.id),
    panels: [...document.querySelectorAll('[aria-label="Main panel"]')].map(node => ({
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
    })),
    topology: [...document.querySelectorAll('#agent-run-view-topology-panel')].map(node => ({
      text: node.textContent.slice(0, 1000), html: node.innerHTML.slice(0, 2000),
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      visibility: getComputedStyle(node).visibility,
      canvas: [...node.querySelectorAll('svg[role="img"]')].map(canvas => ({
        width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height,
        visibility: getComputedStyle(canvas).visibility, hidden: Boolean(canvas.closest('[aria-hidden="true"], [inert]')),
      })),
    })),
    text: document.querySelector('[aria-label="Agent Mission"]')?.textContent.slice(0, 4000),
    authoredChanges: window.__AG_ACTIVATION_CHANGES__,
  })).catch(() => 'Document unavailable'))
  console.error('Mission transport state:', JSON.stringify({ errors, requests, streamed, pending: pending.size }))
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
}
