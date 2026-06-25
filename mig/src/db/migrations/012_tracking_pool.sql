BEGIN;

CREATE TABLE IF NOT EXISTS tracking_pool (
  tracking_number   VARCHAR(255) PRIMARY KEY,
  used_on_order_id  UUID REFERENCES orders(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Index to quickly find unutilized tracking numbers
CREATE INDEX IF NOT EXISTS idx_tracking_pool_unutilized 
ON tracking_pool(created_at) 
WHERE used_on_order_id IS NULL;

COMMIT;