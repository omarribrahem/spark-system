# Spark Finance & Studio Manager — E2E Test Suite

## Overview
This directory contains the canonical automated E2E test suite for **Spark Finance & Studio Manager**, covering the complete 55-feature inventory across four rigorous verification tiers.

## Architecture
- **Runner**: Vitest (ESM, TypeScript).
- **Driver**: Dual-driver abstraction (`IDatabaseDriver`). Headless test execution is powered by `InMemoryDatabaseDriver` / `WasmSqlDriver` (`sql.js`), enforcing full SQLite relational integrity, schema migrations, and transactions in memory.
- **Invariants**:
  - Currency: Integer Piasters ($1\text{ EGP} = 100\text{ piasters}$).
  - Time: Integer Minutes ($1.5\text{ hours} = 90\text{ minutes}$).
  - Decoupling: Financial balances and service unit balances operate independently.
  - Scheduling: Hard overlap conflict blocking ($S_{\text{new}} < E_{\text{exist}} \land E_{\text{new}} > S_{\text{exist}}$).

## Directory Structure
- `harness/`: Test database driver, 22-table schema DDL migrations runner, custom Vitest matchers (`toBePiasters`, `toBeMinutes`), and test context isolation.
- `fixtures/`: Deterministic test factories for clients, marketing contracts, sold packages, bookings, payments, and expenses.
- `tier1-features/`: Core requirement verification across all 55 features (F-001 to F-055, $\ge 5$ tests per feature).
- `tier2-boundaries/`: Extreme boundary and corner cases (piasters limits, minute boundaries, Arabic RTL string bounds, ACID rollback safety).
- `tier3-interactions/`: Pairwise cross-feature interactions (payment splits, package-reel bookings, cancellation restoration, cash flow sync).
- `tier4-scenarios/`: Real-world end-to-end operational scenarios (Canonical Package C, Safaa's daily routine, overlap blocking, cancellation refund, multi-target payment split, atomic backup & restore).

## How to Run
```bash
# Run all E2E tests
npm run test:e2e

# Run a specific tier
npx vitest run tests/e2e/tier1-features
npx vitest run tests/e2e/tier2-boundaries
npx vitest run tests/e2e/tier3-interactions
npx vitest run tests/e2e/tier4-scenarios

# Run individual scenario
npx vitest run tests/e2e/tier4-scenarios/scenario-package-c.spec.ts
```
