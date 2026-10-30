# Web2Table — Restaurant Ordering Platform

Production-oriented, multi-tenant SaaS foundation for restaurant self-ordering in the Philippines.

> **Status:** Mobile-first storefront preview, tenant/branch/menu foundation, owner menu management, and a rollback-tested server-side order-request API (W2T-007A). Customer checkout remains preparation-only: order intake defaults off until restaurant order operations are ready. No live payments are enabled.

## Approved scope

- Delivery, take-out, pickup, and dine-in order types (checkout/payment rollout remains in progress)
- Independent restaurant tenants, multiple branches, branded ordering websites and verified custom domains
- Restaurant operations: ordering, kitchen, dispatch, riders, real-time tracking
- PayMongo payments, inventory, recipes, loyalty, business reports and three subscription packages
- Invitation-only privileged accounts with MFA and strict tenant/branch isolation
- No official tax invoice issuance or statutory accounting functionality

## Typography

Web2Table's only approved brand fonts are **Inter** (interface and body text) and **Manrope** (headings and prominent wordmarks). See [Typography standard](docs/TYPOGRAPHY.md).

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

- `/` — customer-facing sample restaurant menu, optimized for mobile screens
- `/order` — same public sample menu (no account required for browsing)
- `/order/baryo-kitchen` — direct restaurant menu URL for search results and shared links
- `/restaurant` — MFA-protected, role-aware Restaurant Owner, Cashier, Kitchen, Dispatcher or Rider workspace. The owner can open existing menu/branding management; operational queues remain empty until order operations are implemented.
- `/admin` — protected platform administration workspace (not live)

The storefront is an interactive **preview** using fictional restaurant details, sample prices and emoji artwork. Menu search, categories, quantities and basket work locally; **checkout is disabled**. Privileged workspaces require Supabase Auth, MFA and database permissions. See [Mobile-first storefront](docs/MOBILE_FIRST_STOREFRONT.md).

## Architecture

- `src/app/` — routing and app composition
- `src/domain/` — pure tenancy and authorization helpers
- `src/lib/` — environment configuration and Supabase client factory
- `src/pages/` — UI shells
- `src/styles.css` — shared tokens and responsive styles
- `supabase/` — reserved for reviewed migrations
- `docs/` — architecture, security rules and development roadmap

See [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [POS Integration Contract](docs/POS_INTEGRATION_CONTRACT.md), [SOC 2 Security and Readiness Baseline](docs/SOC2_READINESS.md), and [Roadmap](docs/ROADMAP.md).

## GitHub repository scope

All development for this initiative takes place in this repository only. The existing, separate older Web2Table repositories are not imported or modified.

## Development rule

Each `NEXT` advances the smallest useful task justified by the roadmap, with explicit file changes, real test results, safety checks and the next task. Do not claim a feature or deployment works merely because a UI shell exists.
