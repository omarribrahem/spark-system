# Spark UI Constitution Authority

## Purpose

The files in this directory are the local, reviewable copy of ATHREDU's UI constitution. AGY must read them before reviewing or changing any Spark interface code.

## Authority order

1. Spark product, financial integrity, data safety, offline-first architecture, and accepted ADRs.
2. `constitution/design_tokens.md` — exact ATHREDU token constitution and the visual source of truth.
3. `constitution/design_review_protocol.md` — exact ATHREDU interface acceptance gate.
4. `constitution/athr_design_constitution.md` — exact ATHREDU v5 interface rules where they do not conflict with items 1–3.
5. `docs/DESIGN_SYSTEM.md` — legacy Spark design evidence only; it does not override this constitution.
6. Existing UI code convenience.

The three ATHREDU constitution files are copied verbatim so their wording remains auditable. This file is the Spark applicability and conflict-resolution layer.

## Conflict decisions

- `design_tokens.md` and `design_review_protocol.md` are the newer specialized sources. Their explicit rejection of glassmorphism, decorative shadows, and bounce/pop animation overrides the older v5 text that requests glass and bounce.
- ATHREDU's header-first, no-sidebar navigation applies to Spark.
- ATHREDU education, authentication, Supabase, PWA update, document reader, AI, student, teacher, and commerce rules are out of scope unless Spark later adopts those capabilities explicitly.
- Spark remains Arabic RTL and offline-first desktop software using Tauri and SQLite. ATHREDU visual reuse must not introduce cloud ownership of core work.
- Spark uses its own product language, entities, workflows, brand name, financial states, and operational data.
- Existing Spark domain calculators, repositories, migrations, transactions, tests, backup contracts, and Tauri boundaries remain authoritative over presentation code.

## Required AGY workflow

1. Read this file and all three constitution files completely.
2. Read `docs/ARCHITECTURE.md`, applicable ADRs, and the feature code being changed.
3. Update `docs/ATHREDU_UX_ADAPTATION.md` with every screen and shared component in scope.
4. Review existing code before editing; identify Keep, Adapt, Rewrite, Delete, and Defer decisions.
5. Implement shared tokens and primitives before page-specific styling.
6. Apply the review protocol in its published order, mobile first, then desktop.
7. Record each rejection condition found and the file/change that resolves it.
8. Run `npm run typecheck`, `npm run lint`, `npm run test:all`, and `npm run build`.

## Completion gate

The UI migration is complete only when every Spark screen is mapped in `docs/ATHREDU_UX_ADAPTATION.md`, every applicable constitution rule passes, every automatic rejection condition is absent, all live workflows remain connected to SQLite, and all four verification commands pass. A visual resemblance by itself is not completion.

