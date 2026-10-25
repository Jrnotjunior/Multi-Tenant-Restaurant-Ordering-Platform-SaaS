import type { ReactNode } from 'react';

type CartPageProps = {
  count: number;
  children: ReactNode;
};

/** Dedicated, route-backed cart page content shared by mobile and desktop. */
export function CartPage({ count, children }: CartPageProps) {
  return (
    <section className="sf-cart-page" aria-labelledby="sf-cart-page-title">
      <div className="sf-cart-page-heading">
        <span className="sf-section-kicker">YOUR ORDER</span>
        <h1 id="sf-cart-page-title">Your cart <span>({count})</span></h1>
      </div>
      {children}
    </section>
  );
}
