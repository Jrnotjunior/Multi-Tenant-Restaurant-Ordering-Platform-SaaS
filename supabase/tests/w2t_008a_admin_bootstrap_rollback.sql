-- W2T-008A: run manually against the Web2Table Supabase project.
-- Synthetic Auth users and role assignments exist ONLY inside a rollback.
BEGIN;
DO $test$
DECLARE
 invited uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 unconfirmed uuid:=gen_random_uuid(); blocked boolean;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
 VALUES
 (invited,'authenticated','authenticated','w2t008a-test-approved@example.test',now(),now(),now()),
 (outsider,'authenticated','authenticated','w2t008a-test-outsider@example.test',now(),now(),now()),
 (unconfirmed,'authenticated','authenticated','w2t008a-test-unconfirmed@example.test',NULL,now(),now());
 INSERT INTO private.platform_admin_bootstrap_invites(email)
 VALUES('w2t008a-test-approved@example.test'),('w2t008a-test-unconfirmed@example.test');
 IF has_table_privilege('anon','private.platform_admin_bootstrap_invites','SELECT')
    OR has_table_privilege('authenticated','private.platform_admin_bootstrap_invites','SELECT')
    OR has_function_privilege('anon','public.claim_initial_admin_bootstrap()','EXECUTE')
 THEN RAISE EXCEPTION 'Bootstrap grants too permissive';END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider::text,'role','authenticated','aal','aal2')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.is_initial_admin_bootstrap_candidate() THEN RAISE EXCEPTION 'Outsider eligible';END IF;
 blocked:=false;
 BEGIN PERFORM public.claim_initial_admin_bootstrap();
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outsider activated';END IF;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claim.sub',unconfirmed::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',unconfirmed::text,'role','authenticated','aal','aal2')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.is_initial_admin_bootstrap_candidate() THEN RAISE EXCEPTION 'Unconfirmed eligible';END IF;
 blocked:=false;
 BEGIN PERFORM public.claim_initial_admin_bootstrap();
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unconfirmed activated';END IF;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claim.sub',invited::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',invited::text,'role','authenticated','aal','aal1')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT public.is_initial_admin_bootstrap_candidate() THEN RAISE EXCEPTION 'Valid candidate rejected';END IF;
 blocked:=false;
 BEGIN PERFORM public.claim_initial_admin_bootstrap();
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'AAL1 activated';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',invited::text,'role','authenticated','aal','aal2')::text,true);
 IF NOT public.claim_initial_admin_bootstrap() THEN RAISE EXCEPTION 'Valid AAL2 failed';END IF;
 IF public.is_initial_admin_bootstrap_candidate() THEN RAISE EXCEPTION 'Invite still eligible';END IF;
 blocked:=false;
 BEGIN PERFORM public.claim_initial_admin_bootstrap();
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Second claim activated';END IF;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=invited AND is_active) THEN
 RAISE EXCEPTION 'Admin row missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.platform_admin_bootstrap_invites WHERE claimed_user_id=invited AND claimed_at IS NOT NULL) THEN
 RAISE EXCEPTION 'Invite was not consumed';END IF;
END;
$test$;
ROLLBACK;
SELECT 'W2T-008A first-admin email + MFA bootstrap tests passed (no fixture retained)' result;
