-- ==============================================================================
-- Migration 003: Client Dynamic Fields, Custom Field Schema, and Filter Presets
-- Spark Finance & Studio Manager
-- Invariants: Integer Piasters, ISO-8601 UTC Dates, Soft Deactivation, No Leads/CRM
-- ==============================================================================

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
    id TEXT PRIMARY KEY,                       -- UUID v4
    field_key TEXT NOT NULL UNIQUE,            -- Unique immutable snake_case key
    label TEXT NOT NULL,                       -- Arabic/English display label
    field_type TEXT NOT NULL,                  -- short_text, long_text, integer, money_piasters, date, phone, email, url, boolean, single_select, multi_select
    section TEXT NOT NULL DEFAULT 'general',   -- Logical display section
    help_text TEXT,                            -- Guidance text for Safaa
    required INTEGER NOT NULL DEFAULT 0,       -- 1 = mandatory, 0 = optional
    searchable INTEGER NOT NULL DEFAULT 0,     -- 1 = indexed in quick/global search
    filterable INTEGER NOT NULL DEFAULT 1,     -- 1 = available in filter builder
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = active, 0 = deactivated (preserves historical data)
    sort_order INTEGER NOT NULL DEFAULT 0,     -- Ordering in forms and displays
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 3. Custom Field Options (for single_select and multi_select)
CREATE TABLE IF NOT EXISTS client_custom_field_options (
    id TEXT PRIMARY KEY,                       -- UUID v4
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE CASCADE,
    value_key TEXT NOT NULL,                   -- Key identifier within field
    label TEXT NOT NULL,                       -- Display label
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = active, 0 = deactivated
    sort_order INTEGER NOT NULL DEFAULT 0,     -- Ordering in dropdowns/checkboxes
    CONSTRAINT uq_client_field_option UNIQUE (field_definition_id, value_key)
);

-- 4. Single-value Custom Field Values
CREATE TABLE IF NOT EXISTS client_custom_field_values (
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT,
    text_value TEXT,                           -- for short_text, long_text, phone, email, url, single_select
    number_value INTEGER,                      -- for integer, money_piasters
    date_value TEXT,                           -- ISO-8601 YYYY-MM-DD
    boolean_value INTEGER,                     -- 0 or 1
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    PRIMARY KEY (client_id, field_definition_id)
);

-- 5. Multi-Select Child Relation
CREATE TABLE IF NOT EXISTS client_custom_field_multiselect_values (
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT,
    option_id TEXT NOT NULL REFERENCES client_custom_field_options(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, field_definition_id, option_id)
);

-- 6. Filter Presets (User-saved filter configurations)
CREATE TABLE IF NOT EXISTS client_filter_presets (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL,                        -- Name of preset e.g. "معلمون في الجيزة عليهم مستحقات"
    rules_json TEXT NOT NULL,                  -- Serialized Filter AST rules JSON
    schema_version INTEGER NOT NULL DEFAULT 1, -- Version for migrations of preset structures
    sort_order INTEGER NOT NULL DEFAULT 0,     -- Ordering
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
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
