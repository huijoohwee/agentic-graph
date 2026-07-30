import { applyRemoteDocumentToMarkdownWorkspace } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceCollaborationRuntimeBridge'

export async function testMarkdownWorkspaceCollaborationRuntimeBridgeCommitsProgrammaticTextForActiveDocument() {
  const setActiveMarkdownDocumentCalls: Array<Record<string, unknown>> = []
  const setActiveTextCalls: string[] = []

  const applied = await applyRemoteDocumentToMarkdownWorkspace({
    activeDocumentKey: 'docs/workspace-readme.md',
    documentKey: 'docs/workspace-readme.md',
    text: '# Remote sync\n',
    setActiveMarkdownDocument: async payload => {
      setActiveMarkdownDocumentCalls.push(payload as unknown as Record<string, unknown>)
      return true
    },
    setActiveText: text => {
      setActiveTextCalls.push(text)
    },
  })

  if (applied !== true) {
    throw new Error(`expected remote document apply to resolve true, got ${String(applied)}`)
  }
  if (setActiveMarkdownDocumentCalls.length !== 1) {
    throw new Error(`expected canonical markdown apply to run once, got ${setActiveMarkdownDocumentCalls.length}`)
  }
  if (setActiveTextCalls.length !== 1 || setActiveTextCalls[0] !== '# Remote sync\n') {
    throw new Error(`expected active editor text to receive the remote sync payload, got ${JSON.stringify(setActiveTextCalls)}`)
  }
}

export async function testMarkdownWorkspaceCollaborationRuntimeBridgeSkipsProgrammaticTextForInactiveOrRejectedApply() {
  const setActiveTextCalls: string[] = []

  const rejectedApply = await applyRemoteDocumentToMarkdownWorkspace({
    activeDocumentKey: 'docs/workspace-readme.md',
    documentKey: 'docs/workspace-readme.md',
    text: '# Rejected remote sync\n',
    setActiveMarkdownDocument: async () => false,
    setActiveText: text => {
      setActiveTextCalls.push(text)
    },
  })
  if (rejectedApply !== false) {
    throw new Error(`expected rejected remote apply to stay false, got ${String(rejectedApply)}`)
  }

  await applyRemoteDocumentToMarkdownWorkspace({
    activeDocumentKey: 'docs/workspace-readme.md',
    documentKey: 'docs/other.md',
    text: '# Other remote sync\n',
    setActiveMarkdownDocument: async () => true,
    setActiveText: text => {
      setActiveTextCalls.push(text)
    },
  })

  if (setActiveTextCalls.length !== 0) {
    throw new Error(`expected editor text sync to stay scoped to successful active-document applies, got ${JSON.stringify(setActiveTextCalls)}`)
  }
}
