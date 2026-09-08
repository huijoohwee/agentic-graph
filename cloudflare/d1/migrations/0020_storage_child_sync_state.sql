-- Durable child identity survives physical deletion and changed-ID restoration.
-- State revisions are allocated by SQLite and never derived from device clocks.
CREATE TABLE storage_child_state (
  sync_revision INTEGER PRIMARY KEY AUTOINCREMENT CHECK (sync_revision BETWEEN 1 AND 9007199254740991),
  workspace_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('documentChunk', 'graphSnapshot')),
  document_id TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, entity, document_id, identity_key, record_id)
);
CREATE INDEX storage_child_state_page ON storage_child_state (workspace_id, entity, updated_at, sync_revision);
CREATE INDEX storage_child_state_live_page ON storage_child_state (workspace_id, entity, updated_at, sync_revision) WHERE deleted = 0;
CREATE INDEX storage_child_state_record ON storage_child_state (workspace_id, entity, record_id, sync_revision DESC);
CREATE INDEX storage_child_state_identity ON storage_child_state (workspace_id, entity, document_id, identity_key, sync_revision DESC);
-- Match strict page order without sorting an unbounded equal-time document group.
DROP INDEX idx_documents_workspace_updated;
CREATE INDEX idx_documents_workspace_updated ON documents (workspace_id, updated_at, id);

INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
  SELECT row.workspace_id, 'documentChunk', row.document_id, CAST(row.chunk_key AS TEXT), row.id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM document_chunks AS row ORDER BY row.workspace_id, row.document_id, row.chunk_key, row.id;

CREATE TRIGGER document_chunks_sync_insert AFTER INSERT ON document_chunks
BEGIN
  DELETE FROM storage_child_state WHERE workspace_id = NEW.workspace_id AND entity = 'documentChunk'
    AND document_id = NEW.document_id AND identity_key = CAST(NEW.chunk_key AS TEXT) AND record_id = NEW.id;
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT NEW.workspace_id, 'documentChunk', NEW.document_id, CAST(NEW.chunk_key AS TEXT), NEW.id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

CREATE TRIGGER document_chunks_sync_delete AFTER DELETE ON document_chunks
BEGIN
  DELETE FROM storage_child_state WHERE workspace_id = OLD.workspace_id AND entity = 'documentChunk'
    AND document_id = OLD.document_id AND identity_key = CAST(OLD.chunk_key AS TEXT) AND record_id = OLD.id;
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT OLD.workspace_id, 'documentChunk', OLD.document_id, CAST(OLD.chunk_key AS TEXT), OLD.id, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

CREATE TRIGGER document_chunks_sync_update AFTER UPDATE ON document_chunks
WHEN OLD.id IS NOT NEW.id OR OLD.document_id IS NOT NEW.document_id OR OLD.workspace_id IS NOT NEW.workspace_id OR OLD.chunk_key IS NOT NEW.chunk_key OR OLD.chunk_order IS NOT NEW.chunk_order OR OLD.heading IS NOT NEW.heading OR OLD.markdown IS NOT NEW.markdown OR OLD.token_estimate IS NOT NEW.token_estimate OR OLD.content_hash IS NOT NEW.content_hash OR OLD.updated_at IS NOT NEW.updated_at
BEGIN
  DELETE FROM storage_child_state WHERE workspace_id = OLD.workspace_id AND entity = 'documentChunk'
    AND document_id = OLD.document_id AND identity_key = CAST(OLD.chunk_key AS TEXT) AND record_id = OLD.id AND (OLD.id IS NOT NEW.id OR OLD.workspace_id IS NOT NEW.workspace_id OR OLD.document_id IS NOT NEW.document_id OR OLD.chunk_key IS NOT NEW.chunk_key);
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT OLD.workspace_id, 'documentChunk', OLD.document_id, CAST(OLD.chunk_key AS TEXT), OLD.id, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE OLD.id IS NOT NEW.id OR OLD.workspace_id IS NOT NEW.workspace_id OR OLD.document_id IS NOT NEW.document_id OR OLD.chunk_key IS NOT NEW.chunk_key;
  DELETE FROM storage_child_state WHERE workspace_id = NEW.workspace_id AND entity = 'documentChunk'
    AND document_id = NEW.document_id AND identity_key = CAST(NEW.chunk_key AS TEXT) AND record_id = NEW.id;
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT NEW.workspace_id, 'documentChunk', NEW.document_id, CAST(NEW.chunk_key AS TEXT), NEW.id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
  SELECT row.workspace_id, 'graphSnapshot', row.document_id, CAST(row.graph_revision AS TEXT), row.id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM graph_snapshots AS row ORDER BY row.workspace_id, row.document_id, row.graph_revision, row.id;

