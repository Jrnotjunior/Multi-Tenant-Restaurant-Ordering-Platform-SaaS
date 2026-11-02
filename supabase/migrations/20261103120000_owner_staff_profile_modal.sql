-- Keep editable employee details scoped to the restaurant membership.
BEGIN;

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS staff_first_name text,
  ADD COLUMN IF NOT EXISTS staff_last_name text,
  ADD COLUMN IF NOT EXISTS staff_phone text;

UPDATE public.tenant_memberships AS m
SET staff_first_name = COALESCE(
      NULLIF(BTRIM(m.staff_first_name), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'first_name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'preferred_name'), '')
    ),
    staff_last_name = COALESCE(
      NULLIF(BTRIM(m.staff_last_name), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'last_name'), '')
    ),
    staff_phone = COALESCE(
      NULLIF(BTRIM(m.staff_phone), ''),
      NULLIF(BTRIM(u.phone), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'phone'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'phone_number'), '')
    )
FROM auth.users AS u
WHERE u.id = m.user_id
  AND m.role IN ('cashier','kitchen','dispatcher','rider');

ALTER TABLE public.tenant_staff_audit_events
  DROP CONSTRAINT IF EXISTS tenant_staff_audit_events_event_type_check;
ALTER TABLE public.tenant_staff_audit_events
  ADD CONSTRAINT tenant_staff_audit_events_event_type_check
  CHECK (event_type IN ('access_updated','profile_updated','deactivated','reactivated','membership_removed'));

