# Web2Table — Restaurant Ordering Platform

Production-oriented, multi-tenant SaaS foundation for restaurant self-ordering in the Philippines.

> **Status:** W2T-001 foundation only. This commit is not a complete restaurant ordering service and is not ready to accept live orders, payments, or customer data.

## Approved scope

- Delivery-only ordering (guest and registered customers)
- Independent restaurant tenants, multiple branches, branded ordering websites and verified custom domains
- Restaurant operations: ordering, kitchen, dispatch, riders, real-time tracking
- PayMongo payments, inventory, recipes, loyalty, business reports and three subscription packages
- Invitation-only privileged accounts with MFA and strict tenant/branch isolation
- No official tax invoice issuance or statutory accounting functionality

## Local development

Requires Node.js 22+ and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

The `.env.local` file is optional for UI scaffolding. Without Supabase settings, the application displays a **not connected** state instead of pretending backend functionality exists.

Only put a Supabase *publishable* key in `VITE_` variables. **Never put database passwords, PayMongo secret keys, Supabase secret keys or service-role keys in frontend env files.**

```sh
npm run test
npm run typecheck
npm run build
```

The initial dependency set uses exact versions. A committed `package-lock.json` is required before production CI can switch to `npm ci`.

## Foundation routes

- `/` — platform entry point / project status
- `/order` — customer ordering shell (not active)
- `/restaurant` — restaurant workspace shell (not active)
- `/admin` — system administration shell (not active)

These are UI shells, **not authenticated dashboards**. Do not connect real data until server-side authorization and RLS have been verified.

## Architecture

- `src/app/` — routing and app composition
- `src/domain/` — pure tenancy and authorization helpers
- `src/lib/` — environment configuration and Supabase client factory
- `src/pages/` — UI shells
- `src/styles.css` — shared tokens and responsive styles
- `supabase/` — reserved for reviewed migrations
- `docs/` — architecture, security rules and development roadmap

See [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), and [Roadmap](docs/ROADMAP.md).

## GitHub repository scope

All development for this initiative takes place in this repository only. The existing, separate older Web2Table repositories are not imported or modified.

## Development rule

Each `NEXT` advances the smallest useful task justified by the roadmap, with explicit file changes, real test results, safety checks and the next task. Do not claim a feature or deployment works merely because a UI shell exists.
