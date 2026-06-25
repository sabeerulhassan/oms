-- backend/migrations/001_add_shipping_fields.sql

BEGIN;

-- Add city to customers
ALTER TABLE customers 
ADD COLUMN city VARCHAR(255);

-- Add shipping and weight fields to orders
ALTER TABLE orders 
ADD COLUMN tracking_number VARCHAR(255),
ADD COLUMN kilo INTEGER NOT NULL DEFAULT 0,
ADD COLUMN gram INTEGER NOT NULL DEFAULT 500,
ADD COLUMN pcs INTEGER NOT NULL DEFAULT 1;

COMMIT;