CREATE TABLE IF NOT EXISTS agentic_graph_r2_free_quota (
  scope_id TEXT PRIMARY KEY,
  month_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  class_a_used INTEGER NOT NULL DEFAULT 0 CHECK (class_a_used >= 0),
  class_b_used INTEGER NOT NULL DEFAULT 0 CHECK (class_b_used >= 0),
  uploaded_bytes_lifetime INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_bytes_lifetime >= 0),
  daily_reservations INTEGER NOT NULL DEFAULT 0 CHECK (daily_reservations >= 0),
  updated_at TEXT NOT NULL
);
