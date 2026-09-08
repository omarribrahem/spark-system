# Acceptance Traceability Matrix: Spark Finance & Studio Manager

```yaml
artifact_type: project-specific-traceability
status: approved
confidence: high
classification: medium-system
as_of: 2026-09-06
```

---

## 1. Overview & Verification Framework

This traceability matrix maps the complete functional specification from **PRD v1.0**, **PROJECT.md**, and **Architecture OS** across three dimensions:
1. **PRD §61 Acceptance Test Scenarios** (Tests 1 through 10)
2. **55 Core Functional Requirements** (F-001 through F-055)
3. **25 Edge Cases** (EC-001 through EC-025)

Every item defines its architectural module, pure domain calculator, target SQLite entity, automated test suite location, and verification criteria.

---

## 2. PRD §61 Acceptance Test Scenarios Traceability

| Test # | Acceptance Scenario Title | Core Business Invariant | Implementing Module & Pure Engine | Target SQLite Entities | Verifying Test File & Test Case |
|:------:|---------------------------|-------------------------|-----------------------------------|------------------------|---------------------------------|
| **Test 1** | **Package C Scenario (Hours + Reels)** | Financial balance ($0) and Service balance ($5.5\text{h} + 2\text{ reels}$) operate completely independently. | `src/modules/packages/`<br>`reconcilePackageConsumption` | `client_packages`<br>`client_package_items`<br>`reel_items` | `tests/e2e/package_c_lifecycle.test.ts`<br>`"verifies Package C independent depletion"` |
| **Test 2** | **Recurring Studio Generation** | Batch slot generation with preview conflict detection and skip capability. | `src/modules/studio/`<br>`generateRecurringSlots`<br>`checkStudioOverlap` | `recurring_booking_rules`<br>`studio_bookings` | `tests/e2e/recurring_studio.test.ts`<br>`"generates slots and skips conflicting dates"` |
| **Test 3** | **Extended Studio Session** | Consumption accounts for actual duration (minutes) rather than planned duration. | `src/modules/studio/`<br>`reconcilePackageConsumption` | `studio_bookings`<br>`client_package_items` | `tests/unit/domain/package_consumption.test.ts`<br>`"deducts actual minutes exceeding planned"` |
| **Test 4** | **Booking Cancellation & Credit Restore** | Cancelling a scheduled booking releases reserved minutes immediately back to available balance. | `src/modules/studio/`<br>`cancelBookingAndRestoreHours` | `studio_bookings`<br>`client_package_items` | `tests/integration/database/booking_cancellation.test.ts`<br>`"restores reserved minutes to active package"` |
| **Test 5** | **Marketing Partial Payment & Overdue** | Partial payment updates status to `partial`; overdue date leaves contract `active`. | `src/modules/contracts/`<br>`calculateDueStatus` | `marketing_contracts`<br>`marketing_monthly_dues` | `tests/e2e/marketing_dues_overdue.test.ts`<br>`"tracks partial due and maintains contract active"` |
| **Test 6** | **Multi-Target Payment Split** | Distributing single 10,000 EGP payment across Marketing, Studio, and Reels without over-allocation. | `src/modules/finance/`<br>`calculateAllocation` | `payments`<br>`payment_allocations`<br>`marketing_monthly_dues` | `tests/unit/domain/payment_splitter.test.ts`<br>`"distributes lump sum across multiple obligations"` |
| **Test 7** | **Surplus Payment to Client Credit** | Unallocated surplus automatically increments client credit balance. | `src/modules/finance/`<br>`calculateAllocation` | `payments`<br>`clients.credit_balance` | `tests/integration/database/client_credit.test.ts`<br>`"converts surplus payment to client credit"` |
| **Test 8** | **Studio Booking Double-Booking Block** | Synchronous hard block preventing overlapping time reservations. | `src/modules/studio/`<br>`checkStudioOverlap` | `studio_bookings` | `tests/unit/domain/studio_overlap.test.ts`<br>`"hard blocks overlapping proposed booking"` |
| **Test 9** | **Atomic Local Backup & Safe Restore** | Snapshot creation, manifest SHA-256 verification, and 100% data restoration with pre-restore safeguard. | `src/modules/backup/`<br>`TauriBackupManager` | `spark.db`<br>`attachments/`<br>`settings.json` | `tests/integration/backup/backup_restore.test.ts`<br>`"creates verified backup and executes safe restore"` |
| **Test 10**| **100% Offline Desktop Operation** | Complete functionality with zero network connection. | `src/database/driver/`<br>`TauriSqlDriver` | Local SQLite WAL | `tests/e2e/offline_capability.test.ts`<br>`"operates completely with network disabled"` |

