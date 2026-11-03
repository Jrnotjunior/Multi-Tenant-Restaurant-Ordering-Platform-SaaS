import { createPortal } from 'react-dom';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { storefrontTrackingHash } from '../../app/routes';
import { peso } from './demoCatalog';
import { MapboxDeliveryLocationPicker, type DeliveryLocationAddress } from '../operations/MapboxDeliveryLocationPicker';
import './delivery-address-picker.css';

type OrderType = 'Delivery' | 'Take-out' | 'Pickup' | 'Dine-in';
type PaymentMethod = 'cash' | 'online';
type SavedCheckoutAddress = {
  id: string;
  label: string;
  address_line: string;
  city: string;
  barangay: string;
  latitude: number | null;
  longitude: number | null;
  geocoding_place_id: string;
  is_default: boolean;
};

export type CheckoutSubmission = { orderType: OrderType; customerName: string; phone: string; deliveryAddress: string; deliveryNotes: string; paymentMethod: PaymentMethod; deliveryLatitude: number | null; deliveryLongitude: number | null; loyaltyPointsToRedeem: number };

function storefrontMapHeaderStyle(): CSSProperties {
  const storefront = document.querySelector<HTMLElement>('.sf-storefront');
  const theme = storefront ? window.getComputedStyle(storefront) : null;
  return {
    '--picker-header-color': theme?.getPropertyValue('--sf-header-color').trim() || '#fff',
    '--picker-header-foreground': theme?.getPropertyValue('--sf-header-icon').trim() || '#101b2f',
  } as CSSProperties;
}

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

function normalizePhilippineMobile(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) return '0' + digits.slice(2);
  return digits;
}

function CustomerInformation({ firstName, lastName, phone, onFirstNameChange, onLastNameChange, onPhoneChange }: {
  firstName: string;
  lastName: string;
  phone: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
}) {
  return <fieldset className="sf-checkout-section">
    <legend>Customer information</legend>
    <div className="sf-checkout-fields">
      <label>First name<input name="firstName" autoComplete="given-name" value={firstName} onChange={event => onFirstNameChange(event.target.value)} required minLength={1} maxLength={80} /></label>
      <label>Last name<input name="lastName" autoComplete="family-name" value={lastName} onChange={event => onLastNameChange(event.target.value)} required minLength={1} maxLength={80} /></label>
      <label>Mobile number<input name="mobile" autoComplete="tel" type="tel" inputMode="numeric" value={phone} onChange={event => onPhoneChange(normalizePhilippineMobile(event.target.value).slice(0, 11))} required minLength={11} maxLength={11} pattern="09[0-9]{9}" placeholder="09XXXXXXXXX" title="Enter an 11-digit Philippine mobile number starting with 09." /></label>
    </div>
  </fieldset>;
}

