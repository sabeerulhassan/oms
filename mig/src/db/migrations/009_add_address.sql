BEGIN;

-- Add the missing address column to the customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS address TEXT;

COMMIT;