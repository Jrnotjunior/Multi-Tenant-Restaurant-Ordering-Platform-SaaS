# Security foundations

- This repository is public. Never commit `.env.local`, secret keys, credentials, user data or production exports.
- Browser code may receive only a Supabase publishable key; never service-role or PayMongo secret keys.
- Authenticated users are **not** automatically authorized. Access must verify tenant + branch membership, role, current MFA level and applicable plan entitlements on the server.
- No authorization decisions based on client-controlled `user_metadata`; only trusted server-verified membership / `app_metadata` where appropriate.
- No exposed tenant-owned table before RLS policies, grants and cross-tenant negative tests are ready.
- Prefer invoker functions. Privileged definer functions need explicit authorization checks, fixed safe search paths and restricted execution grants.
- Validate all checkout prices and order transitions on the server. Payment success only on verified PayMongo webhooks. Never trust redirect URLs as payment proof.
- No privileged accounts may self-register; mandatory MFA is required before privileged data access.
- No destructive migration against an existing project without a verified backup, rollout strategy and explicit project selection.
