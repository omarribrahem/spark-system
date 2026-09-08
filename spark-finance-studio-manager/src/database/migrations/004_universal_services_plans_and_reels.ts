/**
 * Migration 004: Universal Services, Plan Templates, Sold Plans,
 * Entitlements, Unified Agreements, and Workflow Stages.
 */
export const UNIVERSAL_SERVICES_PLANS_AND_REELS_SQL = `
-- 1. Extend service_definitions
ALTER TABLE service_definitions ADD COLUMN service_type_key TEXT;
ALTER TABLE service_definitions ADD COLUMN default_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_definitions ADD COLUMN currency TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE service_definitions ADD COLUMN default_duration_days INTEGER;
ALTER TABLE service_definitions ADD COLUMN unit_name TEXT;
ALTER TABLE service_definitions ADD COLUMN requires_contract INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_definitions ADD COLUMN has_fixed_dates INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_definitions ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_definitions ADD COLUMN tags TEXT;
ALTER TABLE service_definitions ADD COLUMN updated_at TEXT;

-- 2. plan_templates
CREATE TABLE IF NOT EXISTS plan_templates (
    id TEXT PRIMARY KEY,
    service_id TEXT REFERENCES service_definitions(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    default_price INTEGER NOT NULL DEFAULT 0,
    billing_method TEXT NOT NULL DEFAULT 'entitlement_package',
    duration_days INTEGER,
    terms TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 3. plan_template_entitlements
CREATE TABLE IF NOT EXISTS plan_template_entitlements (
    id TEXT PRIMARY KEY,
    plan_template_id TEXT NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
    entitlement_name TEXT NOT NULL,
    entitlement_key TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit TEXT NOT NULL,
    allow_overage INTEGER NOT NULL DEFAULT 0,
    rollover_allowed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 4. sold_plans (Client Services / Purchased Plans with immutable snapshots)
CREATE TABLE IF NOT EXISTS sold_plans (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    plan_template_id TEXT REFERENCES plan_templates(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,
    price_snapshot INTEGER NOT NULL,
    discount_snapshot INTEGER NOT NULL DEFAULT 0,
    tax_snapshot INTEGER NOT NULL DEFAULT 0,
    total_snapshot INTEGER NOT NULL,
    billing_method TEXT NOT NULL DEFAULT 'entitlement_package',
    terms_snapshot TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    renewal_date TEXT,
    service_status TEXT NOT NULL DEFAULT 'active',
    collection_status TEXT NOT NULL DEFAULT 'unpaid',
    assignee TEXT,
    agreement_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 5. sold_plan_entitlements
CREATE TABLE IF NOT EXISTS sold_plan_entitlements (
    id TEXT PRIMARY KEY,
    sold_plan_id TEXT NOT NULL REFERENCES sold_plans(id) ON DELETE CASCADE,
    entitlement_name TEXT NOT NULL,
    entitlement_key TEXT NOT NULL,
    quantity_initial INTEGER NOT NULL,
    quantity_used INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    quantity_remaining INTEGER NOT NULL,
    unit TEXT NOT NULL,
    allow_overage INTEGER NOT NULL DEFAULT 0,
    rollover_allowed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 6. client_agreements (Universal Contracts, Subscriptions, Projects)
CREATE TABLE IF NOT EXISTS client_agreements (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    service_id TEXT REFERENCES service_definitions(id) ON DELETE SET NULL,
    plan_template_id TEXT REFERENCES plan_templates(id) ON DELETE SET NULL,
    agreement_number TEXT NOT NULL,
    display_name TEXT NOT NULL,
    agreement_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    renewal_date TEXT,
    billing_method TEXT NOT NULL,
    agreed_amount INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL,
    service_status TEXT NOT NULL DEFAULT 'active',
    collection_status TEXT NOT NULL DEFAULT 'unpaid',
    assignee TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 7. workflow_stages
CREATE TABLE IF NOT EXISTS workflow_stages (
    id TEXT PRIMARY KEY,
    workflow_type TEXT NOT NULL,
    stage_key TEXT NOT NULL,
    label TEXT NOT NULL,
    color_class TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_protected INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE(workflow_type, stage_key)
);

-- 8. app_custom_field_definitions
CREATE TABLE IF NOT EXISTS app_custom_field_definitions (
    id TEXT PRIMARY KEY,
    entity_scope TEXT NOT NULL,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 0,
    default_value TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    show_in_form INTEGER NOT NULL DEFAULT 1,
    show_in_table INTEGER NOT NULL DEFAULT 1,
    filterable INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_scope, field_key)
);

-- 9. app_custom_field_options
CREATE TABLE IF NOT EXISTS app_custom_field_options (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL REFERENCES app_custom_field_definitions(id) ON DELETE CASCADE,
    value_key TEXT NOT NULL,
    label TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(field_definition_id, value_key)
);

-- 10. app_custom_field_values
CREATE TABLE IF NOT EXISTS app_custom_field_values (
    id TEXT PRIMARY KEY,
    entity_scope TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_definition_id TEXT NOT NULL REFERENCES app_custom_field_definitions(id) ON DELETE CASCADE,
    text_value TEXT,
    number_value INTEGER,
    date_value TEXT,
    boolean_value INTEGER,
    option_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_scope, entity_id, field_definition_id)
);

-- 11. app_custom_field_multiselect_values
CREATE TABLE IF NOT EXISTS app_custom_field_multiselect_values (
    entity_scope TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_definition_id TEXT NOT NULL REFERENCES app_custom_field_definitions(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL REFERENCES app_custom_field_options(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY(entity_scope, entity_id, field_definition_id, option_id)
);

-- 12. general_audit_logs
CREATE TABLE IF NOT EXISTS general_audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT,
    change_reason TEXT NOT NULL,
    old_values_json TEXT,
    new_values_json TEXT,
    timestamp TEXT NOT NULL
);

-- 13. Extend reel_items
ALTER TABLE reel_items ADD COLUMN sold_plan_id TEXT REFERENCES sold_plans(id) ON DELETE SET NULL;
ALTER TABLE reel_items ADD COLUMN assignee TEXT;
ALTER TABLE reel_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE reel_items ADD COLUMN target_date TEXT;
ALTER TABLE reel_items ADD COLUMN filmed_date TEXT;
ALTER TABLE reel_items ADD COLUMN delivered_date TEXT;
ALTER TABLE reel_items ADD COLUMN external_links TEXT;
ALTER TABLE reel_items ADD COLUMN tags TEXT;

-- 14. Indexes
CREATE INDEX IF NOT EXISTS idx_sold_plans_client ON sold_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_sold_plans_status ON sold_plans(service_status, collection_status);
CREATE INDEX IF NOT EXISTS idx_client_agreements_client ON client_agreements(client_id);
CREATE INDEX IF NOT EXISTS idx_client_agreements_status ON client_agreements(service_status, collection_status);
CREATE INDEX IF NOT EXISTS idx_reel_items_sold_plan ON reel_items(sold_plan_id);
CREATE INDEX IF NOT EXISTS idx_reel_items_status ON reel_items(status);
CREATE INDEX IF NOT EXISTS idx_app_cf_values ON app_custom_field_values(entity_scope, entity_id);

-- 15. Default reel workflow stages
INSERT OR IGNORE INTO workflow_stages (id, workflow_type, stage_key, label, color_class, sort_order, is_protected, active, created_at)
VALUES
('ws-reel-1', 'reel', 'planned', 'المخطط', 'bg-blue-50 text-blue-700', 10, 0, 1, '2026-09-08T00:00:00.000Z'),
('ws-reel-2', 'reel', 'ready_to_film', 'جاهز للتصوير', 'bg-sky-50 text-sky-700', 20, 0, 1, '2026-09-08T00:00:00.000Z'),
('ws-reel-3', 'reel', 'filmed', 'تم التصوير', 'bg-amber-50 text-amber-700', 30, 0, 1, '2026-09-08T00:00:00.000Z'),
('ws-reel-4', 'reel', 'editing', 'قيد المونتاج', 'bg-purple-50 text-purple-700', 40, 0, 1, '2026-09-08T00:00:00.000Z'),
('ws-reel-5', 'reel', 'review', 'قيد المراجعة', 'bg-indigo-50 text-indigo-700', 50, 0, 1, '2026-09-08T00:00:00.000Z'),
('ws-reel-6', 'reel', 'delivered', 'تم التسليم', 'bg-emerald-50 text-emerald-700', 60, 1, 1, '2026-09-08T00:00:00.000Z'),
('ws-reel-7', 'reel', 'cancelled', 'ملغي', 'bg-rose-50 text-rose-700', 70, 1, 1, '2026-09-08T00:00:00.000Z');
`;
