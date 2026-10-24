-- W2T-017: secure tenant-scoped PayMongo merchant onboarding for Store Settings.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_paymongo_accounts (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('test','live')),
  paymongo_account_id text UNIQUE CHECK (paymongo_account_id IS NULL OR paymongo_account_id ~ '^org_[A-Za-z0-9]+$'),
  connection_status text NOT NULL DEFAULT 'not_connected'
    CHECK (connection_status IN ('not_connected','pending','linked','active','revoked','error')),
  invitation_id text UNIQUE,
  invitation_email text,
  activation_status text,
  webhook_id text UNIQUE,
  webhook_secret_id uuid,
  onboarding_method text NOT NULL DEFAULT 'create_account' CHECK (onboarding_method IN ('invite','create_account')),
  verification_url text,
  identity_verification_status text,
  onboarding_step text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, environment)
);

CREATE INDEX IF NOT EXISTS tenant_paymongo_accounts_status_idx
  ON public.tenant_paymongo_accounts(environment, connection_status);

ALTER TABLE public.tenant_paymongo_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_paymongo_accounts FROM PUBLIC, anon;
GRANT SELECT ON public.tenant_paymongo_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_paymongo_accounts TO service_role;
DROP POLICY IF EXISTS tenant_paymongo_accounts_owner_read ON public.tenant_paymongo_accounts;
CREATE POLICY tenant_paymongo_accounts_owner_read ON public.tenant_paymongo_accounts
FOR SELECT TO authenticated USING (private.is_active_owner(tenant_id));

CREATE TABLE IF NOT EXISTS public.tenant_paymongo_webhook_events (
  event_id text PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS tenant_paymongo_webhook_events_tenant_idx
  ON public.tenant_paymongo_webhook_events(tenant_id, environment, received_at DESC);
ALTER TABLE public.tenant_paymongo_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_paymongo_webhook_events FROM PUBLIC, anon;
GRANT SELECT ON public.tenant_paymongo_webhook_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_paymongo_webhook_events TO service_role;
DROP POLICY IF EXISTS tenant_paymongo_webhook_events_owner_read ON public.tenant_paymongo_webhook_events;
CREATE POLICY tenant_paymongo_webhook_events_owner_read ON public.tenant_paymongo_webhook_events
FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND private.is_active_owner(tenant_id));

CREATE OR REPLACE FUNCTION public.set_tenant_paymongo_webhook_secret(
  p_tenant_id uuid, p_secret text, p_environment text DEFAULT 'live'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_secret_id uuid;
  v_name text := 'tenant_paymongo_webhook_' || p_environment || '_' || p_tenant_id::text;
BEGIN
  IF p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'Invalid PayMongo environment'; END IF;
  IF p_secret IS NULL OR btrim(p_secret)='' THEN RAISE EXCEPTION 'Webhook secret is required'; END IF;
  SELECT webhook_secret_id INTO v_secret_id FROM public.tenant_paymongo_accounts
   WHERE tenant_id=p_tenant_id AND environment=p_environment FOR UPDATE;
  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secret,v_name,'PayMongo webhook signing secret for tenant '||p_tenant_id::text);
  ELSE
    PERFORM vault.update_secret(v_secret_id,p_secret);
  END IF;
  UPDATE public.tenant_paymongo_accounts SET webhook_secret_id=v_secret_id,updated_at=now()
   WHERE tenant_id=p_tenant_id AND environment=p_environment;
  RETURN v_secret_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_tenant_paymongo_webhook_secret(
  p_tenant_id uuid, p_environment text DEFAULT 'live'
) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds
  WHERE ds.id=(SELECT webhook_secret_id FROM public.tenant_paymongo_accounts
   WHERE tenant_id=p_tenant_id AND environment=p_environment) LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.set_tenant_paymongo_webhook_secret(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tenant_paymongo_webhook_secret(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_paymongo_webhook_secret(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_paymongo_webhook_secret(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_tenant_paymongo_webhook_event(
  p_event_id text, p_tenant_id uuid, p_environment text, p_event_type text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_claimed text;
BEGIN
  INSERT INTO public.tenant_paymongo_webhook_events(event_id,tenant_id,environment,event_type,status,attempts,received_at)
  VALUES (p_event_id,p_tenant_id,p_environment,p_event_type,'processing',1,now())
  ON CONFLICT(event_id) DO UPDATE SET
    tenant_id=EXCLUDED.tenant_id,
    environment=EXCLUDED.environment,
    event_type=EXCLUDED.event_type,
    status='processing',
    attempts=public.tenant_paymongo_webhook_events.attempts+1,
    last_error=NULL,
    received_at=now(),
    processed_at=NULL
  WHERE public.tenant_paymongo_webhook_events.status='failed'
     OR (public.tenant_paymongo_webhook_events.status='processing' AND public.tenant_paymongo_webhook_events.received_at < now()-interval '5 minutes')
  RETURNING event_id INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.claim_tenant_paymongo_webhook_event(text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tenant_paymongo_webhook_event(text,uuid,text,text) TO service_role;

COMMIT;
