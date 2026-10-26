import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { storefrontTrackingHash } from '../../app/routes';
import { peso } from './demoCatalog';
import { MapboxDeliveryLocationPicker, type MapboxDeliveryAddress } from '../operations/MapboxDeliveryLocationPicker';

type OrderType = 'Delivery' | 'Take-out' | 'Pickup' | 'Dine-in';
type PaymentMethod = 'cash' | 'online';
export type CheckoutSubmission = { orderType: OrderType; customerName: string; phone: string; deliveryAddress: string; deliveryNotes: string; paymentMethod: PaymentMethod; deliveryLatitude: number | null; deliveryLongitude: number | null };

type CheckoutPageProps = {
  restaurantSlug: string;
  itemCount: number;
  subtotalCentavos: number;
  orderLines: readonly { name: string; quantity: number; totalCentavos: number }[];
  onBackToMenu: () => void;
  onPlaceOrder: (submission: CheckoutSubmission) => Promise<{ orderNumber: number; checkoutUrl?: string; trackingToken: string }>;
  trackingOnly?: boolean;
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

function DeliveryAddressSection({ orderType, value, onSelect, streetAddress, onStreetAddressChange, restaurantSlug }: { orderType: OrderType; value: MapboxDeliveryAddress | null; onSelect: (address: MapboxDeliveryAddress) => void; streetAddress: string; onStreetAddressChange: (streetAddress: string) => void; restaurantSlug: string }) {
  if (orderType !== 'Delivery') return null;
  return <fieldset className="sf-checkout-section">
    <legend>Delivery address</legend>
    <MapboxDeliveryLocationPicker restaurantSlug={restaurantSlug} variant="delivery" initialLatitude={value?.latitude ?? null} initialLongitude={value?.longitude ?? null} onSelect={onSelect} />
    {value && <p className="sf-checkout-address-confirmed" role="status">Selected address: {value.formattedAddress || value.address}</p>}
    <div className="sf-checkout-fields sf-checkout-locality-fields">
      <label>Municipality / City<input name="deliveryCity" autoComplete="address-level2" value={value?.city ?? ''} readOnly placeholder="Automatically filled by Mapbox" aria-describedby="delivery-locality-hint" /></label>
      <label>Barangay<input name="deliveryBarangay" value={value?.barangay ?? ''} readOnly placeholder="Automatically filled by Mapbox" aria-describedby="delivery-locality-hint" /></label>
      <label>Street address<input name="deliveryStreetAddress" autoComplete="street-address" value={streetAddress} onChange={event => onStreetAddressChange(event.target.value)} maxLength={240} placeholder="Automatically filled by Mapbox — you can edit it" aria-describedby="delivery-locality-hint" /></label>
      <p id="delivery-locality-hint" className="sf-checkout-optional">City and barangay are filled from the selected Mapbox location. If either is missing, adjust the pin or search for a more specific address.</p>
    </div>
    <div className="sf-checkout-fields">
      <label>Delivery instructions <span className="sf-checkout-optional">(optional)</span><textarea name="notes" rows={2} maxLength={300} placeholder="Landmark or instructions for the rider" /></label>
    </div>
  </fieldset>;
}

/** Standalone checkout screen. It prepares details only; it does not place or charge an order. */
export function CheckoutPage({ restaurantSlug, itemCount, subtotalCentavos, orderLines, onBackToMenu, onPlaceOrder, trackingOnly = false }: CheckoutPageProps) {
  const [orderType, setOrderType] = useState<OrderType>('Delivery');
  const [deliveryAddress, setDeliveryAddress] = useState<MapboxDeliveryAddress | null>(null);
  const [streetAddress, setStreetAddress] = useState('');
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(() => { try { return window.sessionStorage.getItem('web2table:latest-order-tracking'); } catch { return null; } });
  const [trackedOrderNumber, setTrackedOrderNumber] = useState<number | null>(() => { try { const value = window.sessionStorage.getItem('web2table:latest-order-number'); return value ? Number(value) : null; } catch { return null; } });
  const [trackedStatus, setTrackedStatus] = useState<{ order_status: string; payment_status: string; updated_at: string } | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const [deliveryQuote, setDeliveryQuote] = useState<{ feeCentavos: number; distanceMeters: number } | null>(null);
  const [quotingDelivery, setQuotingDelivery] = useState(false);

  useEffect(() => {
    if (!trackingToken || !supabase) return;
    let active = true;
    let refreshTimer: number | undefined;
    const refreshStatus = async () => {
      const { data, error } = await supabase!.rpc('track_customer_order', { p_tracking_token: trackingToken });
      if (!active) return;
      if (error) { setTrackingError('Live tracking is reconnecting. We will keep trying.'); return; }
      const result = data as { found?: boolean; order_number?: number; order_status?: string; payment_status?: string; updated_at?: string } | null;
      if (!result?.found || !result.order_status || !result.payment_status || !result.updated_at) {
        setTrackingError('We could not find this order. Keep your tracking link and contact the restaurant if needed.');
        return;
      }
      setTrackingError('');
      setTrackedOrderNumber(Number(result.order_number));
      setTrackedStatus({ order_status: result.order_status, payment_status: result.payment_status, updated_at: result.updated_at });
    };
    void refreshStatus();
    const channel = supabase.channel('order-tracking:' + trackingToken)
      .on('broadcast', { event: 'order_changed' }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void refreshStatus(); }, 100);
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refreshStatus(); });
    const fallbackTimer = window.setInterval(() => { void refreshStatus(); }, 30000);
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(fallbackTimer);
      void supabase?.removeChannel(channel);
    };
  }, [trackingToken]);

  useEffect(() => {
    let active = true;
    setDeliveryQuote(null);
    if (orderType !== 'Delivery' || !deliveryAddress || deliveryAddress.latitude === null || deliveryAddress.longitude === null || !supabase) { setQuotingDelivery(false); return; }
    setQuotingDelivery(true);
    void supabase.functions.invoke('delivery-pricing', { body: { action: 'quote', restaurantSlug, latitude: deliveryAddress.latitude, longitude: deliveryAddress.longitude } })
      .then(({ data, error }) => { if (error) throw error; const result = data as { success?: boolean; feeCentavos?: number; distanceMeters?: number; error?: string } | null; if (!result?.success || !Number.isFinite(result.feeCentavos) || !Number.isFinite(result.distanceMeters)) throw new Error(result?.error || 'Unable to calculate the delivery fee.'); if (active) setDeliveryQuote({ feeCentavos: Number(result.feeCentavos), distanceMeters: Number(result.distanceMeters) }); })
      .catch((error: unknown) => { if (active) { setDeliveryQuote(null); setMessage(error instanceof Error ? error.message : 'Unable to calculate the delivery fee.'); } })
      .finally(() => { if (active) setQuotingDelivery(false); });
    return () => { active = false; };
  }, [orderType, deliveryAddress?.latitude, deliveryAddress?.longitude, restaurantSlug]);
  const paymentComplete = ['paid', 'succeeded', 'completed'].includes((trackedStatus?.payment_status ?? '').toLowerCase());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPaymentModalOpen(true);
  }

  if (trackingOnly) return <main className="sf-checkout-page sf-order-tracking-page">
    <div className="sf-checkout-page-intro"><span className="sf-section-kicker">ORDER TRACKING</span><h1>Track your order</h1><p>Follow your order progress and payment status. Updates refresh automatically.</p></div>
    {trackingToken ? <section className="sf-order-tracking sf-order-tracking-dedicated" aria-live="polite" aria-label="Live order tracking">
      <span className="sf-section-kicker">LIVE ORDER TRACKING</span><h2>Order #{trackedOrderNumber ?? "…"}</h2>
      {trackedStatus ? <><p className="sf-order-tracking-status">{trackedStatus.order_status.replaceAll("_", " ")}</p><p className="sf-order-tracking-payment">Payment: {trackedStatus.payment_status.replaceAll("_", " ")}</p>
      <ol className="sf-order-tracking-steps">{["pending_confirmation","confirmed","preparing","ready_for_dispatch","out_for_delivery","delivered"].map((status,index)=>{const sequence=["pending_confirmation","confirmed","preparing","ready_for_dispatch","out_for_delivery","delivered"];const current=sequence.indexOf(trackedStatus.order_status);const terminal=["rejected","cancelled"].includes(trackedStatus.order_status);return <li key={status} className={current>=index&&!terminal?"is-complete":""}><span>{index+1}</span><small>{status.replaceAll("_"," ")}</small></li>;})}</ol>
      <p className="sf-order-tracking-updated">Last updated {new Date(trackedStatus.updated_at).toLocaleTimeString()}</p></> : <p>Connecting to live order updates…</p>}
      {trackingError && <p className="sf-checkout-page-message" role="status">{trackingError}</p>}<p className="sf-order-tracking-note">This page refreshes order status automatically.</p>
      <button type="button" className="sf-continue" onClick={onBackToMenu}>Back to restaurant</button>
    </section> : <p className="sf-checkout-page-notice">No recent order was found on this browser. Open the tracking link saved when your order was placed.</p>}
  </main>;
  return <main className="sf-checkout-page">
    <div className="sf-checkout-page-intro">
      <span className="sf-section-kicker">{paymentComplete ? 'ORDER TRACKING' : 'CHECKOUT'}</span>
      <h1>{paymentComplete ? 'Payment received — track your order' : 'How would you like your order?'}</h1>
      <p>{paymentComplete ? 'Your cashier has confirmed payment. Follow your order status here; updates appear automatically.' : 'Choose how you will receive your food, then provide the details we need.'}</p>
    </div>

    {itemCount === 0 && !trackingToken && <p className="sf-checkout-page-notice" role="status">Your cart is empty. Add items from the menu before checkout.</p>}

    {trackingToken && <section className={"sf-order-tracking" + (paymentComplete ? ' sf-order-tracking-paid' : '')} aria-live="polite" aria-label="Live order tracking">
      <span className="sf-section-kicker">LIVE ORDER TRACKING</span>
      <h2>Order #{trackedOrderNumber ?? '…'}</h2>
      {trackedStatus ? <>
        <p className="sf-order-tracking-status">{trackedStatus.order_status.replaceAll('_', ' ')}</p>
        <p className="sf-order-tracking-payment">Payment: {trackedStatus.payment_status.replaceAll('_', ' ')}</p>
        <ol className="sf-order-tracking-steps">
          {['pending_confirmation','confirmed','preparing','ready_for_dispatch','out_for_delivery','delivered'].map((status, index) => {
            const sequence = ['pending_confirmation','confirmed','preparing','ready_for_dispatch','out_for_delivery','delivered'];
            const current = sequence.indexOf(trackedStatus.order_status);
            const terminal = ['rejected','cancelled'].includes(trackedStatus.order_status);
            const done = current >= index && !terminal;
            return <li key={status} className={done ? 'is-complete' : ''}><span>{index + 1}</span><small>{status.replaceAll('_', ' ')}</small></li>;
          })}
        </ol>
        <p className="sf-order-tracking-updated">Last updated {new Date(trackedStatus.updated_at).toLocaleTimeString()}</p>
      </> : <p>Connecting to live order updates…</p>}
      {trackingError && <p className="sf-checkout-page-message" role="status">{trackingError}</p>}
      <p className="sf-order-tracking-note">Keep this page open to see updates. Your order status refreshes automatically.</p>
    </section>}

    {!paymentComplete && <form className="sf-checkout-page-form" onSubmit={handleSubmit}>
      <OrderTypeSection value={orderType} onChange={type => { setOrderType(type); setMessage(''); setReviewed(false); }} />
      <CustomerInformation orderType={orderType} />
      <DeliveryAddressSection orderType={orderType} value={deliveryAddress} onSelect={address => { setDeliveryAddress(address); setStreetAddress(address.address); }} streetAddress={streetAddress} onStreetAddressChange={setStreetAddress} restaurantSlug={restaurantSlug} />

      <section className="sf-checkout-total" aria-label="Order summary">
        <div className="sf-checkout-summary-heading"><span>Order summary</span></div>
        {orderLines.map((line, index) => <div className="sf-checkout-summary-line" key={line.name + '-' + index}>
          <span>{line.quantity} × {line.name}</span><strong>{peso(line.totalCentavos)}</strong>
        </div>)}
        <div className="sf-checkout-summary-subtotal"><span>Subtotal</span><strong>{peso(subtotalCentavos)}</strong></div>
        {orderType === 'Delivery' && <div className="sf-checkout-summary-delivery"><span>Delivery fee</span><strong>{quotingDelivery ? 'Calculating…' : deliveryQuote ? peso(deliveryQuote.feeCentavos) : 'Select a delivery location'}</strong></div>}
        <div className="sf-checkout-summary-grand-total"><span>Total</span><strong>{peso(orderType === 'Delivery' ? subtotalCentavos + (deliveryQuote?.feeCentavos ?? 0) : subtotalCentavos)}</strong></div>{orderType === 'Delivery' && deliveryQuote && <p className="sf-checkout-optional">Driving distance: {(deliveryQuote.distanceMeters / 1000).toFixed(1)} km. The server validates the fee again when placing the order.</p>}
      </section>

      {message && <p className="sf-checkout-page-message" role="status">{message}</p>}
      <button className="sf-checkout-submit" type="submit" disabled={itemCount === 0 || (orderType === 'Delivery' && (!deliveryQuote || quotingDelivery))}>Choose Payment Options</button>
    </form>}

    {!paymentComplete && paymentModalOpen && <div className="sf-payment-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPaymentModalOpen(false); }}>
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
            if (paymentMethod === 'online' && orderType === 'Delivery' && !deliveryQuote) { setMessage('Please wait for the delivery fee to be confirmed before online payment. No order has been placed.'); return; }
            const form = document.querySelector<HTMLFormElement>('.sf-checkout-page-form');
            if (!form) return;
            const values = new FormData(form);
            const firstName = String(values.get('firstName') ?? '').trim();
            const lastName = String(values.get('lastName') ?? '').trim();
            if (orderType === 'Delivery' && !deliveryAddress) { setMessage('Please choose and confirm your delivery location on the map.'); return; }
            if (orderType === 'Delivery' && (!deliveryQuote || quotingDelivery || deliveryAddress?.latitude == null || deliveryAddress?.longitude == null)) { setMessage('Please wait for a valid delivery fee quote before placing your order.'); return; }
            if (orderType === 'Delivery' && !streetAddress.trim()) { setMessage('Please enter a street address for delivery.'); return; }
            setSubmitting(true);
            setMessage('');
            try {
              const result = await onPlaceOrder({
                orderType, customerName: (firstName + ' ' + lastName).trim(),
                phone: String(values.get('mobile') ?? '').trim(),
                deliveryAddress: orderType === 'Delivery' && deliveryAddress ? [streetAddress.trim(), deliveryAddress.barangay, deliveryAddress.city].filter(Boolean).join(', ') : '',
                deliveryNotes: String(values.get('notes') ?? '').trim(),
                paymentMethod: paymentMethod === 'online' ? 'online' : 'cash',
                deliveryLatitude: orderType === 'Delivery' ? deliveryAddress?.latitude ?? null : null,
                deliveryLongitude: orderType === 'Delivery' ? deliveryAddress?.longitude ?? null : null,
              });
              try {
                window.sessionStorage.setItem('web2table:latest-order-tracking', result.trackingToken);
                window.sessionStorage.setItem('web2table:latest-order-number', String(result.orderNumber));
              } catch { /* Tracking continues in memory if session storage is unavailable. */ }
              if (paymentMethod === 'online') {
                if (!result.checkoutUrl) throw new Error('Order #' + result.orderNumber + ' was created, but a checkout link was not returned. Contact the restaurant before placing another order.');
                window.location.assign(result.checkoutUrl);
                return;
              }
              setTrackedOrderNumber(result.orderNumber);
              setTrackingToken(result.trackingToken);
              window.location.hash = storefrontTrackingHash(restaurantSlug).slice(1);
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
