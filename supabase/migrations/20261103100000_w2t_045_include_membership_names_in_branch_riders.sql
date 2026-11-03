CREATE OR REPLACE FUNCTION public.list_branch_riders(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_role text;
  v_riders jsonb;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING errcode = '42501';
  END IF;

  SELECT m.role
    INTO v_role
    FROM public.tenant_memberships AS m
   WHERE m.tenant_id = p_tenant_id
     AND m.user_id = v_user
     AND m.status = 'active';

  IF v_role NOT IN ('restaurant_owner', 'dispatcher') OR v_role IS NULL THEN
    RAISE EXCEPTION 'Dispatcher access required' USING errcode = '42501';
  END IF;

  IF v_role <> 'restaurant_owner'
     AND NOT EXISTS (
       SELECT 1
         FROM public.branch_memberships AS bm
        WHERE bm.tenant_id = p_tenant_id
          AND bm.branch_id = p_branch_id
          AND bm.user_id = v_user
     ) THEN
    RAISE EXCEPTION 'You do not have access to this branch' USING errcode = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'display_name', COALESCE(
          NULLIF(BTRIM(CONCAT_WS(
            ' ',
            NULLIF(BTRIM(m.staff_first_name), ''),
            NULLIF(BTRIM(m.staff_last_name), '')
          )), ''),
          NULLIF(BTRIM(CONCAT_WS(
            ' ',
            NULLIF(BTRIM(u.raw_user_meta_data->>'first_name'), ''),
            NULLIF(BTRIM(u.raw_user_meta_data->>'last_name'), '')
          )), ''),
          NULLIF(BTRIM(CONCAT_WS(
            ' ',
            NULLIF(BTRIM(i.first_name), ''),
            NULLIF(BTRIM(i.last_name), '')
          )), '')
        )
      )
      ORDER BY COALESCE(
        NULLIF(BTRIM(CONCAT_WS(
          ' ',
          NULLIF(BTRIM(m.staff_first_name), ''),
          NULLIF(BTRIM(m.staff_last_name), '')
        )), ''),
        NULLIF(BTRIM(CONCAT_WS(
          ' ',
          NULLIF(BTRIM(u.raw_user_meta_data->>'first_name'), ''),
          NULLIF(BTRIM(u.raw_user_meta_data->>'last_name'), '')
        )), ''),
        NULLIF(BTRIM(CONCAT_WS(
          ' ',
          NULLIF(BTRIM(i.first_name), ''),
          NULLIF(BTRIM(i.last_name), '')
        )), ''),
        ''
      )
    ),
    '[]'::jsonb
  )
  INTO v_riders
  FROM public.tenant_memberships AS m
  JOIN public.branch_memberships AS bm
    ON bm.tenant_id = m.tenant_id
   AND bm.user_id = m.user_id
   AND bm.branch_id = p_branch_id
  JOIN auth.users AS u
    ON u.id = m.user_id
  LEFT JOIN public.privileged_invitations AS i
    ON i.invited_user_id = m.user_id
   AND i.tenant_id = m.tenant_id
   AND i.role = 'rider'
   AND i.status = 'accepted'
  WHERE m.tenant_id = p_tenant_id
    AND m.role = 'rider'
    AND m.status = 'active';

  RETURN v_riders;
END;
$function$;