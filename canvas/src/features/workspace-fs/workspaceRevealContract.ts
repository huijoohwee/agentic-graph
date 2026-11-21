// One budget for the browser payload and the local host request reader.
export const WORKSPACE_REVEAL_MAX_BYTES = 500_000
export type WorkspaceRevealSnapshot = { workspacePath: string; text: string }

/** Imported workspace entries are published directly under the document output root. */
export function isWorkspaceWebsiteOutputPath(value: unknown): value is string {
  return typeof value === 'string' && (value === '/websites' || value.startsWith('/websites/'))
}
