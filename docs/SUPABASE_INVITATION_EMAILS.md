# Role-specific Supabase invitation emails

The invitation email body source of truth is `supabase/templates/invite.html`. It supports three recipient types:

- `system_admin`: invitation to join the Web2Table platform administration team.
- `restaurant_owner`: invitation to manage the named restaurant and finish Restaurant Owner onboarding.
- `restaurant_staff`: invitation to join the named restaurant as a named role, optionally including the assigned branch.

The staff invitation Edge Function and the privileged invitation Edge Function now attach the role, restaurant, branch, and account-setup metadata required by this template. The System Admin bootstrap invitation is intentionally a trusted operator/bootstrap operation; it must set `invitation_type=system_admin` in Auth user metadata and use the approved System Admin redirect. Do not expose a public endpoint that lets a caller grant or label their own account as a platform administrator.

## Activate in hosted Supabase Auth

Repository changes do **not** automatically update the hosted Auth email template. In the Web2Table Supabase project:

1. Open **Authentication → Email Templates → Invite user**.
2. Copy the complete contents of `supabase/templates/invite.html` into the template's HTML body.
3. Set the subject to this Go template:

```gotemplate
{{ if eq .Data.invitation_type "system_admin" }}You're Invited to Join Web2Table System Administration{{ else if eq .Data.invitation_type "restaurant_owner" }}You're Invited to Manage {{ .Data.restaurant_name }} on Web2Table{{ else if eq .Data.invitation_type "restaurant_staff" }}{{ .Data.restaurant_name }} Invited You to Join Its Team{{ else }}You're Invited to Join Web2Table{{ end }}
```

4. Save the template. Confirm the Auth redirect URL allowlist contains the approved callback URLs used by the System Admin and Restaurant Owner/staff apps. The template uses Supabase's `{{ .ConfirmationURL }}`, so the invitation sender's `redirectTo` determines where the invite returns after verification.
5. Send one test invitation per role and verify the recipient sees the correct subject, label, restaurant/branch context, and role-specific instructions. Follow each link end-to-end and verify the correct setup flow and required MFA.

## Current flow notes

- System Admin dashboard owner invitations now call `send-privileged-invitation` and send an email instead of only inserting a queued database record.
- Restaurant Owner invitations use the same trusted privileged invitation sender.
- Restaurant staff invitations use `restaurant-invite-staff`.
- The first System Admin bootstrap remains separate from routine owner/staff invitations and must continue to use the trusted bootstrap process.
- Do not report hosted template activation as complete until the template has been saved in Supabase Dashboard and test emails have been received.
