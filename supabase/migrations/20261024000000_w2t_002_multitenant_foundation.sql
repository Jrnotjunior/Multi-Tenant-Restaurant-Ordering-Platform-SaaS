-- W2T-002 — Multi-tenant foundation.
-- All tenant records are private. Only trusted service-side provisioning may write these tables.
-- The browser receives SELECT access only after authenticated MFA and RLS checks.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 64),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 64),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branches_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT branches_tenant_slug_key UNIQUE (tenant_id, slug)
);

CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('restaurant_owner','kitchen','dispatcher','rider')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_tenant_user_key UNIQUE (tenant_id, user_id)
);

CREATE TABLE public.branch_memberships (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_memberships_pkey PRIMARY KEY (tenant_id, branch_id, user_id),
  CONSTRAINT branch_memberships_matching_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT branch_memberships_matching_user
    FOREIGN KEY (tenant_id, user_id) REFERENCES public.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  hostname text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('custom','managed')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','active','disabled')),
  challenge_token_sha256 text CHECK (challenge_token_sha256 IS NULL OR challenge_token_sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domain_canonical_hostname CHECK (
    hostname = lower(btrim(hostname))
    AND char_length(hostname) BETWEEN 4 AND 253
    AND hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  CONSTRAINT domain_verified_state CHECK (
    status NOT IN ('verified','active') OR verified_at IS NOT NULL
  ),
  CONSTRAINT domain_active_state CHECK (status <> 'active' OR activated_at IS NOT NULL)
);

CREATE INDEX tenant_memberships_user_lookup_idx ON public.tenant_memberships(user_id, tenant_id) WHERE status = 'active';
CREATE INDEX branch_memberships_user_lookup_idx ON public.branch_memberships(user_id, tenant_id, branch_id);
CREATE INDEX branches_tenant_active_idx ON public.branches(tenant_id, is_active);
CREATE INDEX tenant_domains_tenant_idx ON public.tenant_domains(tenant_id);

-- SECURITY DEFINER functions are private, use a fixed empty search_path,
-- expose only booleans, and resolve the requesting identity from the JWT.
CREATE FUNCTION private.privileged_session_verified()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND coalesce((SELECT auth.jwt())->>'aal','') = 'aal2';
$fn$;

CREATE FUNCTION private.is_active_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT private.privileged_session_verified() AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  );
$fn$;

CREATE FUNCTION private.is_active_owner(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT private.privileged_session_verified() AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'restaurant_owner'
      AND m.status = 'active'
  );
$fn$;

CREATE FUNCTION private.can_read_branch(p_tenant_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT private.is_active_owner(p_tenant_id)
     OR (
       private.is_active_member(p_tenant_id) AND EXISTS (
         SELECT 1 FROM public.branch_memberships AS bm
         WHERE bm.tenant_id = p_tenant_id
           AND bm.branch_id = p_branch_id
           AND bm.user_id = (SELECT auth.uid())
       )
     );
$fn$;

-- Default EXECUTE is granted to PUBLIC for new PostgreSQL functions.
REVOKE ALL ON FUNCTION private.privileged_session_verified() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_active_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_active_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_read_branch(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.privileged_session_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_branch(uuid, uuid) TO authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select_members ON public.tenants
  FOR SELECT TO authenticated USING (private.is_active_member(id));

CREATE POLICY branches_select_authorized ON public.branches
  FOR SELECT TO authenticated USING (private.can_read_branch(tenant_id, id));

CREATE POLICY memberships_select_self_or_owner ON public.tenant_memberships
  FOR SELECT TO authenticated USING (
    (user_id = (SELECT auth.uid()) AND private.is_active_member(tenant_id))
    OR private.is_active_owner(tenant_id)
  );

CREATE POLICY branch_memberships_select_self_or_owner ON public.branch_memberships
  FOR SELECT TO authenticated USING (
    (user_id = (SELECT auth.uid()) AND private.is_active_member(tenant_id))
    OR private.is_active_owner(tenant_id)
  );

CREATE POLICY domains_select_owner ON public.tenant_domains
  FOR SELECT TO authenticated USING (private.is_active_owner(tenant_id));

-- Explicitly revoke REST table writes, even if the platform previously
-- provided default public-schema privileges to anon/authenticated.
REVOKE ALL ON TABLE public.tenants, public.branches, public.tenant_memberships,
  public.branch_memberships, public.tenant_domains FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenants, public.branches, public.tenant_memberships,
  public.branch_memberships, public.tenant_domains TO authenticated;

COMMIT;