function DeliveryAddressSection({ orderType, value, onSelect, streetAddress, onStreetAddressChange, restaurantSlug, savedAddresses, savedAddressesLoading, onChooseSavedAddress }: { orderType: OrderType; value: DeliveryLocationAddress | null; onSelect: (address: DeliveryLocationAddress) => void; streetAddress: string; onStreetAddressChange: (streetAddress: string) => void; restaurantSlug: string; savedAddresses: SavedCheckoutAddress[]; savedAddressesLoading: boolean; onChooseSavedAddress: (id: string) => void }) {
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  if (orderType !== 'Delivery') return null;
  return <fieldset className="sf-checkout-section">
    <legend>Delivery address</legend>

    {savedAddresses.length > 0 && <div className="sf-checkout-saved-address">
      <label htmlFor="sf-checkout-saved-address-select">Saved address</label>
      <select id="sf-checkout-saved-address-select" className="sf-checkout-saved-address-select" value={(() => { const match = savedAddresses.find(address => address.address_line === streetAddress && address.city === value?.city && address.barangay === value?.barangay); return match?.id ?? ''; })()} onChange={event => onChooseSavedAddress(event.target.value)}>
        <option value="">Choose a saved address…</option>
        {savedAddresses.map(address => <option key={address.id} value={address.id}>{address.label}{address.is_default ? ' · Default' : ''}</option>)}
      </select>
    </div>}
    {savedAddressesLoading && <p className="sf-checkout-optional" role="status">Loading your saved addresses…</p>}
    {value && <div className="sf-checkout-selected-address" role="status">
      <span className="sf-checkout-selected-address-label">DELIVERING TO</span>
      <strong>{value.formattedAddress || [streetAddress, value.barangay, value.city].filter(Boolean).join(', ')}</strong>
    </div>}
    <button type="button" className="sf-checkout-address-picker-toggle" onClick={() => setAddressPickerOpen(true)} aria-expanded={addressPickerOpen}>
      <span aria-hidden="true">⌖</span> {value ? 'Change delivery location' : 'Choose delivery location on map'}
    </button>
    {addressPickerOpen && createPortal(<div className="w2t-address-picker-overlay" role="presentation">
      <section className="w2t-address-picker-screen" role="dialog" aria-modal="true" aria-labelledby="w2t-address-picker-title">
        <header className="w2t-address-picker-header" style={storefrontMapHeaderStyle()}>
          <button type="button" className="w2t-address-picker-back" onClick={() => setAddressPickerOpen(false)} aria-label="Back to checkout">←</button>
          <div><h2 id="w2t-address-picker-title">Choose delivery address</h2><p>Search an address or move the pin to your exact location.</p></div>
          <button type="button" className="w2t-address-picker-close" onClick={() => setAddressPickerOpen(false)} aria-label="Close address picker">×</button>
        </header>
        <div className="w2t-address-picker-map">
          <MapboxDeliveryLocationPicker fillContainer restaurantSlug={restaurantSlug} variant="delivery" initialLatitude={value?.latitude ?? null} initialLongitude={value?.longitude ?? null} onSelect={address => { onSelect(address); setAddressPickerOpen(false); }} />
        </div>
      </section>
    </div>, document.body)}
    <div className="sf-checkout-fields sf-checkout-locality-fields">
      <label>Municipality / City<input name="deliveryCity" autoComplete="address-level2" value={value?.city ?? ''} readOnly placeholder="Automatically filled from the selected map location" aria-describedby="delivery-locality-hint" /></label>
      <label>Barangay<input name="deliveryBarangay" value={value?.barangay ?? ''} readOnly placeholder="Automatically filled from the selected map location" aria-describedby="delivery-locality-hint" /></label>
      <label>Street address<input name="deliveryStreetAddress" autoComplete="street-address" value={streetAddress} onChange={event => onStreetAddressChange(event.target.value)} maxLength={240} placeholder="Automatically filled from the selected map location — you can edit it" aria-describedby="delivery-locality-hint" /></label>
      <p id="delivery-locality-hint" className="sf-checkout-optional">City and barangay are filled from the selected map location. If either is missing, adjust the pin or search for a more specific address.</p>
    </div>
    <div className="sf-checkout-fields">
      <label>Delivery instructions <span className="sf-checkout-optional">(optional)</span><textarea name="notes" rows={2} maxLength={300} placeholder="Landmark or instructions for the rider" /></label>
    </div>
  </fieldset>;
}

