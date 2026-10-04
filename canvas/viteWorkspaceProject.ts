import type { Connect } from 'vite'
import type { Server } from 'node:http'
import { createRequire } from 'node:module'

// Vite closes its configuration module runner before requests arrive. Keep the
// owner's lazy runtime imports on Node's loader, as the existing docs bridge does.
const requireNative = createRequire(import.meta.url)
type ProjectHandler = typeof import('../mcp/workspace-project-server.js').createWorkspaceProjectHandler

export const WORKSPACE_PROJECT_PATH = '/__workspace_project'

/** Mount in the existing local artifact bridge; no listener or second UI. */
export function createWorkspaceProjectMiddleware(
  server: Pick<Server, 'address'> | null,
  rootDir = process.env.AGENTIC_GRAPH_PROJECT_STORE,
): Connect.NextHandleFunction {
  let pending: ReturnType<ProjectHandler> | undefined
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    try {
      if (!rootDir) throw new Error('No project store configured. Start local Canvas with AGENTIC_GRAPH_PROJECT_STORE set to an existing dedicated directory.')
      const address = server?.address()
      if (!address || typeof address === 'string' || !['127.0.0.1', '::1'].includes(address.address)) {
        throw new Error('Project access requires Canvas bound exclusively to loopback.')
      }
      const host = request.headers.host
      if (![ `127.0.0.1:${address.port}`, `localhost:${address.port}`, `[::1]:${address.port}` ].includes(host || '')) {
        response.statusCode = 403
        response.end(JSON.stringify({ ok: false, error: { code: 'HOST_DENIED', message: 'Local Canvas host required.' } }))
        return
      }
      // Bind the first verified host. A later origin switch must establish a new session.
      if (!pending) {
        const { createWorkspaceProjectHandler } = requireNative('../mcp/workspace-project-server.js') as { createWorkspaceProjectHandler: ProjectHandler }
        pending = createWorkspaceProjectHandler({ rootDir, getOrigin: () => `http://${host}`, cookiePath: WORKSPACE_PROJECT_PATH })
      }
      const { handler } = await pending
      await handler(request, response)
    } catch (error) {
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: error instanceof Error ? error.message : 'Project store unavailable.' } }))
    }
  }
}