---

## 3. 55 Core Features Inventory Matrix (F-001 to F-055)

| Feature ID | Feature Name | Milestone | Implementing Module | Primary Entities | Acceptance Criteria / Verifying Tests |
|:----------:|--------------|:---------:|---------------------|------------------|---------------------------------------|
| **F-001** | App Shell & Window Frame | M1 | `src/app/shell/` | Window host | Desktop window frame with min/max/close and Arabic title bar. |
| **F-002** | RTL Layout & Typography | M1 | `src/ui/layout/` | CSS / Theme | Native `dir="rtl"`, Cairo font, `<bdi>` bidirectional text isolation. |
| **F-003** | Sidebar Navigation | M1 | `src/ui/layout/Sidebar` | Nav items | Persistent 260px right sidebar, 8 main sections with active indicators. |
| **F-004** | Topbar & Quick Add | M1 | `src/ui/layout/Topbar` | Nav / Shortcuts | Global search button, live date, Quick Add (`+ إضافة سريع`) modal menu. |
| **F-005** | Toast & Notifications | M1 | `src/ui/feedback/Toast` | UI State | Non-blocking toasts (Success, Error, Info) auto-dismissing in 4s. |
| **F-006** | 4 Mandatory States | M1 | `src/ui/feedback/` | UI Components | Loading spinner, Skeleton placeholder, Empty with CTA, Actionable Error. |
| **F-007** | Client Registration & Filters | M3 | `src/modules/clients/` | `clients` | Client search, active/archived toggle, Egyptian phone number validation. |
| **F-008** | Client 360 Profile Hub | M3 | `src/modules/clients/` | `clients` + all | Single aggregated tabbed view of contracts, packages, bookings, ledger. |
| **F-009** | Client Soft-Delete Archival | M3 | `src/modules/clients/` | `clients.active` | Archive client without deleting financial history (`active = 0`). |
| **F-010** | Marketing Contract Lifecycle | M4 | `src/modules/contracts/`| `marketing_contracts` | Retainer agreement creation, tier, start/end dates, monthly amount. |
| **F-011** | Monthly Dues Generator | M4 | `src/modules/contracts/`| `marketing_monthly_dues` | Generates billable dues per active month, due date tracking. |
| **F-012** | Marketing Extras Billing | M4 | `src/modules/contracts/`| `marketing_extras` | One-off extra services attached to specific contract month. |
| **F-013** | Historical Price Locking | M4 | `src/modules/contracts/`| `marketing_contracts` | Past monthly dues remain immutable when contract price is modified. |
| **F-014** | Subscriptions Module | M4 | `src/modules/contracts/`| `subscriptions` | Recurring software/service licenses (e.g., 3arrab platform). |
| **F-015** | Website Projects | M4 | `src/modules/contracts/`| `website_projects` | Total contract price, start date, delivery date, milestone tracking. |
| **F-016** | Flexible Milestone Payments | M4 | `src/modules/contracts/`| `website_projects` | Setting next expected payment amount and target date. |
| **F-017** | Package Catalog Templates | M4 | `src/modules/packages/` | `package_templates` | Templates for hours only, reels only, or mixed (hours + reels). |
| **F-018** | Package Sold Snapshots | M4 | `src/modules/packages/` | `client_packages` | Immutable name, sold price, and bundled items at time of purchase. |
| **F-019** | Package Consumption Engine | M4 | `src/modules/packages/` | `client_package_items` | Pure minute deduction upon session completion, reel item completion. |
| **F-020** | Multi-Active Packages | M4 | `src/modules/packages/` | `client_packages` | Client owning multiple active packages; dropdown selection on booking. |
| **F-021** | Low Balance Alerts | M4 | `src/modules/packages/` | `client_package_items` | Warning badges when studio hours $\le 2\text{h}$ (120 min) or reels $\le 1$. |
| **F-022** | Day View Calendar | M5 | `src/modules/studio/` | `studio_bookings` | Hourly timeline grid showing sessions and open gaps. |
| **F-023** | Week View Calendar | M5 | `src/modules/studio/` | `studio_bookings` | Default operational view; visual collision-free layout. |
| **F-024** | Month View Calendar | M5 | `src/modules/studio/` | `studio_bookings` | High-level monthly overview with session count badges per day. |
| **F-025** | Single Studio Booking | M5 | `src/modules/studio/` | `studio_bookings` | Reservation entry with client, start/end time, package or rental rate. |
| **F-026** | Hard Conflict Overlap Blocking | M5 | `src/modules/studio/` | `studio_bookings` | Transactional block: $S_{\text{new}} < E_{\text{exist}} \land E_{\text{new}} > S_{\text{exist}}$. |
| **F-027** | Booking Cancellation | M5 | `src/modules/studio/` | `studio_bookings` | Releases reservation, restores reserved minutes to package. |
| **F-028** | Planned vs Actual Reconcile | M5 | `src/modules/studio/` | `studio_bookings` | Consumes actual session minutes; opens excess modal if balance exceeded. |
| **F-029** | Recurring Bookings Engine | M5 | `src/modules/studio/` | `recurring_booking_rules`| Generates repeat slots based on day-of-week and date range. |
| **F-030** | Recurrence Conflict Preview | M5 | `src/modules/studio/` | `recurring_booking_rules`| Visual preview of conflicting dates with "Skip Conflicting Date" button. |
| **F-031** | Reel Production Board | M4 | `src/modules/packages/` | `reel_items` | Pipeline tracking individual reels from planned to delivered. |
| **F-032** | Reel State Machine | M4 | `src/modules/packages/` | `reel_items.status` | States: `available`, `planned`, `filmed`, `completed`, `cancelled`. |
| **F-033** | Reel-Booking Linkage | M4 | `src/modules/packages/` | `reel_items` | Optional association linking reels to a specific studio shoot. |
| **F-034** | Payment Entry & Methods | M3 | `src/modules/finance/` | `payments` | Entry supporting Cash, Vodafone Cash, InstaPay, Bank Transfer. |
| **F-035** | Multi-Target Splitting | M3 | `src/modules/finance/` | `payment_allocations` | Distributing 1 payment across marketing dues, packages, websites. |
| **F-036** | Client Credit Engine | M3 | `src/modules/finance/` | `payments` | Unallocated payment surplus saved as reusable client credit. |
| **F-037** | Allocation Engine Math | M2 | `src/domain/calculators/`| N/A (Pure Math) | $\sum \text{allocations} \le \text{payment}$; integer piasters validation. |
| **F-038** | Payment Voiding & Reason | M3 | `src/modules/finance/` | `payments.status` | Soft void with mandatory reason prompt; rolls back allocations. |
| **F-039** | Payment Receipts Storage | M3 | `src/modules/finance/` | `attachments` | Copies receipt image/PDF to `%APPDATA%/SparkManager/attachments/`. |
| **F-040** | Categorized Expenses | M3 | `src/modules/finance/` | `expenses` | Expense tracking across 9 standard operational categories. |
| **F-041** | Expense "Other" Enforcement | M3 | `src/modules/finance/` | `expenses` | Form validation: Description strictly required if category is 'other'. |
| **F-042** | Expense Receipt Attachments | M3 | `src/modules/finance/` | `attachments` | Local attachment copying and viewing for expense invoices. |
| **F-043** | Safaa's Daily Dashboard | M6 | `src/modules/dashboard/`| Aggregated | Today's timeline, pending dues, overdue amounts, 7-day forecast. |
| **F-044** | Dashboard Action Center | M6 | `src/modules/dashboard/`| Aggregated | "Needs Attention" list: overdue marketing, low packages, urgent sessions. |
| **F-045** | Month Snapshot Widget | M6 | `src/modules/dashboard/`| Aggregated | Cash in, expenses out, net cash difference, total outstanding. |
| **F-046** | Monthly Cash Flow Report | M6 | `src/modules/reports/` | `payments`, `expenses` | Cash flow statement by month and year. |
| **F-047** | Revenue by Service Report | M6 | `src/modules/reports/` | `payment_allocations` | Revenue categorized by service based on actual allocations (NOT face value). |
| **F-048** | Outstanding Balances Report | M6 | `src/modules/reports/` | Dues & Projects | Aging receivables report highlighting overdue obligations. |
| **F-049** | Package Liabilities Report | M6 | `src/modules/reports/` | `client_package_items` | Total unused hours and reels Spark owes across all active clients. |
| **F-050** | Studio Utilization Report | M6 | `src/modules/reports/` | `studio_bookings` | Percentage of operating hours booked, planned vs actual variance. |
| **F-051** | Client Account Statement | M6 | `src/modules/reports/` | All client entities | Printable bilingual financial and service ledger for client handoff. |
| **F-052** | Global Instant Search | M6 | `src/ui/layout/Search` | Clients, Dues, Bookings| `Ctrl+K` modal searching clients, phones, contracts, and bookings in <50ms. |
| **F-053** | Atomic Local Backup Engine | M7 | `src/modules/backup/` | `spark.db` + files | `VACUUM INTO` + ZIP bundle + SHA-256 manifest + 30-day retention. |
| **F-054** | Safe Restore Engine | M7 | `src/modules/backup/` | Live data | Pre-restore safety backup, SHA-256 check, `PRAGMA integrity_check`. |
| **F-055** | Google Drive Mirror | M7 | `src/modules/backup/` | ZIP archives | Opt-in background upload with desktop OAuth tokens in Windows Keychain. |
| **F-056** | Extended Client Core Fields | M3+ | `src/modules/clients/` | `clients` | `client_type`, `whatsapp`, `email`, `city`, `preferred_contact`, contact role, phone sync. |
| **F-057** | Dynamic Custom Fields & Settings | M3+ | `src/modules/clients/` | `client_custom_field_*` | Normalized typed custom values (money, date, text, multiselect), settings management & rollback. |
| **F-058** | Typed Filter AST & Saved Presets | M3+ | `src/modules/clients/` | `client_filter_presets` | Typed AST SQLite query compiler, multi-rule chips, preset versioning, deactivation alerts. |

