DO $$ BEGIN
    CREATE TYPE referral_status AS ENUM ('pending', 'completed', 'invalid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_phone    VARCHAR(20) NOT NULL REFERENCES customers(phone),
  referee_phone     VARCHAR(20) NOT NULL,
  status            referral_status NOT NULL DEFAULT 'pending',
  referrer_discount INTEGER,
  referee_discount  INTEGER,
  completed_order_id UUID REFERENCES orders(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  CONSTRAINT uq_referral_pair UNIQUE (referrer_phone, referee_phone),
  CONSTRAINT chk_no_self_referral CHECK (referrer_phone != referee_phone)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_phone);