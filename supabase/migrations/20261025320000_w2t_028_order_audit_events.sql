-- W2T-028: append-only, PII-minimized audit trail for order lifecycle and totals.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_order_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  actor_user_id uuid,
  actor_source text NOT NULL CHECK (actor_source IN ('user','guest','system')),
  event_type text NOT NULL CHECK (event_type IN (
    'order_created','status_changed','delivery_fee_changed','payment_status_changed','total_changed'
  )),
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(old_values)='object'),
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(new_values)='object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_order_audit_events_order_fk
    FOREIGN KEY (tenant_id,order_id)
    REFERENCES public.customer_orders(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS customer_order_audit_events_tenant_order_idx
  ON public.customer_order_audit_events(tenant_id,order_id,occurred_at DESC);

ALTER TABLE public.customer_order_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_order_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_order_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.customer_order_audit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION private.audit_customer_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'order_created';
    v_new := jsonb_build_object(
      'order_type',NEW.order_type,
      'order_status',NEW.order_status,
      'payment_status',NEW.payment_status,
      'subtotal_centavos',NEW.subtotal_centavos,
      'delivery_fee_centavos',NEW.delivery_fee_centavos,
      'total_centavos',NEW.total_centavos
    );
  ELSE
    IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
      v_event := 'status_changed';
      v_old := jsonb_build_object('order_status',OLD.order_status);
      v_new := jsonb_build_object('order_status',NEW.order_status);
    ELSIF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      v_event := 'payment_status_changed';
      v_old := jsonb_build_object('payment_status',OLD.payment_status);
      v_new := jsonb_build_object('payment_status',NEW.payment_status);
    ELSIF NEW.delivery_fee_centavos IS DISTINCT FROM OLD.delivery_fee_centavos THEN
      v_event := 'delivery_fee_changed';
      v_old := jsonb_build_object('delivery_fee_centavos',OLD.delivery_fee_centavos);
      v_new := jsonb_build_object('delivery_fee_centavos',NEW.delivery_fee_centavos);
    ELSIF NEW.total_centavos IS DISTINCT FROM OLD.total_centavos THEN
      v_event := 'total_changed';
      v_old := jsonb_build_object('total_centavos',OLD.total_centavos);
      v_new := jsonb_build_object('total_centavos',NEW.total_centavos);
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.customer_order_audit_events(
    tenant_id,order_id,actor_user_id,actor_source,event_type,old_values,new_values
  ) VALUES (
    NEW.tenant_id,NEW.id,v_actor,
    CASE WHEN v_actor IS NULL THEN 'guest' ELSE 'user' END,
    v_event,v_old,v_new
  );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.audit_customer_order_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_orders_audit_after_insert ON public.customer_orders;
DROP TRIGGER IF EXISTS customer_orders_audit_after_update ON public.customer_orders;
CREATE TRIGGER customer_orders_audit_after_insert
  AFTER INSERT ON public.customer_orders
  FOR EACH ROW EXECUTE FUNCTION private.audit_customer_order_change();
CREATE TRIGGER customer_orders_audit_after_update
  AFTER UPDATE OF order_status,payment_status,delivery_fee_centavos,total_centavos
  ON public.customer_orders
  FOR EACH ROW EXECUTE FUNCTION private.audit_customer_order_change();

COMMIT;
