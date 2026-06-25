DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('loyalty_initial', 'loyalty_reminder', 'referral_optin', 'referral_share');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS message_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone       VARCHAR(20) NOT NULL,
  to_name        VARCHAR(100),
  message_text   TEXT NOT NULL,
  type           message_type NOT NULL,
  reference_id   UUID,
  send_by        TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msgq_sent ON message_queue(sent_at);
CREATE INDEX IF NOT EXISTS idx_msgq_sendby ON message_queue(send_by);