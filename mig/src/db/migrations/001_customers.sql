CREATE TABLE IF NOT EXISTS customers (
  phone        VARCHAR(20) PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  opted_in     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now()
);