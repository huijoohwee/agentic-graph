type ActiveMarkdownBlockEditorCommit = () => void | Promise<void>

const activeMarkdownBlockEditorCommits = new Set<ActiveMarkdownBlockEditorCommit>()

export function registerActiveMarkdownBlockEditor(commit: ActiveMarkdownBlockEditorCommit): () => void {
  activeMarkdownBlockEditorCommits.add(commit)
  return () => {
    activeMarkdownBlockEditorCommits.delete(commit)
  }
}

export function commitActiveMarkdownBlockEditors(): Promise<void> | null {
  const commits = Array.from(activeMarkdownBlockEditorCommits)
  if (commits.length === 0) return null
  return Promise.all(commits.map(commit => Promise.resolve(commit()))).then(() => undefined)
}
