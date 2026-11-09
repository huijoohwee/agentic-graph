ALTER TABLE store_settings
ADD COLUMN delivery_fee_minor INTEGER CHECK (delivery_fee_minor IS NULL OR delivery_fee_minor BETWEEN 0 AND 200000);
