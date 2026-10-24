# W2T-003 continuation — Browser-safe preview and invitation URL

## Public preview connection

GitHub Pages embeds the Web2Table project's public Supabase project URL and an active browser-safe publishable key at Vite build time. These are designed for browser exposure and do not bypass Row Level Security.

Never place the Supabase service-role key, secret key, database password, SMTP password or PayMongo keys in Vite variables. All tenant-owned data must still be guarded by RLS and server validation. A configured public client does not mean onboarding is enabled.

Preview: https://jrnotjunior.github.io/Multi-Tenant-Restaurant-Ordering-Platform-SaaS-/

## Supabase Auth configuration for invitations

In the Web2Table project's Authentication > URL Configuration, add the exact approved redirect URL:
https://jrnotjunior.github.io/Multi-Tenant-Restaurant-Ordering-Platform-SaaS-/restaurant

When deployed, the server-side APP_INVITE_REDIRECT_URL must match this full URL. Do not add unrestricted wildcard redirects.

Configure legitimate invitation SMTP, Auth rate limits, MFA policy and recovery procedures before real onboarding.

The source-only invitation Edge Function now supports repository-prefixed /restaurant URL paths. It remains NOT deployed because the Auth redirect allowlist, SMTP and trusted first-admin setup are not finished.

## Platform administrator bootstrap

No real user has been elevated. A designated, verified Auth user must be created via trusted administrative procedures and explicitly approved before being inserted into platform_admins. Browser claims or user_metadata must not confer admin access.

## Verification

- Confirm the public preview loads and no longer shows the offline-client notice.
- Confirm admin and restaurant content remain unavailable until authorization checks succeed.
- Confirm GitHub Pages and unit/typecheck CI after this change.
- Test real invitation email and MFA only after the redirect allowlist and email service are configured.

This is not a complete restaurant ordering service.
