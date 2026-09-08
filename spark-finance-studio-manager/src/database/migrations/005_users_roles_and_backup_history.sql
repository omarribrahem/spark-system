-- ==============================================================================
-- Spark Internal Database Migration 005: Users, Roles & Backup History
-- Safe, additive migration: Zero breaking changes to existing 38 tables.
-- ==============================================================================

-- 1. users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'viewer', -- 'admin', 'finance', 'operations', 'viewer'
    active INTEGER NOT NULL DEFAULT 1,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. backup_records table
CREATE TABLE IF NOT EXISTS backup_records (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_path TEXT,
    file_size_bytes INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success', -- 'success', 'failed', 'restoring'
    failure_reason TEXT,
    storage_type TEXT NOT NULL DEFAULT 'local', -- 'local', 'gdrive'
    gdrive_file_id TEXT,
    snapshot_metadata_json TEXT,
    created_at TEXT NOT NULL
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, active);
CREATE INDEX IF NOT EXISTS idx_backup_records_status ON backup_records(status, created_at);

-- 4. Seed Standard Default Users
INSERT OR IGNORE INTO users (id, name, email, role, active, created_at, updated_at)
VALUES
('usr-admin-1', 'مدير النظام (Admin)', 'admin@spark.internal', 'admin', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'),
('usr-finance-1', 'صفاء - الإدارة المالية', 'safaa@spark.internal', 'finance', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'),
('usr-ops-1', 'مسؤول العمليات والإنتاج', 'ops@spark.internal', 'operations', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'),
('usr-viewer-1', 'مستعرض عام (قراءة فقط)', 'viewer@spark.internal', 'viewer', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
