import { containsFrontmatterMermaid } from 'grph-shared/markdown/mermaidInput'

import { buildWorkspaceGraphMutationTransitionState } from '@/features/workspace-table/workspaceTableSsot'
import { preferCanonicalYamlFrontmatterFencedText } from '@/lib/markdown/frontmatter'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import type { GetGraph, SetGraph } from './graphDataSliceAccess'

function buildMarkdownDocumentSwitchMutationSemanticKey(args: {
  name: string | null
  text: string | null
  applyViewPreset: boolean
}): string {
  const name = String(args.name || '').trim()
  const text = String(args.text || '')
  const textHash = hashStringToHexSharedContentCached(text, 'markdown-document-source-switch')
  return buildScopedGraphSemanticKey('markdown-document-source-switch', {
    graphSemanticKey: [
      name,
      text.length,
      textHash,
      args.applyViewPreset ? 'view:1' : 'view:0',
    ].join('|'),
  })
}

export function createGraphDataMarkdownDocumentStateActions(set: SetGraph, get: GetGraph) {
  return {
    setMarkdownDocument: (
      name: string | null,
      text: string | null,
      opts?: { autoEnableFrontmatter?: boolean; applyViewPreset?: boolean; forceRevision?: boolean },
    ) => {
      const state = get()
      const nextText = state.markdownDocumentName === name
        ? preferCanonicalYamlFrontmatterFencedText({
            candidateText: String(text || ''),
            canonicalText: String(state.markdownDocumentText || ''),
          })
        : String(text || '')
      const shouldAutoEnableFrontmatter = opts?.autoEnableFrontmatter !== false
      const requestedApplyViewPreset = typeof opts?.applyViewPreset === 'boolean' ? opts.applyViewPreset !== false : true
      const sameActiveDocumentText =
        state.markdownDocumentName === name &&
        state.markdownDocumentText === nextText
      const applyViewPreset =
        requestedApplyViewPreset === false &&
        sameActiveDocumentText &&
        state.markdownDocumentApplyViewPreset === true
          ? true
          : requestedApplyViewPreset
      const needsAutoEnable = shouldAutoEnableFrontmatter &&
        !(state.frontmatterModeEnabled || false) &&
        containsFrontmatterMermaid(nextText)
      const documentSwitches =
        state.markdownDocumentName !== name ||
        state.markdownDocumentText !== nextText ||
        state.markdownDocumentApplyViewPreset !== applyViewPreset
      const shouldBumpApplyRevision = documentSwitches || opts?.forceRevision === true
      if (!needsAutoEnable && !documentSwitches && !shouldBumpApplyRevision) return
      const transitionState = documentSwitches
        ? buildWorkspaceGraphMutationTransitionState({
            workspaceViewMode: state.workspaceViewMode,
            workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
            markdownWorkspaceIndexingInFlight: state.markdownWorkspaceIndexingInFlight,
            transitionSemanticKey: buildMarkdownDocumentSwitchMutationSemanticKey({
              name,
              text: nextText,
              applyViewPreset,
            }),
          })
        : {}
      set(prev => ({
        markdownDocumentName: name,
        markdownDocumentText: nextText,
        markdownDocumentApplyViewPreset: applyViewPreset,
        ...(shouldBumpApplyRevision ? { markdownDocumentApplyRevision: (prev.markdownDocumentApplyRevision || 0) + 1 } : {}),
        markdownTokens: null,
        markdownTokensPath: null,
        markdownTokensKey: null,
        markdownTokensMeta: null,
        markdownTokensStartLineOffset: null,
        ...(needsAutoEnable ? { frontmatterModeEnabled: true } : {}),
        ...transitionState,
      }))
    },
  }
}
