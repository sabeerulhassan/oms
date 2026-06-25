-- Since ALTER TYPE ADD VALUE cannot run inside a multi-statement transaction block in some Postgres versions, we run it directly.
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'order_dispatched';