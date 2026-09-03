import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentSurfaceInspectionPayload } from '../../canvas/src/features/agent-ready/agentSurfaceInspection.mjs'
import { resolveAgenticOsControlPlaneMcpUrl } from '../../canvas/src/features/agent-ready/agenticOsControlPlane.mjs'
import {
  buildAgenticGraphMcpAppsHtml,
  buildAgenticGraphMcpAppsServerReadiness,
} from '../../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs'
import { resolveMcpOnboardingUrls } from '../../canvas/src/features/agent-ready/mcpAppsOnboarding.mjs'

const productUrl = 'https://airvio.co/agentic-graph'
const controlPlaneUrl = 'https://airvio.co/agentic-os/control-plane/mcp'

test('product surfaces derive the control-plane MCP endpoint from the site origin', () => {
  assert.equal(resolveAgenticOsControlPlaneMcpUrl(productUrl), controlPlaneUrl)
  assert.equal(buildAgentSurfaceInspectionPayload({ baseUrl: productUrl }).controlPlaneMcpUrl, controlPlaneUrl)
  assert.equal(resolveMcpOnboardingUrls({ baseUrl: productUrl }).controlPlaneMcpUrl, controlPlaneUrl)
  assert.equal(buildAgenticGraphMcpAppsServerReadiness({ baseUrl: productUrl }).onboarding.controlPlaneMcpUrl, controlPlaneUrl)
  assert.match(buildAgenticGraphMcpAppsHtml({ appUrl: productUrl }), new RegExp(controlPlaneUrl))
})

test('control-plane resolver fails closed for a non-URL product base', () => {
  assert.equal(resolveAgenticOsControlPlaneMcpUrl('not a URL'), '')
})
