PRAGMA foreign_keys = ON;

CREATE TABLE store_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT '',
  service_area TEXT NOT NULL DEFAULT '',
  price_note TEXT NOT NULL DEFAULT '',
  privacy_notice_version TEXT NOT NULL DEFAULT '',
  privacy_notice TEXT NOT NULL DEFAULT '',
  retention_days INTEGER CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 365),
  pickup_enabled INTEGER NOT NULL DEFAULT 0 CHECK (pickup_enabled IN (0, 1)),
  delivery_enabled INTEGER NOT NULL DEFAULT 0 CHECK (delivery_enabled IN (0, 1)),
  order_intake_enabled INTEGER NOT NULL DEFAULT 0 CHECK (order_intake_enabled IN (0, 1)),
  catalog_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT INTO store_settings (id, updated_at) VALUES (1, '1970-01-01T00:00:00.000Z');

CREATE TABLE catalog_revisions (
  revision INTEGER PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE order_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_digest TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'accepted', 'declined', 'fulfilled', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retain_until TEXT NOT NULL
);

CREATE INDEX order_requests_queue_idx ON order_requests (status, created_at DESC);
CREATE INDEX order_requests_retention_idx ON order_requests (retain_until);

CREATE TABLE request_status_history (
  event_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES order_requests(request_id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('buyer', 'operator')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX request_status_history_request_idx ON request_status_history (request_id, occurred_at);

CREATE TABLE operator_events (
  event_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  object_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE request_rate_limits (
  bucket_digest TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX request_rate_limits_expiry_idx ON request_rate_limits (expires_at);
