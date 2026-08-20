PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS document_publications (
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  document_revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'revoked')),
  published_by_user_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, document_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_publications_workspace_path
  ON document_publications(workspace_id, canonical_path);
CREATE INDEX IF NOT EXISTS idx_document_publications_public_path
  ON document_publications(workspace_id, status, canonical_path, document_id);

CREATE INDEX IF NOT EXISTS idx_documents_workspace_page
  ON documents(workspace_id, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_workspace_page
  ON document_chunks(workspace_id, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_graph_snapshots_workspace_page
  ON graph_snapshots(workspace_id, updated_at, id);