CREATE OR REPLACE FUNCTION public.list_tenant_staff(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501';
  END IF;
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Active restaurant owner access required' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'branches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'is_active',b.is_active) ORDER BY b.name)
      FROM public.branches b WHERE b.tenant_id=p_tenant_id
    ),'[]'::jsonb),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,
        'email',u.email,
        'first_name',COALESCE(NULLIF(BTRIM(m.staff_first_name),''),NULLIF(BTRIM(u.raw_user_meta_data->>'first_name'),''),NULLIF(BTRIM(u.raw_user_meta_data->>'preferred_name'),''),'Staff'),
        'last_name',COALESCE(NULLIF(BTRIM(m.staff_last_name),''),NULLIF(BTRIM(u.raw_user_meta_data->>'last_name'),''),''),
        'phone',COALESCE(NULLIF(BTRIM(m.staff_phone),''),NULLIF(BTRIM(u.phone),''),NULLIF(BTRIM(u.raw_user_meta_data->>'phone'),''),NULLIF(BTRIM(u.raw_user_meta_data->>'phone_number'),''),''),
        'display_name',COALESCE(
          NULLIF(BTRIM(CONCAT_WS(' ',
            COALESCE(NULLIF(BTRIM(m.staff_first_name),''),NULLIF(BTRIM(u.raw_user_meta_data->>'first_name'),''),NULLIF(BTRIM(u.raw_user_meta_data->>'preferred_name'),'')),
            COALESCE(NULLIF(BTRIM(m.staff_last_name),''),NULLIF(BTRIM(u.raw_user_meta_data->>'last_name'),''))
          )),''),
          NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'),''),
          NULLIF(BTRIM(u.raw_user_meta_data->>'name'),''),
          INITCAP(REPLACE(m.role,'_',' '))
        ),
        'role',m.role,
        'status',m.status,
        'branches',COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.name)
          FROM public.branch_memberships bm
          JOIN public.branches b ON b.id=bm.branch_id AND b.tenant_id=bm.tenant_id
          WHERE bm.tenant_id=m.tenant_id AND bm.user_id=m.user_id
        ),'[]'::jsonb)
      ) ORDER BY m.created_at DESC)
      FROM public.tenant_memberships m
      JOIN auth.users u ON u.id=m.user_id
      WHERE m.tenant_id=p_tenant_id AND m.role IN ('cashier','kitchen','dispatcher','rider')
    ),'[]'::jsonb),
    'invitations',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',i.id,'email',i.email,'role',i.role,'branch_id',i.branch_id,'branch_name',b.name,'status',i.status,
        'created_at',i.created_at,'sent_at',i.sent_at,'expires_at',i.expires_at
      ) ORDER BY i.created_at DESC)
      FROM public.privileged_invitations i
      LEFT JOIN public.branches b ON b.tenant_id=i.tenant_id AND b.id=i.branch_id
      WHERE i.tenant_id=p_tenant_id AND i.role IN ('cashier','kitchen','dispatcher','rider') AND i.status IN ('pending','sent')
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.track_customer_order(p_tracking_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
  v_items jsonb;
  v_refund_status text;
  v_payment_session_status text;
  v_assignment_status text;
  v_rider_name text;
  v_rider_phone text;
BEGIN
  IF p_tracking_token IS NULL THEN
    RAISE EXCEPTION 'Order tracking token is required' USING ERRCODE = '22023';
  END IF;
  SELECT order_row.* INTO v_order
  FROM public.customer_orders AS order_row
  WHERE order_row.idempotency_key = p_tracking_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT assignment.status,
    COALESCE(
      NULLIF(BTRIM(CONCAT_WS(' ',rider_staff.staff_first_name,rider_staff.staff_last_name)),''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'preferred_name'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'display_name'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'name'), ''),
      NULLIF(BTRIM(CONCAT_WS(' ',
        NULLIF(BTRIM(rider.raw_user_meta_data->>'first_name'), ''),
        NULLIF(BTRIM(rider.raw_user_meta_data->>'last_name'), '')
      )), ''),
      NULLIF(BTRIM(CONCAT_WS(' ',
        NULLIF(BTRIM(rider_invitation.first_name), ''),
        NULLIF(BTRIM(rider_invitation.last_name), '')
      )), ''),
      'Rider'
    ),
    COALESCE(
      NULLIF(BTRIM(rider_staff.staff_phone), ''),
      NULLIF(BTRIM(rider.phone), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'phone'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'phone_number'), '')
    )
  INTO v_assignment_status, v_rider_name, v_rider_phone
  FROM public.delivery_assignments AS assignment
  JOIN auth.users AS rider ON rider.id = assignment.rider_user_id
  LEFT JOIN public.tenant_memberships AS rider_staff
    ON rider_staff.tenant_id=assignment.tenant_id
    AND rider_staff.user_id=assignment.rider_user_id
    AND rider_staff.role='rider'
  LEFT JOIN LATERAL (
    SELECT invitation.first_name, invitation.last_name
    FROM public.privileged_invitations AS invitation
    WHERE invitation.tenant_id=assignment.tenant_id
      AND invitation.invited_user_id=assignment.rider_user_id
      AND invitation.role='rider'
      AND invitation.status='accepted'
    ORDER BY invitation.accepted_at DESC NULLS LAST,invitation.created_at DESC
    LIMIT 1
  ) AS rider_invitation ON true
  WHERE assignment.tenant_id=v_order.tenant_id AND assignment.order_id=v_order.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',order_item.item_name_snapshot,
    'quantity',order_item.quantity,
    'total_centavos',order_item.line_total_centavos,
    'unit_price_centavos',order_item.unit_price_centavos,
    'options',order_item.options_snapshot
  ) ORDER BY order_item.line_number),'[]'::jsonb)
  INTO v_items
  FROM public.customer_order_items AS order_item
  WHERE order_item.order_id=v_order.id AND order_item.tenant_id=v_order.tenant_id;

  SELECT payment_session.status INTO v_payment_session_status
  FROM public.customer_order_payment_sessions AS payment_session
  WHERE payment_session.tenant_id=v_order.tenant_id AND payment_session.order_id=v_order.id
  ORDER BY payment_session.paid_at DESC NULLS LAST,payment_session.created_at DESC
  LIMIT 1;

  v_refund_status := CASE
    WHEN v_order.payment_status='refunded' OR v_payment_session_status='refunded' THEN 'refunded'
    WHEN v_payment_session_status='refund_pending' THEN 'pending'
    WHEN v_order.order_status='cancelled' AND v_order.payment_method='online' AND v_order.payment_status='paid' THEN 'failed'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'found',true,'order_number',v_order.order_number,'order_status',v_order.order_status,
    'assignment_status',v_assignment_status,'rider_name',v_rider_name,'rider_phone',v_rider_phone,
    'payment_status',v_order.payment_status,'payment_method',v_order.payment_method,
    'refund_status',v_refund_status,'order_type',v_order.order_type,
    'created_at',v_order.created_at,'updated_at',v_order.updated_at,'items',v_items,
    'subtotal_centavos',v_order.subtotal_centavos,'delivery_fee_centavos',v_order.delivery_fee_centavos,
    'total_centavos',v_order.total_centavos
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.track_customer_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_customer_order(uuid) TO anon,authenticated,service_role;