---

## 4. Edge Cases Coverage Matrix (EC-001 to EC-025)

| Edge Case ID | Scenario Description | Required Behavior | Verifying Test Suite |
|:------------:|----------------------|-------------------|----------------------|
| **EC-001** | Client pays before due date | Accepted; allocated to upcoming due or held as client credit. | `tests/unit/domain/payment_splitter.test.ts` |
| **EC-002** | Client pays less than due amount | Obligation status transitions to `partial`; remaining amount tracked. | `tests/unit/domain/due_calculator.test.ts` |
| **EC-003** | Client pays more than total dues | Dues settled in full; surplus converts to `unallocatedCreditPiasters`. | `tests/unit/domain/payment_splitter.test.ts` |
| **EC-004** | Studio booking runs longer than planned | Actual end time entered; actual minutes consumed from package balance. | `tests/unit/domain/package_consumption.test.ts` |
| **EC-005** | Studio booking ends earlier than planned | Only actual minutes deducted; unused reserved minutes released. | `tests/unit/domain/package_consumption.test.ts` |
| **EC-006** | Booking cancelled before session | Reserved minutes released; used minutes unaffected; package available hours restored. | `tests/integration/database/booking_cancellation.test.ts` |
| **EC-007** | Booking cancelled after completion | Consumed minutes restored to package; package status reverted to `active`. | `tests/integration/database/booking_cancellation.test.ts` |
| **EC-008** | Actual duration exceeds package balance | System blocks silent negative balance; displays resolution modal (Billable booking vs Outstanding charge). | `tests/e2e/actual_duration_excess.test.ts` |
| **EC-009** | Recurring rule hits conflict on 1 date | Conflict preview modal identifies conflicting date; user chooses "Skip conflict" or "Cancel". | `tests/e2e/recurring_studio.test.ts` |
| **EC-010** | Overlapping single booking attempted | Save is hard-blocked with Arabic message: `"يوجد حجز آخر في نفس الوقت"`. | `tests/unit/domain/studio_overlap.test.ts` |
| **EC-011** | Modifying 1 instance of recurring series | Modifies targeted booking without breaking remainder of recurring series. | `tests/integration/database/recurring_exception.test.ts` |
| **EC-012** | Package hours reach 0 but reels remain | Package status remains `active`. Transitions to `fully_used` only when ALL items are 0. | `tests/e2e/package_c_lifecycle.test.ts` |
| **EC-013** | Reel completed during booking | Increments `used_quantity` on reels; does NOT deduct studio hours. Hours deducted strictly by session duration. | `tests/e2e/package_c_lifecycle.test.ts` |
| **EC-014** | Multiple reels filmed in single session | Booking links to multiple reels; reels marked complete individually; hours consumed equal session duration. | `tests/unit/domain/package_consumption.test.ts` |
| **EC-015** | Client owns multiple active packages | Booking dropdown presents all active packages owned by client with available minutes; user selects source. | `tests/integration/database/client_packages.test.ts` |
| **EC-016** | Package template price/content modified | Previously purchased client packages retain their original snapshot name, price, and quotas. | `tests/integration/database/price_freeze.test.ts` |
| **EC-017** | Marketing payment becomes overdue | Contract remains `active` and service continues; due marked `overdue`; alert shown in Needs Attention. | `tests/e2e/marketing_dues_overdue.test.ts` |
| **EC-018** | Contract price modified mid-agreement | Past monthly dues remain immutable; new rate takes effect from specified future month. | `tests/integration/database/price_freeze.test.ts` |
| **EC-019** | Marketing contract reaches end date | Automatic due generation ceases; contract status transitions to `ended`. | `tests/unit/domain/due_calculator.test.ts` |
| **EC-020** | Allocation sum exceeds payment amount | Save hard-blocked with validation error: `"مجموع التخصيصات يتجاوز قيمة الدفعة"`. | `tests/unit/domain/payment_splitter.test.ts` |
| **EC-021** | Payment voided after allocations applied | Mandatory reason prompt; payment set to `void`; allocations rolled back; audit logged. | `tests/integration/database/payment_void.test.ts` |
| **EC-022** | Receipt file deleted from Windows Downloads | Application continues to display attachment because file was copied to `%APPDATA%/SparkManager/attachments/`. | `tests/integration/backup/attachment_storage.test.ts` |
| **EC-023** | Expense category selected as "Other" | Validation prevents submission if description field is empty. | `tests/unit/ui/expense_form.test.tsx` |
| **EC-024** | Database error occurs during save | Technical stack trace suppressed; friendly Arabic message displayed with retry CTA. | `tests/unit/ui/error_boundary.test.tsx` |
| **EC-025** | System restore requested by user | Mandatory confirmation warning $\rightarrow$ Pre-restore safety backup created $\rightarrow$ SHA-256 and `PRAGMA integrity_check` verified $\rightarrow$ Data restored. | `tests/integration/backup/backup_restore.test.ts` |
