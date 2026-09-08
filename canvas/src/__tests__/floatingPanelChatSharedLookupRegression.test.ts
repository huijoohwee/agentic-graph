import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testFloatingPanelChatReusesSharedLookup() {
  const consumer = readFileSync(
    resolve(process.cwd(), 'src', 'features', 'chat', 'FloatingPanelChat.tsx'),
    'utf8',
  )

  if (!consumer.includes("import { useFloatingPanelChatCredentialContext } from '@/features/chat/floatingPanelChat/useFloatingPanelChatCredentialContext'") || !consumer.includes('useFloatingPanelChatCredentialContext({')) {
    throw new Error('expected FloatingPanelChat to delegate selection credential lookup to its shared hook')
  }
  const text = readFileSync(resolve(process.cwd(), 'src/features/chat/floatingPanelChat/useFloatingPanelChatCredentialContext.ts'), 'utf8')

  if (
    !text.includes("buildScopedGraphSemanticKey('floating-panel-chat-graph'")
    || !text.includes("cacheScope: 'floating-panel-chat-graph'")
    || !text.includes('getCachedGraphLookup({')
    || !text.includes('graphRevision: args.graphDataRevision')
    || !text.includes('preferCurrentGraphDataRefs: true')
    || !text.includes('}).nodeById.get(args.selectedNodeId) || null')
    || text.includes('graphData.nodes.find(')
  ) {
    throw new Error('expected FloatingPanelChat to reuse the shared semantic graph lookup instead of rescanning graph nodes by selected id')
  }
}
