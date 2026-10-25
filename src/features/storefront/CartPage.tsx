import type { ReactNode } from 'react';

type CartPageProps = {
  count: number;
  onBack: () => void;
  children: ReactNode;
};

/** Dedicated, route-backed cart page content shared by mobile and desktop. */
export function CartPage({ count, onBack, children }: CartPageProps) {
  return (
    <section className="sf-cart-page" aria-labelledby="sf-cart-page-title">
      <div className="sf-cart-page-heading">
        <button type="button" className="sf-continue sf-cart-back" onClick={onBack}>← Back to menu</button>
        <span className="sf-section-kicker">YOUR ORDER</span>
        <h1 id="sf-cart-page-title">Your cart <span>({count})</span></h1>
      </div>
      {children}
    </section>
  );
}
