import type { MarkdownWorkspaceLoadedSnapshot } from './markdownWorkspaceRuntime.types'
import type { MutableRefObject } from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'

export function resolveMarkdownWorkspaceLoadedSnapshot(args: MarkdownWorkspaceLoadedSnapshot & {
  previous?: MarkdownWorkspaceLoadedSnapshot | null
}): MarkdownWorkspaceLoadedSnapshot {
  const observation = Object.prototype.hasOwnProperty.call(args, 'observedWorkspaceText') ? {
    observedWorkspaceText: args.observedWorkspaceText, observedWorkspaceFs: args.observedWorkspaceFs,
  } : args.previous?.path === args.path ? {
    observedWorkspaceText: args.previous.observedWorkspaceText, observedWorkspaceFs: args.previous.observedWorkspaceFs,
  } : {}
  return { path: args.path, text: args.text, ...observation }
}

export function readMarkdownWorkspaceWriteExpectation(loaded: MarkdownWorkspaceLoadedSnapshot | null, path: WorkspacePath) {
  if (loaded?.path !== path || loaded.observedWorkspaceText === undefined || !loaded.observedWorkspaceFs) return null
  return { expectedWorkspaceText: loaded.observedWorkspaceText, expectedWorkspaceFs: loaded.observedWorkspaceFs }
}

export function commitMarkdownWorkspaceWriteback(args: {
  path: WorkspacePath
  text: string
  lastLoadedRef: MutableRefObject<MarkdownWorkspaceLoadedSnapshot | null>
  patchWorkspaceEntryInlineText: (path: WorkspacePath, text: string) => void
  setActiveTextProgrammatic: (next: string) => void
  observedWorkspaceText?: string | null
  observedWorkspaceFs?: MarkdownWorkspaceLoadedSnapshot['observedWorkspaceFs']
}): void {
  args.lastLoadedRef.current = resolveMarkdownWorkspaceLoadedSnapshot({ ...args, previous: args.lastLoadedRef.current })
  args.patchWorkspaceEntryInlineText(args.path, args.text)
  args.setActiveTextProgrammatic(args.text)
}
