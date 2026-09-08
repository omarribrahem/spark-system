import { IDatabaseDriver } from './test-database';

/**
 * 22-Table Schema DDL for Spark Finance & Studio Manager.
 * Strictly adheres to Integer Piasters (EGP) and Integer Minutes standards.
 */
export const SCHEMA_DDL: string[] = [
  // 1. Clients Table
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company_name TEXT,
    phone TEXT,
    secondary_phone TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active, inactive
    notes TEXT,
    client_type TEXT DEFAULT 'individual',
    contact_name TEXT,
    contact_role TEXT,
    whatsapp TEXT,
    email TEXT,
    city TEXT,
    preferred_contact TEXT DEFAULT 'phone',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 2. Service Catalog (Dynamic Service Definitions)
  `CREATE TABLE IF NOT EXISTS service_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    billing_model TEXT NOT NULL, -- monthly, project, hourly, package, one_off, custom
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 3. Marketing Contracts
  `CREATE TABLE IF NOT EXISTS marketing_contracts (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    monthly_amount INTEGER NOT NULL, -- integer piasters
    start_date TEXT NOT NULL, -- YYYY-MM-DD
    end_date TEXT,            -- YYYY-MM-DD
    billing_timing TEXT NOT NULL DEFAULT 'end_of_month', -- start_of_month, end_of_month
    status TEXT NOT NULL DEFAULT 'active', -- draft, active, paused, ended, cancelled
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 4. Marketing Contract Dues
  `CREATE TABLE IF NOT EXISTS marketing_contract_dues (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    base_amount INTEGER NOT NULL, -- integer piasters
    extras_amount INTEGER NOT NULL DEFAULT 0, -- integer piasters
    total_amount INTEGER NOT NULL, -- integer piasters (base + extras)
    paid_amount INTEGER NOT NULL DEFAULT 0, -- integer piasters
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'upcoming', -- upcoming, due, partial, paid, overdue
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contract_id) REFERENCES marketing_contracts(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 5. Marketing Extras
  `CREATE TABLE IF NOT EXISTS marketing_extras (
    id TEXT PRIMARY KEY,
    due_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL, -- integer piasters
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (due_id) REFERENCES marketing_contract_dues(id)
  );`,

  // 6. Subscriptions
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    monthly_amount INTEGER NOT NULL, -- integer piasters
    billing_day INTEGER NOT NULL DEFAULT 1, -- 1-31
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active, paused, ended, cancelled
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 7. Subscription Dues
  `CREATE TABLE IF NOT EXISTS subscription_dues (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    amount INTEGER NOT NULL, -- integer piasters
    paid_amount INTEGER NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'upcoming', -- upcoming, due, partial, paid, overdue
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 8. Website Projects
  `CREATE TABLE IF NOT EXISTS website_projects (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    total_price INTEGER NOT NULL, -- integer piasters
    paid_amount INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    expected_delivery_date TEXT,
    status TEXT NOT NULL DEFAULT 'new', -- new, in_progress, waiting, completed, cancelled
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 9. Website Milestones
  `CREATE TABLE IF NOT EXISTS website_milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    target_amount INTEGER NOT NULL, -- integer piasters
    paid_amount INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, partial, completed
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES website_projects(id)
  );`,

  // 10. Package Templates (Catalog)
  `CREATE TABLE IF NOT EXISTS package_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_price INTEGER NOT NULL, -- integer piasters
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 11. Package Template Items
  `CREATE TABLE IF NOT EXISTS package_template_items (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    unit_type TEXT NOT NULL, -- 'hours' or 'reels'
    quantity INTEGER NOT NULL, -- hours in minutes or reel count
    FOREIGN KEY (template_id) REFERENCES package_templates(id)
  );`,

  // 12. Client Packages (Sold Snapshots)
  `CREATE TABLE IF NOT EXISTS client_packages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    template_id TEXT,
    package_name_snapshot TEXT NOT NULL,
    sold_price INTEGER NOT NULL, -- integer piasters
    paid_amount INTEGER NOT NULL DEFAULT 0,
    purchase_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started', -- not_started, active, fully_used, cancelled
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 13. Client Package Items
  `CREATE TABLE IF NOT EXISTS client_package_items (
    id TEXT PRIMARY KEY,
    client_package_id TEXT NOT NULL,
    unit_type TEXT NOT NULL, -- 'hours' (in integer minutes) or 'reels' (in integer count)
    purchased_quantity INTEGER NOT NULL,
    used_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (client_package_id) REFERENCES client_packages(id)
  );`,

  // 14. Recurring Booking Rules
  `CREATE TABLE IF NOT EXISTS recurring_booking_rules (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    package_id TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days_of_week TEXT NOT NULL, -- JSON array e.g. [6] for Saturday
    start_time TEXT NOT NULL, -- HH:mm
    end_time TEXT NOT NULL,   -- HH:mm
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 15. Studio Bookings
  `CREATE TABLE IF NOT EXISTS studio_bookings (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    package_id TEXT,
    recurring_rule_id TEXT,
    booking_date TEXT NOT NULL, -- YYYY-MM-DD
    start_time TEXT NOT NULL,   -- HH:mm
    end_time TEXT NOT NULL,     -- HH:mm
    planned_minutes INTEGER NOT NULL,
    actual_start_time TEXT,
    actual_end_time TEXT,
    actual_minutes INTEGER,
    booking_price INTEGER NOT NULL DEFAULT 0, -- integer piasters for standalone
    deposit_amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, in_progress, completed, cancelled, no_show
    cancel_reason TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 16. Reel Items
  `CREATE TABLE IF NOT EXISTS reel_items (
    id TEXT PRIMARY KEY,
    client_package_id TEXT NOT NULL,
    studio_booking_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available', -- available, planned, filmed, in_editing, review, delivered, cancelled
    due_date TEXT,
    delivered_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_package_id) REFERENCES client_packages(id)
  );`,

  // 17. Payments
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    amount INTEGER NOT NULL, -- integer piasters
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL, -- cash, vodafone_cash, bank, instapay
    receipt_attachment_path TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active, void
    void_reason TEXT,
    voided_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 18. Payment Allocations
  `CREATE TABLE IF NOT EXISTS payment_allocations (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    target_type TEXT NOT NULL, -- marketing_due, subscription_due, website_project, client_package, studio_booking, custom
    target_id TEXT NOT NULL,
    allocated_amount INTEGER NOT NULL, -- integer piasters
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES payments(id)
  );`,

  // 19. Client Credits (Unallocated Surplus)
  `CREATE TABLE IF NOT EXISTS client_credits (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    amount INTEGER NOT NULL, -- integer piasters
    source_payment_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 20. Expenses
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL, -- integer piasters
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL, -- salary, rent, studio, ads, software, equipment, transport, domains, other
    description TEXT,
    vendor TEXT,
    receipt_attachment_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 21. Activity & Audit Log
  `CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL, -- PAYMENT_VOIDED, BOOKING_CANCELLED, SESSION_COMPLETED, CLIENT_ARCHIVED, etc.
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 22. App Settings
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 23. Custom Field Definitions
  `CREATE TABLE IF NOT EXISTS client_custom_field_definitions (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 24. Custom Field Options
  `CREATE TABLE IF NOT EXISTS client_custom_field_options (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL,
    value_key TEXT NOT NULL,
    label TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (field_definition_id) REFERENCES client_custom_field_definitions(id) ON DELETE CASCADE,
    CONSTRAINT uq_client_field_option UNIQUE (field_definition_id, value_key)
  );`,

  // 25. Single-value Custom Field Values
  `CREATE TABLE IF NOT EXISTS client_custom_field_values (
    client_id TEXT NOT NULL,
    field_definition_id TEXT NOT NULL,
    text_value TEXT,
    number_value INTEGER,
    date_value TEXT,
    boolean_value INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (client_id, field_definition_id),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (field_definition_id) REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT
  );`,

  // 26. Multi-Select Child Relation
  `CREATE TABLE IF NOT EXISTS client_custom_field_multiselect_values (
    client_id TEXT NOT NULL,
    field_definition_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    PRIMARY KEY (client_id, field_definition_id, option_id),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (field_definition_id) REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT,
    FOREIGN KEY (option_id) REFERENCES client_custom_field_options(id) ON DELETE CASCADE
  );`,

  // 27. Filter Presets
  `CREATE TABLE IF NOT EXISTS client_filter_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rules_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 28. Plan Template Entitlements (M004)
  `CREATE TABLE IF NOT EXISTS plan_template_entitlements (
    id TEXT PRIMARY KEY,
    plan_template_id TEXT NOT NULL,
    entitlement_name TEXT NOT NULL,
    entitlement_key TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit TEXT NOT NULL,
    allow_overage INTEGER NOT NULL DEFAULT 0,
    rollover_allowed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 29. Sold Plans (M004)
  `CREATE TABLE IF NOT EXISTS sold_plans (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    plan_template_id TEXT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 30. Sold Plan Entitlements (M004)
  `CREATE TABLE IF NOT EXISTS sold_plan_entitlements (
    id TEXT PRIMARY KEY,
    sold_plan_id TEXT NOT NULL,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (sold_plan_id) REFERENCES sold_plans(id) ON DELETE CASCADE
  );`,

  // 31. Client Agreements (M004)
  `CREATE TABLE IF NOT EXISTS client_agreements (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    service_id TEXT,
    plan_template_id TEXT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );`,

  // 32. Workflow Stages (M004)
  `CREATE TABLE IF NOT EXISTS workflow_stages (
    id TEXT PRIMARY KEY,
    workflow_type TEXT NOT NULL,
    stage_key TEXT NOT NULL,
    label TEXT NOT NULL,
    color_class TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_protected INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workflow_type, stage_key)
  );`,

  // 33. App Custom Field Definitions (M004)
  `CREATE TABLE IF NOT EXISTS app_custom_field_definitions (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(entity_scope, field_key)
  );`,

  // 34. App Custom Field Options (M004)
  `CREATE TABLE IF NOT EXISTS app_custom_field_options (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL,
    value_key TEXT NOT NULL,
    label TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (field_definition_id) REFERENCES app_custom_field_definitions(id) ON DELETE CASCADE,
    UNIQUE(field_definition_id, value_key)
  );`,

  // 35. App Custom Field Values (M004)
  `CREATE TABLE IF NOT EXISTS app_custom_field_values (
    id TEXT PRIMARY KEY,
    entity_scope TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_definition_id TEXT NOT NULL,
    text_value TEXT,
    number_value INTEGER,
    date_value TEXT,
    boolean_value INTEGER,
    option_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (field_definition_id) REFERENCES app_custom_field_definitions(id) ON DELETE CASCADE,
    UNIQUE(entity_scope, entity_id, field_definition_id)
  );`,

  // 36. App Custom Field Multiselect Values (M004)
  `CREATE TABLE IF NOT EXISTS app_custom_field_multiselect_values (
    entity_scope TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_definition_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(entity_scope, entity_id, field_definition_id, option_id)
  );`,

  // 37. General Audit Logs (M004)
  `CREATE TABLE IF NOT EXISTS general_audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT,
    change_reason TEXT NOT NULL,
    old_values_json TEXT,
    new_values_json TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 38. Users Table (M005)
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER NOT NULL DEFAULT 1,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // 39. Backup Records Table (M005)
  `CREATE TABLE IF NOT EXISTS backup_records (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_path TEXT,
    file_size_bytes INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    failure_reason TEXT,
    storage_type TEXT NOT NULL DEFAULT 'local',
    gdrive_file_id TEXT,
    snapshot_metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`
];

/**
 * Runs the complete schema setup on the supplied database driver.
 */
export async function runTestMigrations(driver: IDatabaseDriver): Promise<void> {
  await driver.execute('PRAGMA foreign_keys = ON;');
  for (const ddl of SCHEMA_DDL) {
    await driver.execute(ddl);
  }
}
