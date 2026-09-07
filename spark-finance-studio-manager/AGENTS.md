# Spark Finance & Studio Manager agent rules

## Required authority

For any UI, UX, layout, component, responsive, motion, accessibility, or design review task, read `constitution/README.md` and every Markdown file in `constitution/` before changing code. These documents contain the local ATHREDU constitution adopted by Spark.

For domain, finance, SQLite, Tauri, backup, or integration work, read `docs/ARCHITECTURE.md` and the applicable ADR first. Financial and service integrity outrank presentation convenience.

## Working boundary

Reuse ATHREDU's design language and interaction system while keeping Spark's domain, data, Arabic RTL language, offline-first runtime, and business workflows. UI replacement does not authorize changes to migrations, repositories, calculators, backup/restore behavior, secrets, or external services.

## Verification

Before declaring work complete, run `npm run typecheck`, `npm run lint`, `npm run test:all`, and `npm run build`. Report failures honestly; existing failures are work remaining, not accepted completion.

