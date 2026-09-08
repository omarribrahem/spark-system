# Data Model Specification: Spark Finance & Studio Manager

```yaml
artifact_type: project-specific-decision
status: approved
confidence: high
classification: medium-system
as_of: 2026-09-06
```

---

## 1. Executive Summary & Core Invariants

This document establishes the definitive physical and logical relational data schema for **Spark Finance & Studio Manager**. The schema is implemented on **SQLite 3** operating in WAL mode with foreign keys strictly enforced.

### 1.1 Non-Negotiable Invariants
1. **The Integer Piaster Currency Standard (BR-008, §56)**:
   - All monetary columns (`amount`, `monthly_amount`, `sold_price`, `total_price`, `deposit_amount`, etc.) are typed as `INTEGER NOT NULL`.
   - $1\text{ EGP} = 100\text{ piasters}$ (`قرش`).
   - Floating-point representations (`REAL`, `FLOAT`, `DOUBLE`, JS `number` decimals) are strictly prohibited for financial persistence.
2. **The Integer Minute Studio Time Standard (BR-009, §55)**:
   - All studio session durations (`planned_minutes`, `actual_minutes`, `purchased_quantity` for hours, etc.) are typed as `INTEGER NOT NULL`.
   - $1.0\text{ hour} = 60\text{ minutes}$, $1.5\text{ hours} = 90\text{ minutes}$, $4.5\text{ hours} = 270\text{ minutes}$.
   - Studio hour entitlements in packages are physically tracked in **minutes** to avoid fractional hour rounding drift.
3. **Decoupled Financial vs. Service Balances (BR-005)**:
   - Client financial debts (`marketing_monthly_dues`, `website_projects`, `client_packages`) are satisfied exclusively through `payment_allocations`.
   - Service entitlements (`client_package_items`, `reel_items`) are depleted exclusively through session completion (`studio_bookings`) or deliverable delivery.
4. **Historical Price & Snapshot Immutability (BR-006, BR-027)**:
   - When a package template or service definition changes, previously sold client packages retain their immutable `name_snapshot`, `sold_price`, and entitlement quotas in `client_packages` and `client_package_items`.
5. **No Hard Deletes / Audit Safety (BR-010, §40, §41)**:
   - Financial transactions and client records are never permanently hard-deleted (`DELETE FROM payments` is blocked).
   - Corrective actions utilize status changes (`payments.status = 'void'` with mandatory `void_reason`) and are recorded in `activity_log`.

---

## 2. Entity Relationship Diagram (Conceptual & Logical)

```text
┌────────────────────────┐
│   service_definitions  │
└───────────┬────────────┘
            │ 1:N
┌───────────▼────────────┐
│      subscriptions     │
└───────────┬────────────┘
            │ 1:N
┌───────────▼────────────┐
│subscription_monthly_due│
└────────────────────────┘

┌────────────────────────┐       1:N      ┌────────────────────────┐
│   package_templates    ├────────────────►  package_template_items│
└────────────────────────┘                └────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                             clients                              │
│   id, name, company_name, phone, secondary_phone, active...      │
└───┬────────────┬─────────────┬─────────────┬────────────────┬────┘
    │ 1:N        │ 1:N         │ 1:N         │ 1:N            │ 1:N
    ▼            ▼             ▼             ▼                ▼
┌─────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐
│marketing│ │website_ │ │client_      │ │studio_      │ │payments  │
│contracts│ │projects │ │packages     │ │bookings     │ └───┬──────┘
└───┬─────┘ └─────────┘ └───┬─────────┘ └───▲─────────┘     │ 1:N
    │ 1:N                   │ 1:N           │               ▼
    ▼                       ▼               │ (consumes)┌──────────┐
┌─────────┐             ┌─────────────┐     │           │payment_  │
│marketing│             │client_      ├─────┤           │allocat-  │
│_monthly_│             │package_items│     │           │ions      │
│dues     │             └─────────────┘     │           └────▲─────┘
└───┬─────┘                                 │                │
    │ 1:N               ┌─────────────┐     │                │ (allocates
    ▼                   │reel_items   ├─────┘                │  across dues,
┌─────────┐             └─────────────┘                      │  projects, &
│marketing│                                                  │  packages)
│_extras  │             ┌─────────────────────────────┐      │
└─────────┘             │   recurring_booking_rules   ├──────┘
                        └─────────────────────────────┘

CROSS-CUTTING / SYSTEM TABLES:
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│   expenses   │   │ attachments  │   │ activity_log │   │   app_settings   │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────────┘
┌──────────────────────┐
│  schema_migrations   │
└──────────────────────┘
```

