import { useState, type FormEvent } from 'react';
import { peso } from './demoCatalog';

type OrderType = 'Delivery' | 'Take-out' | 'Pickup' | 'Dine-in';

type CheckoutPageProps = {
  restaurantName: string;
  itemCount: number;
  subtotalCentavos: number;
  onBackToMenu: () => void;
};

function OrderTypeSection({ value, onChange }: {
  value: OrderType;
  onChange: (value: OrderType) => void;
}) {
  const types: OrderType[] = ['Delivery', 'Take-out', 'Pickup', 'Dine-in'];
  return <fieldset className="sf-checkout-section">
    <legend>Order type</legend>
    <div className="sf-order-type-options">
      {types.map(type => <label className={'sf-order-type-option' + (value === type ? ' is-selected' : '')} key={type}>
        <span>{type}</span>
        <input type="radio" name="orderType" value={type} checked={value === type} onChange={() => onChange(type)} />
      </label>)}
    </div>
  </fieldset>;
}

function CustomerInformation() {
  return <fieldset className="sf-checkout-section">
    <legend>Customer information</legend>
    <div className="sf-checkout-fields">
      <label>First name<input name="firstName" autoComplete="given-name" required minLength={1} maxLength={80} /></label>
      <label>Last name<input name="lastName" autoComplete="family-name" required minLength={1} maxLength={80} /></label>
      <label>Mobile number<input name="mobile" autoComplete="tel" type="tel" required minLength={7} maxLength={24} placeholder="+63 9xx xxx xxxx" /></label>
    </div>
  </fieldset>;
}

function DeliveryAddressSection({ orderType }: { orderType: OrderType }) {
  if (orderType !== 'Delivery') return null;
  return <fieldset className="sf-checkout-section">
    <legend>Delivery address</legend>
    <div className="sf-checkout-fields">
      <label>House / building and street<input name="street" autoComplete="address-line1" required minLength={4} maxLength={180} /></label>
      <label>Barangay<input name="barangay" required minLength={2} maxLength={100} /></label>
      <label>City / municipality<input name="city" autoComplete="address-level2" required minLength={2} maxLength={100} /></label>
      <label>Delivery instructions <span className="sf-checkout-optional">(optional)</span><textarea name="notes" rows={2} maxLength={300} placeholder="Landmark or instructions for the rider" /></label>
    </div>
  </fieldset>;
}

/** Standalone checkout screen. It prepares details only; it does not place or charge an order. */
export function CheckoutPage({ restaurantName, itemCount, subtotalCentavos, onBackToMenu }: CheckoutPageProps) {
  const [orderType, setOrderType] = useState<OrderType>('Delivery');
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewed(true);
    setMessage('Your details are ready for review. Online order submission and payment are not connected yet, so no order has been placed.');
  }

  return <main className="sf-checkout-page">
    <div className="sf-checkout-page-intro">
      <span className="sf-section-kicker">CHECKOUT</span>
      <h1>How would you like your order?</h1>
      <p>Choose how you will receive your food, then provide the details we need.</p>
    </div>

    {itemCount === 0 && <p className="sf-checkout-page-notice" role="status">Your cart is empty. Add items from the menu before checkout.</p>}

    <form className="sf-checkout-page-form" onSubmit={handleSubmit}>
      <OrderTypeSection value={orderType} onChange={type => { setOrderType(type); setMessage(''); setReviewed(false); }} />
      <CustomerInformation />
      <DeliveryAddressSection orderType={orderType} />

      <section className="sf-checkout-total" aria-label="Order summary">
        <div><span>Restaurant</span><strong>{restaurantName}</strong></div>
        <div><span>Items</span><strong>{itemCount}</strong></div>
        <div className="sf-checkout-total-price"><span>Subtotal</span><strong>{peso(subtotalCentavos)}</strong></div>
        <p>Delivery fees and payment details will be calculated during checkout.</p>
      </section>

      {message && <p className="sf-checkout-page-message" role="status">{message}</p>}
      <button className="sf-checkout-submit" type="submit" disabled={itemCount === 0}>{reviewed ? 'Details reviewed' : 'Review checkout details'} <span aria-hidden="true">→</span></button>
      <button className="sf-checkout-back-menu" type="button" onClick={onBackToMenu}>Add more items</button>
      <p className="sf-checkout-page-footnote">No order is submitted or charged on this page.</p>
    </form>
  </main>;
}
