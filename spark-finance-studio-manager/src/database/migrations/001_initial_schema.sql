-- ==============================================================================
-- Migration 001: Initial Schema
-- Spark Finance & Studio Manager
-- Total Tables: 22
-- Invariants: Integer Piasters ($1 EGP = 100 piasters), Integer Minutes
-- ==============================================================================

-- 1. clients
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL,                        -- Full client name (Arabic/English)
    company_name TEXT,                         -- Brand or company name
    phone TEXT,                                -- Primary contact phone number
    secondary_phone TEXT,                      -- Alternate phone or WhatsApp number
    notes TEXT,                                -- General operational notes
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Active, 0 = Inactive / Archived
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 2. service_definitions
CREATE TABLE IF NOT EXISTS service_definitions (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL UNIQUE,                 -- Service name (e.g., 'تسويق شهري', 'استوديو')
    billing_model TEXT NOT NULL,               -- 'monthly', 'project', 'hourly', 'package', 'custom'
    description TEXT,                          -- Operational description
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Available for new contracts, 0 = Retired
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 3. marketing_contracts
CREATE TABLE IF NOT EXISTS marketing_contracts (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    monthly_amount INTEGER NOT NULL,           -- Monthly retainer fee in integer piasters
    start_date TEXT NOT NULL,                  -- Start date (YYYY-MM-DD)
    end_date TEXT,                             -- Optional end date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'draft', 'active', 'paused', 'ended', 'cancelled'
    notes TEXT,                                -- Contract terms or deliverables summary
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 4. marketing_monthly_dues
CREATE TABLE IF NOT EXISTS marketing_monthly_dues (
    id TEXT PRIMARY KEY,                       -- UUID v4
    contract_id TEXT NOT NULL REFERENCES marketing_contracts(id) ON DELETE RESTRICT,
    year INTEGER NOT NULL,                     -- Billing year (e.g., 2026)
    month INTEGER NOT NULL,                    -- Billing month (1 - 12)
    base_amount INTEGER NOT NULL,              -- Base contract monthly amount (integer piasters)
    due_date TEXT NOT NULL,                    -- Target payment due date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'upcoming', 'due', 'partial', 'paid', 'overdue'
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    CONSTRAINT uq_marketing_due UNIQUE (contract_id, year, month)
);

-- 5. marketing_extras
CREATE TABLE IF NOT EXISTS marketing_extras (
    id TEXT PRIMARY KEY,                       -- UUID v4
    contract_id TEXT NOT NULL REFERENCES marketing_contracts(id) ON DELETE RESTRICT,
    due_id TEXT REFERENCES marketing_monthly_dues(id) ON DELETE CASCADE,
    description TEXT NOT NULL,                 -- Description of extra deliverable
    amount INTEGER NOT NULL,                   -- Additional cost in integer piasters
    date TEXT NOT NULL,                        -- Date incurred (YYYY-MM-DD)
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 6. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    service_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE RESTRICT,
    monthly_amount INTEGER NOT NULL,           -- Monthly fee in integer piasters
    start_date TEXT NOT NULL,                  -- Start date (YYYY-MM-DD)
    end_date TEXT,                             -- Optional termination date (YYYY-MM-DD)
    billing_day INTEGER NOT NULL DEFAULT 1,    -- Day of month dues are triggered (1 - 28)
    status TEXT NOT NULL,                      -- 'active', 'paused', 'ended', 'cancelled'
    notes TEXT,                                -- Subscription notes
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 7. subscription_monthly_dues
CREATE TABLE IF NOT EXISTS subscription_monthly_dues (
    id TEXT PRIMARY KEY,                       -- UUID v4
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    year INTEGER NOT NULL,                     -- Billing year (e.g., 2026)
    month INTEGER NOT NULL,                    -- Billing month (1 - 12)
    base_amount INTEGER NOT NULL,              -- Due amount in integer piasters
    due_date TEXT NOT NULL,                    -- Due date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'upcoming', 'due', 'partial', 'paid', 'overdue'
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    CONSTRAINT uq_sub_due UNIQUE (subscription_id, year, month)
);

-- 8. website_projects
CREATE TABLE IF NOT EXISTS website_projects (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,                        -- Website/Project title
    total_price INTEGER NOT NULL,              -- Total contract price in integer piasters
    start_date TEXT NOT NULL,                  -- Project kickoff date (YYYY-MM-DD)
    expected_delivery_date TEXT,               -- Target completion date (YYYY-MM-DD)
    next_payment_amount INTEGER,               -- Target next installment amount (integer piasters)
    next_payment_date TEXT,                    -- Target next installment date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'new', 'in_progress', 'waiting', 'completed', 'cancelled'
    notes TEXT,                                -- Technical scope or project links
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 9. package_templates
CREATE TABLE IF NOT EXISTS package_templates (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL UNIQUE,                 -- Template name (e.g., 'باقة كريتور 10 ساعات + 3 ريلز')
    default_price INTEGER NOT NULL,            -- Recommended selling price in integer piasters
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Available for sale, 0 = Retired
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 10. package_template_items
CREATE TABLE IF NOT EXISTS package_template_items (
    id TEXT PRIMARY KEY,                       -- UUID v4
    package_template_id TEXT NOT NULL REFERENCES package_templates(id) ON DELETE CASCADE,
    unit TEXT NOT NULL,                        -- 'hours' or 'reels'
    quantity INTEGER NOT NULL                  -- For hours: minutes (e.g. 600 for 10h); For reels: count (e.g. 3)
);

-- 11. client_packages
CREATE TABLE IF NOT EXISTS client_packages (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    package_template_id TEXT REFERENCES package_templates(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,               -- Captured package name at time of sale
    sold_price INTEGER NOT NULL,               -- Agreed selling price in integer piasters
    purchased_at TEXT NOT NULL,                -- Purchase date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'not_started', 'active', 'fully_used', 'cancelled'
    notes TEXT,                                -- Special discounts or custom agreements
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 12. client_package_items
CREATE TABLE IF NOT EXISTS client_package_items (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_package_id TEXT NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
    unit TEXT NOT NULL,                        -- 'hours' or 'reels'
    purchased_quantity INTEGER NOT NULL,       -- Total purchased (minutes for hours, count for reels)
    used_quantity INTEGER NOT NULL DEFAULT 0,  -- Total consumed (minutes or count)
    reserved_quantity INTEGER NOT NULL DEFAULT 0 -- Tentatively booked minutes for future bookings
);

-- 13. recurring_booking_rules
CREATE TABLE IF NOT EXISTS recurring_booking_rules (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    day_of_week INTEGER NOT NULL,              -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    start_time TEXT NOT NULL,                  -- Start time (HH:MM)
    end_time TEXT NOT NULL,                    -- End time (HH:MM)
    start_date TEXT NOT NULL,                  -- Recurrence start date (YYYY-MM-DD)
    end_date TEXT NOT NULL,                    -- Recurrence end date (YYYY-MM-DD)
    client_package_id TEXT REFERENCES client_packages(id) ON DELETE SET NULL,
    notes TEXT,                                -- Rule notes
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Active rule, 0 = Stopped
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 14. studio_bookings
CREATE TABLE IF NOT EXISTS studio_bookings (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,                        -- Session date (YYYY-MM-DD)
    planned_start TEXT NOT NULL,               -- Planned start time (HH:MM, 24h format)
    planned_end TEXT NOT NULL,                 -- Planned end time (HH:MM, 24h format)
    planned_minutes INTEGER NOT NULL,          -- Duration in integer minutes
    actual_start TEXT,                         -- Actual session start time (HH:MM)
    actual_end TEXT,                           -- Actual session end time (HH:MM)
    actual_minutes INTEGER,                    -- Actual session duration in integer minutes
    client_package_id TEXT REFERENCES client_packages(id) ON DELETE SET NULL,
    recurring_rule_id TEXT REFERENCES recurring_booking_rules(id) ON DELETE SET NULL,
    status TEXT NOT NULL,                      -- 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
    booking_price INTEGER,                     -- Standalone rental price if not on package (piasters)
    deposit_required INTEGER NOT NULL DEFAULT 0, -- 1 = Deposit requested, 0 = No deposit
    deposit_amount INTEGER,                    -- Deposit amount in integer piasters
    notes TEXT,                                -- Equipment or crew requirements
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 15. reel_items
CREATE TABLE IF NOT EXISTS reel_items (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    client_package_id TEXT REFERENCES client_packages(id) ON DELETE CASCADE,
    studio_booking_id TEXT REFERENCES studio_bookings(id) ON DELETE SET NULL,
    status TEXT NOT NULL,                      -- 'available', 'planned', 'filmed', 'completed', 'cancelled'
    title TEXT,                                -- Optional reel title / topic
    notes TEXT,                                -- Video editing or script notes
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 16. attachments
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,                       -- UUID v4
    entity_type TEXT NOT NULL,                 -- 'payment', 'expense', 'contract'
    entity_id TEXT NOT NULL,                   -- ID of the related entity
    file_name TEXT NOT NULL,                   -- Original filename
    file_path TEXT NOT NULL,                   -- Relative path inside attachments dir
    file_size INTEGER NOT NULL,                -- File size in bytes
    mime_type TEXT NOT NULL,                   -- MIME type (e.g., 'image/jpeg', 'application/pdf')
    sha256 TEXT NOT NULL,                      -- SHA-256 cryptographic checksum
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 17. payments
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    amount INTEGER NOT NULL,                   -- Total payment received in integer piasters
    method TEXT NOT NULL,                      -- 'cash', 'vodafone_cash', 'instapay', 'bank_transfer'
    date TEXT NOT NULL,                        -- Date of receipt (YYYY-MM-DD)
    note TEXT,                                 -- Payer reference or notes
    receipt_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',     -- 'active' or 'void'
    void_reason TEXT,                          -- Mandatory explanation when status is 'void'
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 18. payment_allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
    id TEXT PRIMARY KEY,                       -- UUID v4
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,                 -- 'marketing_due', 'subscription_due', 'website_project', 'client_package', 'studio_booking', 'custom'
    target_id TEXT NOT NULL,                   -- Foreign key ID of the target obligation record
    amount INTEGER NOT NULL,                   -- Allocated amount in integer piasters
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 19. expenses
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,                       -- UUID v4
    amount INTEGER NOT NULL,                   -- Amount spent in integer piasters
    date TEXT NOT NULL,                        -- Expense date (YYYY-MM-DD)
    category TEXT NOT NULL,                    -- 'salary', 'rent', 'studio', 'ads', 'software', 'equipment', 'transport', 'domains', 'other'
    description TEXT,                          -- Description (Mandatory if category == 'other')
    note TEXT,                                 -- Additional notes
    receipt_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 20. activity_log
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,                       -- UUID v4
    action TEXT NOT NULL,                      -- 'PAYMENT_CREATED', 'PAYMENT_VOIDED', 'BOOKING_CANCELLED', etc.
    entity_type TEXT NOT NULL,                 -- 'payment', 'booking', 'client', 'package', etc.
    entity_id TEXT NOT NULL,                   -- Related record ID
    timestamp TEXT NOT NULL,                   -- ISO-8601 UTC timestamp
    note TEXT,                                 -- Reason or description of change
    payload_json TEXT                          -- JSON snapshot of changed fields
);

-- 21. app_settings
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,                      -- Setting identifier (e.g., 'backup_retention_days')
    value_json TEXT NOT NULL,                  -- JSON stringified value
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- 22. schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,               -- Monotonically increasing migration version
    applied_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================

-- Studio Bookings
CREATE INDEX IF NOT EXISTS idx_studio_bookings_date ON studio_bookings(date, status);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_client ON studio_bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_package ON studio_bookings(client_package_id);

-- Payment Allocations
CREATE INDEX IF NOT EXISTS idx_allocations_target ON payment_allocations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Marketing & Subscription Dues
CREATE INDEX IF NOT EXISTS idx_marketing_dues_status ON marketing_monthly_dues(status, due_date);
CREATE INDEX IF NOT EXISTS idx_marketing_dues_contract ON marketing_monthly_dues(contract_id);
CREATE INDEX IF NOT EXISTS idx_subscription_dues_status ON subscription_monthly_dues(status, due_date);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Client Packages & Items
CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id, status);
CREATE INDEX IF NOT EXISTS idx_package_items_package ON client_package_items(client_package_id, unit);

-- Activity Log
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);

-- ==============================================================================
-- TRIGGERS (The second predicate prevents same-timestamp recursive updates.)
-- ==============================================================================

-- Trigger 1: clients
CREATE TRIGGER IF NOT EXISTS trg_clients_updated_at AFTER UPDATE ON clients
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE clients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 2: marketing_contracts
CREATE TRIGGER IF NOT EXISTS trg_marketing_contracts_updated_at AFTER UPDATE ON marketing_contracts
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE marketing_contracts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 3: subscriptions
CREATE TRIGGER IF NOT EXISTS trg_subscriptions_updated_at AFTER UPDATE ON subscriptions
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE subscriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 4: website_projects
CREATE TRIGGER IF NOT EXISTS trg_website_projects_updated_at AFTER UPDATE ON website_projects
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE website_projects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 5: client_packages
CREATE TRIGGER IF NOT EXISTS trg_client_packages_updated_at AFTER UPDATE ON client_packages
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE client_packages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 6: studio_bookings
CREATE TRIGGER IF NOT EXISTS trg_studio_bookings_updated_at AFTER UPDATE ON studio_bookings
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE studio_bookings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 7: reel_items
CREATE TRIGGER IF NOT EXISTS trg_reel_items_updated_at AFTER UPDATE ON reel_items
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE reel_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 8: marketing_monthly_dues
CREATE TRIGGER IF NOT EXISTS trg_marketing_monthly_dues_updated_at AFTER UPDATE ON marketing_monthly_dues
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE marketing_monthly_dues SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger 9: subscription_monthly_dues
CREATE TRIGGER IF NOT EXISTS trg_subscription_monthly_dues_updated_at AFTER UPDATE ON subscription_monthly_dues
FOR EACH ROW WHEN OLD.updated_at = NEW.updated_at
  AND NEW.updated_at <> strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
    UPDATE subscription_monthly_dues SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Hard delete prevention on payments
CREATE TRIGGER IF NOT EXISTS trg_prevent_payment_delete BEFORE DELETE ON payments
FOR EACH ROW BEGIN
    SELECT RAISE(FAIL, 'Direct physical deletion of payments is prohibited. Use payment voiding.');
END;