---

## 3. Physical Schema Specification (All 27 Tables)

### Table 1: `clients`
Central client register. Represents businesses, creators, teachers, or individuals purchasing Spark services.
```sql
CREATE TABLE clients (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL,                        -- Full client name (Arabic/English)
    company_name TEXT,                         -- Brand or company name
    phone TEXT,                                -- Primary contact phone number
    secondary_phone TEXT,                      -- Alternate phone number
    notes TEXT,                                -- General operational notes
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Active, 0 = Inactive / Archived
    client_type TEXT DEFAULT 'individual',     -- 'teacher', 'company', 'creator', 'individual', 'educational_entity', 'other'
    contact_name TEXT,                         -- Contact person name
    contact_role TEXT,                         -- Contact person role/title
    whatsapp TEXT,                             -- WhatsApp phone number
    email TEXT,                                -- Validated email address
    city TEXT,                                 -- City or Governorate
    preferred_contact TEXT DEFAULT 'phone',    -- 'whatsapp', 'phone', 'email'
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 2: `service_definitions`
Dynamic catalog of service types offered by Spark (Marketing, Studio, Web, Subscriptions, Custom).
```sql
CREATE TABLE service_definitions (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL UNIQUE,                 -- Service name (e.g., 'تسويق شهري', 'استوديو')
    billing_model TEXT NOT NULL,               -- 'monthly', 'project', 'hourly', 'package', 'custom'
    description TEXT,                          -- Operational description
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Available for new contracts, 0 = Retired
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 3: `marketing_contracts`
Monthly retainer contracts for marketing and media management.
```sql
CREATE TABLE marketing_contracts (
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
```

### Table 4: `marketing_monthly_dues`
Monthly billable obligations generated for active marketing contracts.
```sql
CREATE TABLE marketing_monthly_dues (
    id TEXT PRIMARY KEY,                       -- UUID v4
    contract_id TEXT NOT NULL REFERENCES marketing_contracts(id) ON DELETE RESTRICT,
    year INTEGER NOT NULL,                     -- Billing year (e.g., 2026)
    month INTEGER NOT NULL,                    -- Billing month (1 - 12)
    base_amount INTEGER NOT NULL,              -- Base contract monthly amount (integer piasters)
    due_date TEXT NOT NULL,                    -- Target payment due date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'upcoming', 'due', 'partial', 'paid', 'overdue'
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    CONSTRAINT uq_marketing_due UNIQUE (contract_id, year, month)
);
```

### Table 5: `marketing_extras`
Ad-hoc one-off billable items linked to a specific marketing contract and month (e.g., extra reel, photoshoot).
```sql
CREATE TABLE marketing_extras (
    id TEXT PRIMARY KEY,                       -- UUID v4
    contract_id TEXT NOT NULL REFERENCES marketing_contracts(id) ON DELETE RESTRICT,
    due_id TEXT REFERENCES marketing_monthly_dues(id) ON DELETE CASCADE,
    description TEXT NOT NULL,                 -- Description of extra deliverable
    amount INTEGER NOT NULL,                   -- Additional cost in integer piasters
    date TEXT NOT NULL,                        -- Date incurred (YYYY-MM-DD)
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 6: `subscriptions`
Recurring non-marketing service subscriptions (e.g., 3arrab platform licenses, maintenance contracts).
```sql
CREATE TABLE subscriptions (
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
```

### Table 7: `subscription_monthly_dues`
Monthly billing cycles for subscriptions.
```sql
CREATE TABLE subscription_monthly_dues (
    id TEXT PRIMARY KEY,                       -- UUID v4
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    year INTEGER NOT NULL,                     -- Billing year (e.g., 2026)
    month INTEGER NOT NULL,                    -- Billing month (1 - 12)
    base_amount INTEGER NOT NULL,              -- Due amount in integer piasters
    due_date TEXT NOT NULL,                    -- Due date (YYYY-MM-DD)
    status TEXT NOT NULL,                      -- 'upcoming', 'due', 'partial', 'paid', 'overdue'
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    CONSTRAINT uq_sub_due UNIQUE (subscription_id, year, month)
);
```

### Table 8: `website_projects`
Fixed-price website design and development projects with flexible milestone billing.
```sql
CREATE TABLE website_projects (
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
```

### Table 9: `package_templates`
Catalog of reusable package blueprints (Hours only, Reels only, Mixed Package C).
```sql
CREATE TABLE package_templates (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL UNIQUE,                 -- Template name (e.g., 'باقة كريتور 10 ساعات + 3 ريلز')
    default_price INTEGER NOT NULL,            -- Recommended selling price in integer piasters
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Available for sale, 0 = Retired
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 10: `package_template_items`
Components bundled inside a package template.
```sql
CREATE TABLE package_template_items (
    id TEXT PRIMARY KEY,                       -- UUID v4
    package_template_id TEXT NOT NULL REFERENCES package_templates(id) ON DELETE CASCADE,
    unit TEXT NOT NULL,                        -- 'hours' or 'reels'
    quantity INTEGER NOT NULL                  -- For hours: minutes (e.g. 600 for 10h); For reels: count (e.g. 3)
);
```

### Table 11: `client_packages`
Immutable sold package instances owned by a client.
```sql
CREATE TABLE client_packages (
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
```

### Table 12: `client_package_items`
Entitlement ledger for a purchased package. Tracks minutes of studio time and reel counts independently.
```sql
CREATE TABLE client_package_items (
    id TEXT PRIMARY KEY,                       -- UUID v4
    client_package_id TEXT NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
    unit TEXT NOT NULL,                        -- 'hours' or 'reels'
    purchased_quantity INTEGER NOT NULL,       -- Total purchased (minutes for hours, count for reels)
    used_quantity INTEGER NOT NULL DEFAULT 0,  -- Total consumed (minutes or count)
    reserved_quantity INTEGER NOT NULL DEFAULT 0 -- Tentatively booked minutes for future bookings
);
```

### Table 13: `studio_bookings`
Single studio recording sessions.
```sql
CREATE TABLE studio_bookings (
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
```

### Table 14: `recurring_booking_rules`
Rules for generating repeating studio bookings (e.g., every Saturday 4-6 PM).
```sql
CREATE TABLE recurring_booking_rules (
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
```

### Table 15: `reel_items`
Discrete tracking of reels produced within a package or project.
```sql
CREATE TABLE reel_items (
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
```

### Table 16: `payments`
Financial inflow transactions.
```sql
CREATE TABLE payments (
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
```

### Table 17: `payment_allocations`
Granular distribution of payments across specific target obligations.
```sql
CREATE TABLE payment_allocations (
    id TEXT PRIMARY KEY,                       -- UUID v4
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,                 -- 'marketing_due', 'subscription_due', 'website_project', 'client_package', 'studio_booking', 'custom'
    target_id TEXT NOT NULL,                   -- Foreign key ID of the target obligation record
    amount INTEGER NOT NULL,                   -- Allocated amount in integer piasters
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 18: `expenses`
Operational outflows and company business expenses.
```sql
CREATE TABLE expenses (
    id TEXT PRIMARY KEY,                       -- UUID v4
    amount INTEGER NOT NULL,                   -- Amount spent in integer piasters
    date TEXT NOT NULL,                        -- Expense date (YYYY-MM-DD)
    category TEXT NOT NULL,                    -- 'salary', 'rent', 'studio', 'ads', 'software', 'equipment', 'transport', 'domains', 'other'
    description TEXT,                          -- Description (Mandatory if category == 'other')
    note TEXT,                                 -- Additional notes
    receipt_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 19: `attachments`
Audit index for locally stored receipts, contracts, and invoices.
```sql
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,                       -- UUID v4
    entity_type TEXT NOT NULL,                 -- 'payment', 'expense', 'contract'
    entity_id TEXT NOT NULL,                   -- ID of the related entity
    file_name TEXT NOT NULL,                   -- Original filename
    file_path TEXT NOT NULL,                   -- Relative path inside %APPDATA%/SparkManager/attachments/
    file_size INTEGER NOT NULL,                -- File size in bytes
    mime_type TEXT NOT NULL,                   -- MIME type (e.g., 'image/jpeg', 'application/pdf')
    sha256 TEXT NOT NULL,                      -- SHA-256 cryptographic checksum
    created_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 20: `activity_log`
Immutable system audit trail tracking critical business modifications and human actions.
```sql
CREATE TABLE activity_log (
    id TEXT PRIMARY KEY,                       -- UUID v4
    action TEXT NOT NULL,                      -- 'PAYMENT_CREATED', 'PAYMENT_VOIDED', 'BOOKING_CANCELLED', 'HOURS_RESTORED', 'CONTRACT_PAUSED', etc.
    entity_type TEXT NOT NULL,                 -- 'payment', 'booking', 'client', 'package', etc.
    entity_id TEXT NOT NULL,                   -- Related record ID
    timestamp TEXT NOT NULL,                   -- ISO-8601 UTC timestamp
    note TEXT,                                 -- Reason or description of change
    payload_json TEXT                          -- JSON snapshot of changed fields
);
```

### Table 21: `app_settings`
Persistent application preferences and integration configuration.
```sql
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,                      -- Setting identifier (e.g., 'backup_retention_days')
    value_json TEXT NOT NULL,                  -- JSON stringified value
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 22: `schema_migrations`
Version tracking for automated database migration execution.
```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,               -- Monotonically increasing migration version
    applied_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 23: `client_custom_field_definitions`
Schema definitions for dynamic custom fields added by administrators.
```sql
CREATE TABLE client_custom_field_definitions (
    id TEXT PRIMARY KEY,                       -- UUID v4
    field_key TEXT NOT NULL UNIQUE,            -- Unique immutable snake_case key
    label TEXT NOT NULL,                       -- Arabic/English display label
    field_type TEXT NOT NULL,                  -- 'short_text', 'long_text', 'integer', 'money_piasters', 'date', 'phone', 'email', 'url', 'boolean', 'single_select', 'multi_select'
    section TEXT NOT NULL DEFAULT 'general',   -- Logical group in UI
    help_text TEXT,                            -- Operator guidance
    required INTEGER NOT NULL DEFAULT 0,       -- 1 = Mandatory, 0 = Optional
    searchable INTEGER NOT NULL DEFAULT 0,     -- 1 = Indexed in global/list search
    filterable INTEGER NOT NULL DEFAULT 1,     -- 1 = Available in Filter Builder
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Active, 0 = Deactivated (preserves historical data)
    sort_order INTEGER NOT NULL DEFAULT 0,     -- Form display ordering
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

### Table 24: `client_custom_field_options`
Predefined selectable options for `single_select` and `multi_select` custom fields.
```sql
CREATE TABLE client_custom_field_options (
    id TEXT PRIMARY KEY,                       -- UUID v4
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE CASCADE,
    value_key TEXT NOT NULL,                   -- Stable key within field
    label TEXT NOT NULL,                       -- Display label in Arabic
    active INTEGER NOT NULL DEFAULT 1,         -- 1 = Active, 0 = Deactivated
    sort_order INTEGER NOT NULL DEFAULT 0,     -- Dropdown ordering
    CONSTRAINT uq_client_field_option UNIQUE (field_definition_id, value_key)
);
```

### Table 25: `client_custom_field_values`
Normalized typed values for single-value custom fields per client.
```sql
CREATE TABLE client_custom_field_values (
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
```

### Table 26: `client_custom_field_multiselect_values`
Normalized junction table for multi-select custom field values per client.
```sql
CREATE TABLE client_custom_field_multiselect_values (
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field_definition_id TEXT NOT NULL REFERENCES client_custom_field_definitions(id) ON DELETE RESTRICT,
    option_id TEXT NOT NULL REFERENCES client_custom_field_options(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, field_definition_id, option_id)
);
```

### Table 27: `client_filter_presets`
Saved user filter criteria configurations (Filter AST presets).
```sql
CREATE TABLE client_filter_presets (
    id TEXT PRIMARY KEY,                       -- UUID v4
    name TEXT NOT NULL,                        -- Human-readable preset name
    rules_json TEXT NOT NULL,                  -- Serialized Filter AST rules JSON
    schema_version INTEGER NOT NULL DEFAULT 1, -- Version for migration compatibility
    sort_order INTEGER NOT NULL DEFAULT 0,     -- UI list ordering
    created_at TEXT NOT NULL,                  -- ISO-8601 UTC timestamp
    updated_at TEXT NOT NULL                   -- ISO-8601 UTC timestamp
);
```

---

## 4. Triggers Specification

Automatic timestamp maintenance triggers for all mutable entities:

```sql
-- Trigger for clients
CREATE TRIGGER trg_clients_updated_at AFTER UPDATE ON clients
FOR EACH ROW BEGIN
    UPDATE clients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger for marketing_contracts
CREATE TRIGGER trg_marketing_contracts_updated_at AFTER UPDATE ON marketing_contracts
FOR EACH ROW BEGIN
    UPDATE marketing_contracts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger for subscriptions
CREATE TRIGGER trg_subscriptions_updated_at AFTER UPDATE ON subscriptions
FOR EACH ROW BEGIN
    UPDATE subscriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger for website_projects
CREATE TRIGGER trg_website_projects_updated_at AFTER UPDATE ON website_projects
FOR EACH ROW BEGIN
    UPDATE website_projects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger for client_packages
CREATE TRIGGER trg_client_packages_updated_at AFTER UPDATE ON client_packages
FOR EACH ROW BEGIN
    UPDATE client_packages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger for studio_bookings
CREATE TRIGGER trg_studio_bookings_updated_at AFTER UPDATE ON studio_bookings
FOR EACH ROW BEGIN
    UPDATE studio_bookings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Trigger for reel_items
CREATE TRIGGER trg_reel_items_updated_at AFTER UPDATE ON reel_items
FOR EACH ROW BEGIN
    UPDATE reel_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;

-- Audit Trigger: Prevent physical hard delete of payments
CREATE TRIGGER trg_prevent_payment_delete BEFORE DELETE ON payments
FOR EACH ROW BEGIN
    SELECT RAISE(FAIL, 'Direct physical deletion of payments is prohibited. Use payment voiding.');
END;
```

---

## 5. Indexes Specification

To guarantee sub-50ms query response times across Safaa's dashboard and reporting screens, explicit indexes are created on high-cardinality foreign keys and date-filtering columns:

```sql
-- Studio Bookings: Crucial for calendar queries and overlap detection
CREATE INDEX idx_studio_bookings_date ON studio_bookings(date, status);
CREATE INDEX idx_studio_bookings_client ON studio_bookings(client_id);
CREATE INDEX idx_studio_bookings_package ON studio_bookings(client_package_id);

-- Payment Allocations: Rapid target obligation balance calculation
CREATE INDEX idx_allocations_target ON payment_allocations(target_type, target_id);
CREATE INDEX idx_allocations_payment ON payment_allocations(payment_id);

-- Payments: Client ledger and date ranges
CREATE INDEX idx_payments_client ON payments(client_id, date);
CREATE INDEX idx_payments_status ON payments(status);

-- Marketing & Subscription Dues: Dashboard overdue and pending aggregation
CREATE INDEX idx_marketing_dues_status ON marketing_monthly_dues(status, due_date);
CREATE INDEX idx_marketing_dues_contract ON marketing_monthly_dues(contract_id);
CREATE INDEX idx_subscription_dues_status ON subscription_monthly_dues(status, due_date);

-- Expenses: Cash flow reports by date and category
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- Client Packages & Items: Quick balance lookup
CREATE INDEX idx_client_packages_client ON client_packages(client_id, status);
CREATE INDEX idx_package_items_package ON client_package_items(client_package_id, unit);

-- Activity Log: Chronological audit filtering
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp DESC);
```

---

## 6. Soft-Delete & Voiding Strategy

| Entity | Strategy | Implementation | Recovery / Audit Trail |
|--------|----------|----------------|------------------------|
| **`payments`** | **Voiding with Mandatory Reason** | `status = 'void'`, `void_reason = ?`. Physical deletion strictly blocked by trigger `trg_prevent_payment_delete`. | Allocations are rolled back, restoring target due balances. Logged to `activity_log`. |
| **`clients`** | **Archival Soft-Delete** | `active = 0`. Archived clients hidden from Quick Add and primary dropdowns, but visible in reports and historical ledgers. | Can be reactivated (`active = 1`) at any time without data loss. |
| **`marketing_contracts`** | **Status Transition** | `status = 'ended'` or `'cancelled'`. Stops monthly due generation. | Existing historical dues and payments remain untouched. |
| **`studio_bookings`** | **Cancellation** | `status = 'cancelled'`. Excluded from overlap checks. | Automatically restores reserved or used hours to active client package. |
| **`package_templates`** | **Deactivation** | `active = 0`. Excluded from future sales dropdowns. | Existing sold client packages (`client_packages`) retain their immutable snapshot. |
