# SOC 2 Security and Readiness Baseline

**Status: readiness work in progress — not a SOC 2 report or certification.** A control described here is not considered operational until implementation and evidence are reviewed by the control owner.

## Scope and system boundary

- Product: Web2Table multi-tenant restaurant ordering platform.
- In-scope components: web client, Supabase Auth/Postgres/Storage/Edge Functions, GitHub source control and CI, production hosting and PayMongo integration.
- Data: customer contact and order details, tenant/branch/menu data, authentication and authorization metadata, payment-provider references. Do not store card numbers or security codes.
- Start with Security (Common Criteria). Add Availability, Confidentiality, Processing Integrity, or Privacy only after a documented scope and commitments review.

## Required control register

| ID | Control objective | Minimum implementation / operating evidence | Owner / cadence |
| --- | --- | --- | --- |
| CC1 | Accountability | Assign control owners, approve security policies, document exceptions and risk acceptance. | Leadership / annually and on change |
| CC2 | Security awareness | Onboarding/offboarding checklist and annual security training evidence for personnel with access. | People + Security / annual |
| CC3 | Risk assessment | Maintain a risk register covering tenant isolation, account takeover, secrets, payment callbacks, data loss, vendors, and availability. Track owner, impact, mitigation, and due date. | Security / quarterly |
| CC4 | Monitoring controls | Review control operation, incidents, exceptions, and overdue remediation. Keep dated review records. | Security / monthly |
| CC5 | Access control | Least privilege; MFA for privileged accounts; separate production access; prompt offboarding; documented access approval and quarterly access review. | System owner / quarterly |
| CC6 | Logical access and changes | Enforce tenant/branch authorization server-side; RLS and restricted RPCs; peer review; protected main branch; CI checks; controlled migrations and rollback plans. | Engineering / every change |
| CC7 | Operations and incidents | Centralized, access-restricted logs; alerting for auth/payment/order anomalies; incident severity, escalation, containment, recovery, and notification runbooks; tabletop exercise. | Operations / continuous; exercise annually |
| CC8 | Change management | Link changes to reviewed commits; record test/build/deployment results; separate development and production; approve emergency changes retrospectively. | Engineering / every release |
| CC9 | Risk mitigation | Vendor inventory and due diligence for Supabase, hosting, GitHub, and PayMongo; review subprocessors, security terms, and relevant assurance reports. | Vendor owner / annually and on renewal |
| A1 | Availability (if in scope) | Defined SLO/RTO/RPO, monitored backups, restore tests, capacity and incident procedures. | Operations / quarterly restore test |
| C1 | Confidentiality (if in scope) | Data classification, minimal collection, encryption in transit/at rest through managed services, controlled exports, retention and deletion schedule. | Data owner / quarterly |
| PI1 | Processing integrity (if in scope) | Server-side price/modifier validation, idempotent order creation, verified payment webhooks, reconciliation and failure handling tests. | Engineering / every release |
| P1 | Privacy (if in scope) | Privacy notice, purpose/consent review where applicable, data subject request process, retention schedule, processor inventory and breach assessment. | Privacy owner / annually |

## Non-negotiable engineering safeguards

1. **Tenant isolation:** derive authority from authenticated server-side membership; never trust a tenant/branch ID supplied by a browser as proof of access. Add negative tests for cross-tenant and cross-branch reads/writes.
2. **Database:** enable RLS on tenant data; deny direct table access by default; expose narrow, validated RPCs; use a fixed search path in privileged functions; review grants after every migration.
3. **Authentication:** require MFA for privileged operations; enforce authorization on the server, not only in route guards; rate-limit public order and authentication endpoints.
4. **Secrets:** keep service-role keys, database credentials, and PayMongo secrets in approved server-side secret storage only. Never commit secrets or expose them in VITE_ variables. Rotate exposed credentials and document rotation evidence.
5. **Payments:** verify webhook signatures and event/account identity server-side; make handlers idempotent; do not treat redirect/query parameters as payment proof; reconcile provider status before marking an order paid.
6. **Auditability:** retain security-relevant actor, action, tenant, target, timestamp, outcome, and correlation ID without logging passwords, access tokens, full payment secrets, or unnecessary personal data. Restrict and monitor log access.
7. **Secure delivery:** run typecheck, tests, dependency/security scanning, secret scanning, and production build in CI. Protect main, require review/status checks where repository controls allow, and record production deployment approvals.
8. **Data lifecycle:** define collection purpose, retention, deletion, backup expiry, export controls, and a process for customer/tenant requests. Avoid collecting sensitive data that the product does not need.

## Evidence checklist

Store dated, access-restricted evidence in an approved compliance repository or GRC system, not in public source control if it contains sensitive operational details.

- [ ] Approved security, access control, change management, incident response, vendor risk, backup/restore, retention, and vulnerability management policies.
- [ ] System/data-flow diagram, asset inventory, data classification, vendor/subprocessor list, and documented scope.
- [ ] Risk assessment and risk-treatment plan with assigned owners.
- [ ] User access exports, approvals, MFA configuration evidence, quarterly access review, and offboarding samples.
- [ ] CI results, reviewed change samples, migration approvals, release/deployment logs, dependency/secret scan results.
- [ ] RLS/authorization test results including cross-tenant negative tests.
- [ ] Incident register, alert review records, tabletop results, and remediation evidence.
- [ ] Backup configuration, successful restore-test evidence, and recovery objectives.
- [ ] Vendor due diligence and applicable assurance reports.
- [ ] Retention/deletion test evidence and privacy request records, if applicable.
- [ ] Defined observation period and evidence collection plan agreed with an independent SOC 2 auditor.

## Exit criteria before claiming readiness

- Controls have named owners and are implemented, not merely documented.
- Evidence demonstrates consistent operation over the auditor-agreed observation period.
- Findings have owners, risk ratings, remediation dates, and closure evidence.
- Management approves scope, system description, and applicable Trust Services Criteria.
- An independent qualified auditor has completed the applicable engagement before any SOC 2 report or certification claim is made.

**Public product wording:** until independently assessed, say “security controls are being developed with SOC 2 readiness in mind.” Do not say “SOC 2 compliant,” “SOC 2 certified,” or imply an audit has occurred.