/** Standalone checkout screen. It prepares details only; it does not place or charge an order. */
export function CheckoutPage({ restaurantSlug, itemCount, subtotalCentavos, orderLines, onBackToMenu, onPlaceOrder, trackingOnly = false }: CheckoutPageProps) {
  const [orderType, setOrderType] = useState<OrderType>('Delivery');
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryLocationAddress | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedCheckoutAddress[]>([]);
  const [savedAddressesLoading, setSavedAddressesLoading] = useState(false);
  const [streetAddress, setStreetAddress] = useState('');
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [submitting, setSubmitting] = useState(false);
  // A checkout must never inherit the previous order's tracking state. The
  // dedicated tracking view may restore its saved order; a new checkout starts
  // clean and only tracks an order after this submission creates one.
  const [trackingToken, setTrackingToken] = useState<string | null>(() => {
    if (!trackingOnly) return null;
    try { return window.sessionStorage.getItem('web2table:latest-order-tracking'); } catch { return null; }
  });
  const [trackedOrderNumber, setTrackedOrderNumber] = useState<number | null>(() => {
    if (!trackingOnly) return null;
    try { const value = window.sessionStorage.getItem('web2table:latest-order-number'); return value ? Number(value) : null; } catch { return null; }
  });
  const [trackedStatus, setTrackedStatus] = useState<{ order_status: string; payment_status: string; updated_at: string } | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const [deliveryQuote, setDeliveryQuote] = useState<{ feeCentavos: number; distanceMeters: number } | null>(null);
  const [quotingDelivery, setQuotingDelivery] = useState(false);
  const [loyalty, setLoyalty] = useState<{ enabled: boolean; pointsBalance: number; rewardPoints: number; rewardAmountCentavos: number } | null>(null);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void (async () => {
      const { data, error } = await supabase!.auth.getSession();
      if (!active || error || !data.session?.user) return;
      const user = data.session.user;
      const metadata = (user.user_metadata ?? {}) as { first_name?: unknown; last_name?: unknown; full_name?: unknown; phone?: unknown };
      const firstName = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : '';
      const lastName = typeof metadata.last_name === 'string' ? metadata.last_name.trim() : '';
      const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
      if (firstName) setCustomerFirstName(firstName);
      if (lastName) setCustomerLastName(lastName);
      if (!firstName && !lastName && fullName) {
        const parts = fullName.split(/\\s+/);
        setCustomerFirstName(parts.shift() ?? '');
        setCustomerLastName(parts.join(' '));
      }
      if (typeof metadata.phone === 'string') setCustomerPhone(normalizePhilippineMobile(metadata.phone).slice(0, 11));

      setSavedAddressesLoading(true);
      const { data: addresses, error: addressesError } = await supabase!
        .from('customer_saved_addresses')
        .select('id,label,address_line,city,barangay,latitude,longitude,geocoding_place_id,is_default')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });
      if (!active) return;
      if (!addressesError && Array.isArray(addresses)) {
        const validAddresses = addresses as SavedCheckoutAddress[];
        setSavedAddresses(validAddresses);
        const preferred = validAddresses.find(address => address.is_default) ?? validAddresses[0];
        if (preferred) {
          setDeliveryAddress({
            formattedAddress: [preferred.address_line, preferred.barangay, preferred.city].filter(Boolean).join(', '),
            address: preferred.address_line,
            city: preferred.city,
            barangay: preferred.barangay,
            placeId: preferred.geocoding_place_id ?? '',
            latitude: preferred.latitude,
            longitude: preferred.longitude,
          });
          setStreetAddress(preferred.address_line);
        }
      }
      setSavedAddressesLoading(false);
    })();
    return () => { active = false; };
  }, []);

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
  useEffect(() => {
    let active = true;
    setLoyalty(null);
    setLoyaltyPointsToRedeem(0);
    if (!supabase || !restaurantSlug) return;
    setLoyaltyLoading(true);
    void (async () => {
      try {
        const { data: sessionData } = await supabase!.auth.getSession();
        if (!sessionData.session?.user) return;
        const { data, error } = await supabase!.functions.invoke('customer-loyalty-quote', { body: { restaurantSlug } });
        if (error) return;
        const quote = data as { success?: boolean; enabled?: boolean; pointsBalance?: number; rewardPoints?: number; rewardAmountCentavos?: number; error?: string } | null;
        if (!active || !quote?.success || !quote.enabled || !Number(quote.rewardPoints) || !Number(quote.rewardAmountCentavos)) return;
        setLoyalty({
          enabled: true,
          pointsBalance: Math.max(0, Number(quote.pointsBalance ?? 0)),
          rewardPoints: Number(quote.rewardPoints),
          rewardAmountCentavos: Number(quote.rewardAmountCentavos),
        });
      } catch {
        // Loyalty is optional at checkout; the server remains authoritative.
      } finally {
        if (active) setLoyaltyLoading(false);
      }
    })();
    return () => { active = false; };
  }, [restaurantSlug]);

  const paymentComplete = trackingOnly && ['paid', 'succeeded', 'completed'].includes((trackedStatus?.payment_status ?? '').toLowerCase());

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

    {itemCount === 0 && <p className="sf-checkout-page-notice" role="status">Your cart is empty. Add items from the menu before checkout.</p>}



    {!paymentComplete && <form className="sf-checkout-page-form" onSubmit={handleSubmit}>
      <OrderTypeSection value={orderType} onChange={type => { setOrderType(type); setMessage(''); setReviewed(false); }} />
      <CustomerInformation firstName={customerFirstName} lastName={customerLastName} phone={customerPhone} onFirstNameChange={setCustomerFirstName} onLastNameChange={setCustomerLastName} onPhoneChange={setCustomerPhone} />
      <DeliveryAddressSection orderType={orderType} value={deliveryAddress} onSelect={address => { setDeliveryAddress(address); setStreetAddress(address.address); }} streetAddress={streetAddress} onStreetAddressChange={setStreetAddress} restaurantSlug={restaurantSlug} savedAddresses={savedAddresses} savedAddressesLoading={savedAddressesLoading} onChooseSavedAddress={id => { const saved = savedAddresses.find(address => address.id === id); if (!saved) return; setDeliveryAddress({ formattedAddress: [saved.address_line, saved.barangay, saved.city].filter(Boolean).join(', '), address: saved.address_line, city: saved.city, barangay: saved.barangay, placeId: saved.geocoding_place_id ?? '', latitude: saved.latitude, longitude: saved.longitude }); setStreetAddress(saved.address_line); setMessage(''); }} />

      <section className="sf-checkout-total" aria-label="Order summary">
        <div className="sf-checkout-summary-heading"><span>Order summary</span></div>
        {orderLines.map((line, index) => <div className="sf-checkout-summary-line" key={line.name + '-' + index}>
          <span>{line.quantity} × {line.name}</span><strong>{peso(line.totalCentavos)}</strong>
        </div>)}
        <div className="sf-checkout-summary-subtotal"><span>Subtotal</span><strong>{peso(subtotalCentavos)}</strong></div>
        {loyaltyLoading && <p className="sf-checkout-optional">Checking available restaurant rewards…</p>}
        {loyalty && <section className="sf-checkout-loyalty" aria-label="Redeem loyalty points">
          <div><strong>Use loyalty points</strong><p className="sf-checkout-optional">Available balance: {loyalty.pointsBalance.toLocaleString()} points. This restaurant offers {loyalty.rewardPoints.toLocaleString()} points for {peso(loyalty.rewardAmountCentavos)} off.</p></div>
          {(() => {
            const maxAffordableBlocks = Math.floor(subtotalCentavos / loyalty.rewardAmountCentavos);
            const maxBlocks = Math.min(Math.floor(loyalty.pointsBalance / loyalty.rewardPoints), maxAffordableBlocks);
            const maxPoints = maxBlocks * loyalty.rewardPoints;
            return <label className="sf-checkout-loyalty-control">Points to redeem: {loyaltyPointsToRedeem.toLocaleString()}
              <input type="range" min={0} max={maxBlocks} step={1}
                value={loyaltyPointsToRedeem / loyalty.rewardPoints}
                onChange={event => setLoyaltyPointsToRedeem(Number(event.target.value) * loyalty.rewardPoints)}
                disabled={maxBlocks === 0} />
              <small>Each step redeems {loyalty.rewardPoints.toLocaleString()} points. Maximum for this order: {maxPoints.toLocaleString()}.</small>
            </label>;
          })()}
        </section>}
        {loyaltyPointsToRedeem > 0 && loyalty && <div className="sf-checkout-summary-delivery"><span>Loyalty discount</span><strong>−{peso((loyaltyPointsToRedeem / loyalty.rewardPoints) * loyalty.rewardAmountCentavos)}</strong></div>}
        {orderType === 'Delivery' && <div className="sf-checkout-summary-delivery"><span>Delivery fee</span><strong>{quotingDelivery ? 'Calculating…' : deliveryQuote ? peso(deliveryQuote.feeCentavos) : 'Select a delivery location'}</strong></div>}
        <div className="sf-checkout-summary-grand-total"><span>Total</span><strong>{peso(Math.max(0, (orderType === 'Delivery' ? subtotalCentavos + (deliveryQuote?.feeCentavos ?? 0) : subtotalCentavos) - (loyalty && loyaltyPointsToRedeem > 0 ? (loyaltyPointsToRedeem / loyalty.rewardPoints) * loyalty.rewardAmountCentavos : 0)))}</strong></div>{orderType === 'Delivery' && deliveryQuote && <p className="sf-checkout-optional">Driving distance: {(deliveryQuote.distanceMeters / 1000).toFixed(1)} km. The server validates the fee again when placing the order.</p>}
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
            <span className="sf-payment-option-copy"><strong>{orderType === 'Delivery' ? 'Cash on delivery' : orderType === 'Pickup' ? 'Pay cash at pickup' : 'Pay cash at the counter'}</strong><small>{orderType === 'Delivery' ? 'Place your order now and pay the rider when your order arrives.' : orderType === 'Pickup' ? 'Place your order now and pay the cashier when you collect it.' : 'Place your order now and pay the cashier at the restaurant counter before preparation.'}</small></span>
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
            const phone = normalizePhilippineMobile(String(values.get('mobile') ?? '').trim());
            if (!/^09\d{9}$/.test(phone)) {
              setMessage('Enter a valid 11-digit Philippine mobile number starting with 09.');
              return;
            }
            if (orderType === 'Delivery' && !deliveryAddress) { setMessage('Please choose and confirm your delivery location on the map.'); return; }
            if (orderType === 'Delivery' && (!deliveryQuote || quotingDelivery || deliveryAddress?.latitude == null || deliveryAddress?.longitude == null)) { setMessage('Please wait for a valid delivery fee quote before placing your order.'); return; }
            if (orderType === 'Delivery' && !streetAddress.trim()) { setMessage('Please enter a street address for delivery.'); return; }
            setSubmitting(true);
            setMessage('');
            try {
              const result = await onPlaceOrder({
                orderType, customerName: (firstName + ' ' + lastName).trim(),
                phone,
                deliveryAddress: orderType === 'Delivery' && deliveryAddress ? [streetAddress.trim(), deliveryAddress.barangay, deliveryAddress.city].filter(Boolean).join(', ') : '',
                deliveryNotes: String(values.get('notes') ?? '').trim(),
                paymentMethod: paymentMethod === 'online' ? 'online' : 'cash',
                deliveryLatitude: orderType === 'Delivery' ? deliveryAddress?.latitude ?? null : null,
                deliveryLongitude: orderType === 'Delivery' ? deliveryAddress?.longitude ?? null : null,
                loyaltyPointsToRedeem,
              });
              try {
                window.sessionStorage.setItem('web2table:latest-order-tracking', result.trackingToken);
                window.sessionStorage.setItem('web2table:latest-order-number', String(result.orderNumber));
                window.sessionStorage.setItem('web2table:latest-order-details', JSON.stringify({ paymentMethod, lines: orderLines }));
              } catch { /* Tracking continues in memory if session storage is unavailable. */ }
              if (paymentMethod === 'online') {
                if (!result.checkoutUrl) throw new Error('Order #' + result.orderNumber + ' was created, but a checkout link was not returned. Contact the restaurant before placing another order.');
                window.location.assign(result.checkoutUrl);
                return;
              }
              setTrackedOrderNumber(result.orderNumber);
              setTrackingToken(result.trackingToken);
              try {
                window.sessionStorage.setItem('web2table:latest-order-tracking', result.trackingToken);
                window.sessionStorage.setItem('web2table:latest-order-number', String(result.orderNumber));
                window.dispatchEvent(new CustomEvent('web2table:tracking-order-saved'));
              } catch { /* Current page can still track this order in memory. */ }
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
