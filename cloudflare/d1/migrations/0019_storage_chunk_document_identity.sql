-- Chunk-backed public content is identified by its parent revision.
-- Inline documents retain their current revision when derived chunks change.
-- Required companion: pull since-boundary overlap and revision-bound chunk reads.

CREATE TRIGGER documents_revision_fence_before_update
BEFORE UPDATE OF revision, content_md, deleted ON documents
WHEN NEW.revision < OLD.revision
  OR ((NEW.content_md IS NOT OLD.content_md OR NEW.deleted IS NOT OLD.deleted)
      AND NEW.revision <= OLD.revision)
BEGIN
  SELECT RAISE(ABORT, 'document_revision_conflict');
END;

CREATE TRIGGER document_chunks_parent_revision_after_insert
AFTER INSERT ON document_chunks
BEGIN
  UPDATE documents
  SET revision = CASE
        WHEN typeof(revision) <> 'integer' OR revision < 0 OR revision >= 9007199254740991
          THEN RAISE(ABORT, 'document_chunk_revision_exhausted')
        ELSE revision + 1
      END,
      updated_at = max(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE id = NEW.document_id AND workspace_id = NEW.workspace_id
    AND content_md = '' AND deleted = 0;
END;

CREATE TRIGGER document_chunks_parent_revision_after_delete
AFTER DELETE ON document_chunks
BEGIN
  UPDATE documents
  SET revision = CASE
        WHEN typeof(revision) <> 'integer' OR revision < 0 OR revision >= 9007199254740991
          THEN RAISE(ABORT, 'document_chunk_revision_exhausted')
        ELSE revision + 1
      END,
      updated_at = max(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE id = OLD.document_id AND workspace_id = OLD.workspace_id
    AND content_md = '' AND deleted = 0;
END;

CREATE TRIGGER document_chunks_parent_revision_after_visible_update
AFTER UPDATE OF id, document_id, workspace_id, chunk_order, markdown ON document_chunks
WHEN NEW.id IS NOT OLD.id
  OR NEW.document_id IS NOT OLD.document_id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.chunk_order IS NOT OLD.chunk_order
  OR NEW.markdown IS NOT OLD.markdown
BEGIN
  UPDATE documents
  SET revision = CASE
        WHEN typeof(revision) <> 'integer' OR revision < 0 OR revision >= 9007199254740991
          THEN RAISE(ABORT, 'document_chunk_revision_exhausted')
        ELSE revision + 1
      END,
      updated_at = max(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE ((id = OLD.document_id AND workspace_id = OLD.workspace_id)
      OR (id = NEW.document_id AND workspace_id = NEW.workspace_id))
    AND content_md = '' AND deleted = 0;
END;
