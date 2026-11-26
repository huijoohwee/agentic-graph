CREATE TABLE IF NOT EXISTS agentic_graph_d1_blob_quota (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0 AND used_bytes <= 67108864),
  limit_bytes INTEGER NOT NULL DEFAULT 67108864 CHECK (limit_bytes = 67108864)
);

INSERT OR IGNORE INTO agentic_graph_d1_blob_quota (id, used_bytes, limit_bytes) VALUES (1, 0, 67108864);

CREATE TABLE IF NOT EXISTS agentic_graph_d1_blob_objects (
  object_key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_hash TEXT,
  custom_metadata_json TEXT NOT NULL DEFAULT '{}',
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 16777216),
  etag TEXT NOT NULL CHECK (length(etag) = 64),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agentic_graph_d1_blob_chunks (
  object_key TEXT NOT NULL REFERENCES agentic_graph_d1_blob_objects(object_key) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  body BLOB NOT NULL CHECK (length(body) <= 1048576),
  PRIMARY KEY (object_key, chunk_index)
);

CREATE TRIGGER IF NOT EXISTS agentic_graph_d1_blob_quota_before_insert
BEFORE INSERT ON agentic_graph_d1_blob_objects
BEGIN
  SELECT CASE WHEN COALESCE((SELECT used_bytes + NEW.size_bytes <= limit_bytes
    FROM agentic_graph_d1_blob_quota WHERE id = 1), 0) = 0
    THEN RAISE(ABORT, 'graph_d1_blob_quota_exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS agentic_graph_d1_blob_quota_after_insert
AFTER INSERT ON agentic_graph_d1_blob_objects
BEGIN
  UPDATE agentic_graph_d1_blob_quota SET used_bytes = used_bytes + NEW.size_bytes WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS agentic_graph_d1_blob_quota_before_update
BEFORE UPDATE OF size_bytes ON agentic_graph_d1_blob_objects
BEGIN
  SELECT CASE WHEN COALESCE((SELECT used_bytes - OLD.size_bytes + NEW.size_bytes <= limit_bytes
    FROM agentic_graph_d1_blob_quota WHERE id = 1), 0) = 0
    THEN RAISE(ABORT, 'graph_d1_blob_quota_exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS agentic_graph_d1_blob_quota_after_update
AFTER UPDATE OF size_bytes ON agentic_graph_d1_blob_objects
BEGIN
  UPDATE agentic_graph_d1_blob_quota
    SET used_bytes = used_bytes - OLD.size_bytes + NEW.size_bytes WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS agentic_graph_d1_blob_quota_after_delete
AFTER DELETE ON agentic_graph_d1_blob_objects
BEGIN
  UPDATE agentic_graph_d1_blob_quota SET used_bytes = used_bytes - OLD.size_bytes WHERE id = 1;
END;
