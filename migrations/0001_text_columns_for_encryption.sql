-- Migration: Convert VARCHAR columns to TEXT for encryption support
--
-- AES-256-GCM encrypted data is ~1.4x larger than plaintext (base64 encoding + IV + auth tag)
-- VARCHAR(500) is too small for encrypted task titles
-- VARCHAR(255) is too small for encrypted domain names
--
-- This migration is idempotent - safe to run multiple times
-- Run this on production database before deploying v0.8.5

-- Task.title: VARCHAR(500) -> TEXT
ALTER TABLE tasks ALTER COLUMN title TYPE TEXT;

-- Domain.name: VARCHAR(255) -> TEXT
ALTER TABLE domains ALTER COLUMN name TYPE TEXT;

-- Verify the changes
SELECT
    table_name,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('tasks', 'domains')
  AND column_name IN ('title', 'name', 'description')
ORDER BY table_name, column_name;