CREATE TRIGGER graph_snapshots_sync_insert AFTER INSERT ON graph_snapshots
BEGIN
  DELETE FROM storage_child_state WHERE workspace_id = NEW.workspace_id AND entity = 'graphSnapshot'
    AND document_id = NEW.document_id AND identity_key = CAST(NEW.graph_revision AS TEXT) AND record_id = NEW.id;
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT NEW.workspace_id, 'graphSnapshot', NEW.document_id, CAST(NEW.graph_revision AS TEXT), NEW.id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

CREATE TRIGGER graph_snapshots_sync_delete AFTER DELETE ON graph_snapshots
BEGIN
  DELETE FROM storage_child_state WHERE workspace_id = OLD.workspace_id AND entity = 'graphSnapshot'
    AND document_id = OLD.document_id AND identity_key = CAST(OLD.graph_revision AS TEXT) AND record_id = OLD.id;
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT OLD.workspace_id, 'graphSnapshot', OLD.document_id, CAST(OLD.graph_revision AS TEXT), OLD.id, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

CREATE TRIGGER graph_snapshots_sync_update AFTER UPDATE ON graph_snapshots
WHEN OLD.id IS NOT NEW.id OR OLD.document_id IS NOT NEW.document_id OR OLD.workspace_id IS NOT NEW.workspace_id OR OLD.graph_revision IS NOT NEW.graph_revision OR OLD.graph_hash IS NOT NEW.graph_hash OR OLD.graph_json IS NOT NEW.graph_json OR OLD.layout_json IS NOT NEW.layout_json OR OLD.derived_from_document_revision IS NOT NEW.derived_from_document_revision OR OLD.updated_at IS NOT NEW.updated_at
BEGIN
  DELETE FROM storage_child_state WHERE workspace_id = OLD.workspace_id AND entity = 'graphSnapshot'
    AND document_id = OLD.document_id AND identity_key = CAST(OLD.graph_revision AS TEXT) AND record_id = OLD.id AND (OLD.id IS NOT NEW.id OR OLD.workspace_id IS NOT NEW.workspace_id OR OLD.document_id IS NOT NEW.document_id OR OLD.graph_revision IS NOT NEW.graph_revision);
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT OLD.workspace_id, 'graphSnapshot', OLD.document_id, CAST(OLD.graph_revision AS TEXT), OLD.id, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE OLD.id IS NOT NEW.id OR OLD.workspace_id IS NOT NEW.workspace_id OR OLD.document_id IS NOT NEW.document_id OR OLD.graph_revision IS NOT NEW.graph_revision;
  DELETE FROM storage_child_state WHERE workspace_id = NEW.workspace_id AND entity = 'graphSnapshot'
    AND document_id = NEW.document_id AND identity_key = CAST(NEW.graph_revision AS TEXT) AND record_id = NEW.id;
  INSERT INTO storage_child_state (workspace_id, entity, document_id, identity_key, record_id, deleted, updated_at)
    SELECT NEW.workspace_id, 'graphSnapshot', NEW.document_id, CAST(NEW.graph_revision AS TEXT), NEW.id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;
