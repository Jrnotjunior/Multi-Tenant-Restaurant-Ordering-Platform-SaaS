-- Order totals include the loyalty discount after redemption.
-- Keep delivery fee and subtotal consistency while allowing the discount to reduce the total.
ALTER TABLE public.customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_total_consistency;

ALTER TABLE public.customer_orders
  ADD CONSTRAINT customer_orders_total_consistency
  CHECK (
    (delivery_fee_centavos IS NULL AND total_centavos IS NULL)
    OR (
      delivery_fee_centavos IS NOT NULL
      AND total_centavos = (
        subtotal_centavos
        + delivery_fee_centavos
        - COALESCE(loyalty_discount_centavos, 0)
      )
      AND COALESCE(loyalty_discount_centavos, 0) >= 0
      AND COALESCE(loyalty_discount_centavos, 0) <= subtotal_centavos + delivery_fee_centavos
    )
  );
