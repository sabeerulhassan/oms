BEGIN;

-- 1. Add the column (nullable initially to allow existing records to be populated)
ALTER TABLE orders ADD COLUMN order_number VARCHAR(25);

-- 2. Populate existing orders with a random 6-character hex string prefixed with 'ORD-'
UPDATE orders 
SET order_number = 'ORD-' || upper(substring(md5(random()::text) from 1 for 6)) 
WHERE order_number IS NULL;

-- 3. Enforce constraints
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);
ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;

COMMIT;