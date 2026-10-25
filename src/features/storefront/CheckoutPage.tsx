import { useState, type FormEvent } from 'react';
import { peso } from './demoCatalog';

type OrderType = 'Delivery' | 'Take-out' | 'Pickup' | 'Dine-in';
type PaymentMethod = 'cash' | 'online';
export type CheckoutSubmission = { orderType: OrderType; customerName: string; phone: string; deliveryAddress: string; deliveryNotes: string; paymentMethod: PaymentMethod };

type CheckoutPageProps = {
  itemCount: number;
  subtotalCentavos: number;
  orderLines: readonly { name: string; quantity: number; totalCentavos: number }[];
  onBackToMenu: () => void;
  onPlaceOrder: (submission: CheckoutSubmission) => Promise<{ orderNumber: number }>;
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

function CustomerInformation({ orderType }: { orderType: OrderType }) {
  return <fieldset className="sf-checkout-section">
    <legend>Customer information</legend>
    <div className="sf-checkout-fields">
      <label>First name<input name="firstName" autoComplete="given-name" required minLength={1} maxLength={80} /></label>
      <label>Last name<input name="lastName" autoComplete="family-name" required minLength={1} maxLength={80} /></label>
      <label>Mobile number<input name="mobile" autoComplete="tel" type="tel" required minLength={7} maxLength={24} placeholder="09xx xxx xxxx" /></label>
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
export function CheckoutPage({ itemCount, subtotalCentavos, orderLines, onBackToMenu, onPlaceOrder }: CheckoutPageProps) {
  const [orderType, setOrderType] = useState<OrderType>('Delivery');
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPaymentModalOpen(true);
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
      <CustomerInformation orderType={orderType} />
      <DeliveryAddressSection orderType={orderType} />

      <section className="sf-checkout-total" aria-label="Order summary">
        <div className="sf-checkout-summary-heading"><span>Order summary</span></div>
        {orderLines.map((line, index) => <div className="sf-checkout-summary-line" key={line.name + '-' + index}>
          <span>{line.quantity} × {line.name}</span><strong>{peso(line.totalCentavos)}</strong>
        </div>)}
        <div className="sf-checkout-summary-subtotal"><span>Subtotal</span><strong>{peso(subtotalCentavos)}</strong></div>
        {orderType === 'Delivery' && <div className="sf-checkout-summary-delivery"><span>Delivery fee</span><strong>Set by restaurant</strong></div>}
        <div className="sf-checkout-summary-grand-total"><span>{orderType === 'Delivery' ? 'Subtotal (delivery fee pending)' : 'Total'}</span><strong>{peso(subtotalCentavos)}</strong></div>
      </section>

      {message && <p className="sf-checkout-page-message" role="status">{message}</p>}
      <button className="sf-checkout-submit" type="submit" disabled={itemCount === 0}>Choose Payment Options</button>
    </form>

    {paymentModalOpen && <div className="sf-payment-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPaymentModalOpen(false); }}>
      <section className="sf-payment-modal" role="dialog" aria-modal="true" aria-labelledby="sf-payment-modal-title">
        <button className="sf-payment-modal-close" type="button" aria-label="Close payment options" onClick={() => setPaymentModalOpen(false)}>×</button>
        <span className="sf-section-kicker">CHECKOUT</span>
        <h2 id="sf-payment-modal-title">Choose your payment method</h2>
        <p className="sf-payment-modal-description">Select how you would like to pay for this order.</p>
        <div className="sf-payment-options">
          <label className={'sf-payment-option' + (paymentMethod === 'cash' ? ' is-selected' : '')}>
            <span className="sf-payment-option-icon" aria-hidden="true">₱</span>
            <span className="sf-payment-option-copy"><strong>Pay cash at the counter</strong><small>Place your order now and pay the cashier at the restaurant counter before preparation.</small></span>
            <input type="radio" name="paymentMethod" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
          </label>
          <label className={'sf-payment-option' + (paymentMethod === 'online' ? ' is-selected' : '')}>
            <span className="sf-payment-option-icon" aria-hidden="true">↗</span>
            <span className="sf-payment-option-copy"><strong>Online Payment</strong><small>Pay securely through our online payment gateway.</small></span>
            <input type="radio" name="paymentMethod" value="online" checked={paymentMethod === 'online'} onChange={() => setPaymentMethod('online')} />
          </label>
        </div>
        <p className="sf-payment-policy">By placing your order, you agree to our Cancellation &amp; Refund Policy.</p>
        {message && <p className="sf-checkout-page-message" role="status">{message}</p>}
        <div className="sf-payment-modal-actions">
          <button type="button" className="sf-payment-cancel" onClick={() => setPaymentModalOpen(false)}>Cancel</button>
          <button type="button" className="sf-payment-place-order" disabled={!paymentMethod || submitting} onClick={async () => {
            if (paymentMethod === 'online') { setMessage('Online payment is not connected yet. No order has been placed.'); setPaymentModalOpen(false); return; }
            const form = document.querySelector<HTMLFormElement>('.sf-checkout-page-form');
            if (!form) return;
            const values = new FormData(form);
            const firstName = String(values.get('firstName') ?? '').trim();
            const lastName = String(values.get('lastName') ?? '').trim();
            const street = String(values.get('street') ?? '').trim();
            const barangay = String(values.get('barangay') ?? '').trim();
            const city = String(values.get('city') ?? '').trim();
            setSubmitting(true);
            setMessage('');
            try {
              const result = await onPlaceOrder({
                orderType, customerName: (firstName + ' ' + lastName).trim(),
                phone: String(values.get('mobile') ?? '').trim(),
                deliveryAddress: orderType === 'Delivery' ? [street, barangay, city].filter(Boolean).join(', ') : '',
                deliveryNotes: String(values.get('notes') ?? '').trim(),
                paymentMethod,
              });
              setMessage('Order #' + result.orderNumber + ' placed successfully. Pay at the restaurant counter.');
              setPaymentModalOpen(false);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to place your order. Please try again.');
            } finally { setSubmitting(false); }
          }}>{submitting ? 'Placing order…' : 'Place Order'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
