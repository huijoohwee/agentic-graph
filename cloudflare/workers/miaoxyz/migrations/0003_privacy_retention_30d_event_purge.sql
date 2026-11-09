CREATE INDEX operator_events_object_idx ON operator_events (object_id);

UPDATE store_settings SET retention_days = 30 WHERE id = 1;

CREATE TRIGGER store_settings_retention_days_30
BEFORE UPDATE OF retention_days ON store_settings
WHEN NEW.retention_days IS NOT 30
BEGIN
  SELECT RAISE(ABORT, 'MiaoXYZ retention is fixed at 30 days');
END;
