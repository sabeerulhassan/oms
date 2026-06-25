DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone   VARCHAR(20) NOT NULL REFERENCES customers(phone),
  summary          TEXT NOT NULL,
  total_amount     INTEGER NOT NULL,
  discount_code    VARCHAR(20),
  discount_amount  INTEGER NOT NULL DEFAULT 0,
  final_amount     INTEGER NOT NULL,
  status           order_status NOT NULL DEFAULT 'pending',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  delivered_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);