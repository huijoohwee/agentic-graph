import * as Y from 'yjs'
import {
  applyYjsUpdateBase64,
  createCollaborationYDoc,
  encodeCollaborationYDocStateBase64,
  serializeCollaborationYDoc,
} from '../../../../grph-shared/src/collaboration/yjsSnapshot'

export const SHARED_NODE_DOCUMENT_CACHE_LIMIT = 64

export type SharedNodeDocumentIdentity = {
  workspaceId: string
  roomId: string
  nodeId: string
}

export type SharedNodeDocumentEntry = {
  doc: Y.Doc
  documentKey: string
}

const keyOf = (identity: SharedNodeDocumentIdentity): string =>
  `${identity.workspaceId}:${identity.roomId}:${identity.nodeId}`

const documentKeyOf = (identity: SharedNodeDocumentIdentity): string =>
  `txnode/${identity.workspaceId}/${identity.roomId}/${identity.nodeId}.json`

export class SharedNodeCrdtMergeCache {
  private readonly documents = new Map<string, SharedNodeDocumentEntry>()

  get(identity: SharedNodeDocumentIdentity): SharedNodeDocumentEntry {
    const key = keyOf(identity)
    const existing = this.documents.get(key)
    if (existing) {
      this.documents.delete(key)
      this.documents.set(key, existing)
      return existing
    }
    const entry = {
      doc: createCollaborationYDoc({
        documentKey: documentKeyOf(identity),
        documentKind: 'json',
        initialText: '{}',
      }),
      documentKey: documentKeyOf(identity),
    }
    this.documents.set(key, entry)
    this.prune()
    return entry
  }

  replace(identity: SharedNodeDocumentIdentity, yjsStateBase64: string): SharedNodeDocumentEntry {
    const entry = {
      doc: createCollaborationYDoc({
        documentKey: documentKeyOf(identity),
        documentKind: 'json',
        initialText: '{}',
      }),
      documentKey: documentKeyOf(identity),
    }
    applyYjsUpdateBase64({ doc: entry.doc, updateBase64: yjsStateBase64, origin: 'room-rehydrate' })
    const key = keyOf(identity)
    this.documents.delete(key)
    this.documents.set(key, entry)
    this.prune()
    return entry
  }

  applyDelta(identity: SharedNodeDocumentIdentity, updateBase64: string): SharedNodeDocumentEntry | null {
    const entry = this.get(identity)
    const applied = applyYjsUpdateBase64({ doc: entry.doc, updateBase64, origin: 'room-delta' })
    return applied ? entry : null
  }

  private prune(): void {
    while (this.documents.size > SHARED_NODE_DOCUMENT_CACHE_LIMIT) {
      const firstKey = this.documents.keys().next().value
      if (!firstKey) return
      this.documents.delete(firstKey)
    }
  }
}

export const serializeSharedNodeDocumentState = (doc: Y.Doc): string =>
  encodeCollaborationYDocStateBase64(doc)

export const serializeSharedNodeDocumentPayload = (doc: Y.Doc): string =>
  serializeCollaborationYDoc({ doc, documentKind: 'json' })