DROP FUNCTION IF EXISTS public.owner_update_tenant_staff(uuid,uuid,text,uuid[]);

CREATE FUNCTION public.owner_update_tenant_staff(
  p_tenant_id uuid,
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_role text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.tenant_memberships%rowtype;
  v_first_name text := BTRIM(COALESCE(p_first_name,''));
  v_last_name text := BTRIM(COALESCE(p_last_name,''));
  v_phone text := NULLIF(BTRIM(COALESCE(p_phone,'')),'');
BEGIN
  IF v_actor IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner access required' USING ERRCODE='42501';
  END IF;
  IF v_first_name='' OR CHAR_LENGTH(v_first_name)>60 OR v_last_name='' OR CHAR_LENGTH(v_last_name)>60 THEN
    RAISE EXCEPTION 'Enter a valid first and last name' USING ERRCODE='22023';
  END IF;
  IF v_phone IS NOT NULL AND (CHAR_LENGTH(v_phone) NOT BETWEEN 7 AND 24 OR v_phone !~ '^[+0-9() .-]+$') THEN
    RAISE EXCEPTION 'Enter a valid phone number' USING ERRCODE='22023';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('cashier','kitchen','dispatcher','rider') THEN
    RAISE EXCEPTION 'Choose a valid staff role' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_member
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_user_id
    AND m.role IN ('cashier','kitchen','dispatcher','rider')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff account not found' USING ERRCODE='P0002'; END IF;

  UPDATE public.tenant_memberships
  SET staff_first_name=v_first_name,staff_last_name=v_last_name,staff_phone=v_phone,role=p_role
  WHERE tenant_id=p_tenant_id AND user_id=p_user_id;

  INSERT INTO public.tenant_staff_audit_events(tenant_id,target_user_id,actor_user_id,event_type,before_state,after_state)
  VALUES(p_tenant_id,p_user_id,v_actor,'profile_updated',
    jsonb_build_object('first_name',v_member.staff_first_name,'last_name',v_member.staff_last_name,'phone',v_member.staff_phone,'role',v_member.role),
    jsonb_build_object('first_name',v_first_name,'last_name',v_last_name,'phone',v_phone,'role',p_role));
  RETURN jsonb_build_object('success',true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.system_admin_list_deactivated_staff()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_staff jsonb;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Verified platform administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tenant_id',m.tenant_id,'tenant_name',t.name,'user_id',m.user_id,
    'email',u.email,
    'display_name',COALESCE(
      NULLIF(BTRIM(CONCAT_WS(' ',m.staff_first_name,m.staff_last_name)),''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'),''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'name'),''),
      u.email
    ),
    'phone',COALESCE(m.staff_phone,u.phone,u.raw_user_meta_data->>'phone',u.raw_user_meta_data->>'phone_number',''),
    'role',m.role,'disabled_at',m.disabled_at,
    'branches',COALESCE((
      SELECT jsonb_agg(b.name ORDER BY b.name)
      FROM public.branch_memberships bm
      JOIN public.branches b ON b.tenant_id=bm.tenant_id AND b.id=bm.branch_id
      WHERE bm.tenant_id=m.tenant_id AND bm.user_id=m.user_id
    ),'[]'::jsonb)
  ) ORDER BY m.disabled_at NULLS LAST,t.name,u.email),'[]'::jsonb)
  INTO v_staff
  FROM public.tenant_memberships m
  JOIN public.tenants t ON t.id=m.tenant_id
  JOIN auth.users u ON u.id=m.user_id
  WHERE m.role IN ('cashier','kitchen','dispatcher','rider') AND m.status='disabled';
  RETURN jsonb_build_object('staff',v_staff);
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_tenant_staff(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_staff(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_update_tenant_staff(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_tenant_staff(uuid,uuid,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.system_admin_list_deactivated_staff() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_list_deactivated_staff() TO authenticated;

COMMIT;
