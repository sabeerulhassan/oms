CREATE TABLE IF NOT EXISTS loyalty_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id),
  customer_phone   VARCHAR(20) NOT NULL REFERENCES customers(phone),
  code             VARCHAR(20) UNIQUE NOT NULL,
  discount_amount  INTEGER NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  used_on_order_id UUID REFERENCES orders(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_codes(customer_phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_code ON loyalty_codes(code);