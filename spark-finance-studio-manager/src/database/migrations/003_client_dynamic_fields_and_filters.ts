/**
 * Migration 003: Client Dynamic Fields, Custom Field Schema, and Filter Presets
 */
export const CLIENT_DYNAMIC_FIELDS_AND_FILTERS_SQL = `
-- 1. Extend Core Clients Table
ALTER TABLE clients ADD COLUMN client_type TEXT DEFAULT 'individual';
ALTER TABLE clients ADD COLUMN contact_name TEXT;
ALTER TABLE clients ADD COLUMN contact_role TEXT;
ALTER TABLE clients ADD COLUMN whatsapp TEXT;
ALTER TABLE clients ADD COLUMN email TEXT;
ALTER TABLE clients ADD COLUMN city TEXT;
ALTER TABLE clients ADD COLUMN preferred_contact TEXT DEFAULT 'phone';

-- 2. Custom Field Definitions
CREATE TABLE IF NOT EXISTS client_custom_field_definitions (
    id TEXT PRIMARY KEY,
    field_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'general',
    help_text TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    searchable INTEGER NOT NULL DEFAULT 0,
    filterable INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 3. Custom Field Options
CREATE TABLE IF NOT EXISTS client_custom_field_options (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE CASCADE,
    value_key TEXT NOT NULL,
    label TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_client_field_option UNIQUE (field_definition_id, value_key)
);

-- 4. Single-value Custom Field Values
CREATE TABLE IF NOT EXISTS client_custom_field_values (
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT,
    text_value TEXT,
    number_value INTEGER,
    date_value TEXT,
    boolean_value INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (client_id, field_definition_id)
);

-- 5. Multi-Select Child Relation
CREATE TABLE IF NOT EXISTS client_custom_field_multiselect_values (
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT,
    option_id TEXT NOT NULL REFERENCES client_custom_field_options(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, field_definition_id, option_id)
);

-- 6. Filter Presets
CREATE TABLE IF NOT EXISTS client_filter_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rules_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 7. Optimized Indexes
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city);
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_active ON client_custom_field_definitions(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_custom_field_options_def ON client_custom_field_options(field_definition_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_client ON client_custom_field_values(client_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_def ON client_custom_field_values(field_definition_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_multiselect_client ON client_custom_field_multiselect_values(client_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_multiselect_option ON client_custom_field_multiselect_values(option_id);
CREATE INDEX IF NOT EXISTS idx_filter_presets_sort ON client_filter_presets(sort_order);
`;
