-- Allow a rider to record arrival before completing a delivery.
BEGIN;

ALTER TABLE public.delivery_assignments
  DROP CONSTRAINT IF EXISTS delivery_assignments_status_check;

ALTER TABLE public.delivery_assignments
  ADD CONSTRAINT delivery_assignments_status_check
  CHECK (status IN (
    'assigned',
    'accepted',
    'dispatched',
    'out_for_delivery',
    'arrived_at_customer',
    'delivered',
    'cancelled'
  ));

COMMIT;
