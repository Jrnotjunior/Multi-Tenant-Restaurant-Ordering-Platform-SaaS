import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { MapboxDeliveryLocationPicker, type MapboxDeliveryAddress } from './MapboxDeliveryLocationPicker';
import { OwnerPayMongoOnboardingCard } from './OwnerPayMongoOnboardingCard';

type Tab = 'profile' | 'hours' | 'delivery' | 'cash' | 'rider' | 'payments';
type Obj = Record<string, unknown>;
type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type DayHours = { isOpen: boolean; open: string; close: string };
type OperatingHours = Record<DayKey, DayHours>;
type OnlinePaymentMethods = { card: boolean; gcash: boolean; qrph: boolean; grab_pay: boolean; paymaya: boolean; dob: boolean; billease: boolean };
type OnlinePayments = { enabled: boolean; methods: OnlinePaymentMethods; provider_configured: boolean; [key: string]: unknown };
type DeliveryForm = { baseFee: string; distanceIncrementMeters: string; feePerIncrement: string; maxDistanceKm: string };
type StorefrontRow = {
  tenant_id: string;
  display_name: string | null;
  tagline: string | null;
  restaurant_address: string | null;
  store_address: string | null;
  delivery_location_latitude: number | null;
  delivery_location_longitude: number | null;
  accepting_orders: boolean | null;
  opening_hours: Obj;
  delivery_pricing: Obj;
  cash_payment_options: Obj;
  rider_assignment: Obj;
  online_payments: OnlinePayments;
  [key: string]: unknown;
};
type Props = { tenantId: string; restaurantName: string | null };

const DAYS: Array<{ key: DayKey; label: string }> = [
  { key: 'monday', label: 'Monday' }, { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' }, { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' }, { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];
const DEFAULT_DAY: DayHours = { isOpen: true, open: '09:00', close: '21:00' };
const DEFAULT_HOURS: OperatingHours = Object.fromEntries(DAYS.map(day => [day.key, { ...DEFAULT_DAY }])) as OperatingHours;
const DEFAULT_METHODS: OnlinePaymentMethods = { card: false, gcash: true, qrph: true, grab_pay: true, paymaya: true, dob: true, billease: false };
const PAYMENT_METHODS: Array<{ key: keyof OnlinePaymentMethods; label: string }> = [
  { key: 'card', label: 'Card payments' }, { key: 'gcash', label: 'GCash' },
  { key: 'qrph', label: 'QR Ph' }, { key: 'grab_pay', label: 'GrabPay' },
  { key: 'paymaya', label: 'Maya' }, { key: 'dob', label: 'Online Banking' },
  { key: 'billease', label: 'Buy Now, Pay Later (BillEase)' },
];
const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'profile', label: 'Profile' }, { key: 'hours', label: 'Store status & hours' },
  { key: 'delivery', label: 'Delivery pricing' }, { key: 'cash', label: 'Cash Payment Options' },
  { key: 'rider', label: 'Rider assignment' }, { key: 'payments', label: 'Online payments' },
];

function asObject(value: unknown): Obj {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
}
function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  const time24 = text.match(/^(\d{1,2}):(\d{2})$/);
  if (time24) {
    const hour = Number(time24[1]); const minute = Number(time24[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  const time12 = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (time12) {
    let hour = Number(time12[1]); const minute = Number(time12[2]);
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      const pm = time12[3].toUpperCase() === 'PM';
      if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12;
      return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
    }
  }
  return fallback;
}
function normalizeHours(value: unknown): OperatingHours {
  const root = asObject(value);
  const schedule = asObject(root.schedule);
  const source = Object.keys(schedule).length ? schedule : root;
  return Object.fromEntries(DAYS.map(({ key }) => {
    const day = asObject(source[key]);
    return [key, {
      isOpen: day.isOpen !== false,
      open: normalizeTime(day.open, DEFAULT_DAY.open),
      close: normalizeTime(day.close, DEFAULT_DAY.close),
    }];
  })) as OperatingHours;
}
function normalizeMethods(value: unknown): OnlinePaymentMethods {
  const source = asObject(value);
  return {
    card: source.card === true,
    gcash: source.gcash !== false,
    qrph: source.qrph !== false,
    grab_pay: source.grab_pay !== false,
    paymaya: source.paymaya !== false,
    dob: source.dob !== false,
    billease: source.billease === true,
  };
}
function normalizeOnlinePayments(value: unknown): OnlinePayments {
  const source = asObject(value);
  return {
    ...source,
    enabled: source.enabled === true,
    provider_configured: source.provider_configured === true,
    methods: { ...DEFAULT_METHODS, ...normalizeMethods(source.methods) },
  };
}
function normalizeDelivery(value: unknown): DeliveryForm {
  const source = asObject(value);
  return {
    baseFee: String(source.base_fee ?? 0),
    distanceIncrementMeters: String(source.distance_increment_meters ?? 500),
    feePerIncrement: String(source.fee_per_increment ?? 10),
    maxDistanceKm: String(Number(source.max_distance_meters ?? 10000) / 1000),
  };
}
function formatTimeLabel(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function to24Hour(hour: number, minute: number, period: 'AM' | 'PM'): string {
  let h = hour % 12;
  if (period === 'PM') h += 12;
  return String(h).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}
function TimePicker({ value, disabled, label, onChange }: { value: string; disabled?: boolean; label: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [rawHour, rawMinute] = draft.split(':').map(Number);
  const period: 'AM' | 'PM' = rawHour >= 12 ? 'PM' : 'AM';
  const hour = rawHour % 12 || 12;
  function update(nextHour = hour, nextMinute = rawMinute, nextPeriod = period) {
    setDraft(to24Hour(nextHour, nextMinute, nextPeriod));
  }
  return <div className="w2t-time-picker">
    <button type="button" className="w2t-time-picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={label} disabled={disabled} onClick={() => setOpen(current => !current)}>
      <span>{formatTimeLabel(value)}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="w2t-time-picker-popover" role="dialog" aria-label={label}>
      <div className="w2t-time-picker-title">{label}</div>
      <div className="w2t-time-picker-selects">
        <select aria-label="Hour" value={hour} onChange={event => update(Number(event.target.value), rawMinute, period)}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map(item => <option key={item} value={item}>{String(item).padStart(2, '0')}</option>)}
        </select><span>:</span>
        <select aria-label="Minute" value={rawMinute} onChange={event => update(hour, Number(event.target.value), period)}>
          {Array.from({ length: 60 }, (_, index) => index).map(item => <option key={item} value={item}>{String(item).padStart(2, '0')}</option>)}
        </select>
        <select aria-label="AM or PM" value={period} onChange={event => update(hour, rawMinute, event.target.value as 'AM' | 'PM')}>
          <option value="AM">AM</option><option value="PM">PM</option>
        </select>
      </div>
      <button type="button" className="w2t-time-picker-done" onClick={() => { onChange(draft); setOpen(false); }}>Done</button>
    </div>}
  </div>;
}

function Toggle({ label, checked, onChange, disabled = false, small = false }: { label: string; checked: boolean; onChange?: (value: boolean) => void; disabled?: boolean; small?: boolean }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`w2t-toggle ${checked ? 'is-on' : ''}${small ? ' w2t-toggle-small' : ''}`} disabled={disabled} onClick={() => onChange?.(!checked)}><span /></button>;
}

export function OwnerStoreSettingsPage({ tenantId, restaurantName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [row, setRow] = useState<StorefrontRow | null>(null);
  const [restaurantAddress, setRestaurantAddress] = useState('');
  const [tagline, setTagline] = useState('');
  const [acceptingOrders, setAcceptingOrders] = useState(false);
  const [hours, setHours] = useState<OperatingHours>(DEFAULT_HOURS);
  const [delivery, setDelivery] = useState<DeliveryForm>({ baseFee: '0', distanceIncrementMeters: '500', feePerIncrement: '10', maxDistanceKm: '10' });
  const [storeAddress, setStoreAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [cash, setCash] = useState<Obj>({ cash_on_delivery_enabled: true, cash_on_pickup_enabled: true, cash_on_take_out_enabled: true });
  const [rider, setRider] = useState<Obj>({ mode: 'manual', auto_assign: false, instructions: '' });
  const [payments, setPayments] = useState<OnlinePayments>({ enabled: false, methods: DEFAULT_METHODS, provider_configured: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        if (!supabase) throw new Error('Store settings service is not configured.');
        const { data, error } = await supabase.from('tenant_storefronts')
          .select('tenant_id,display_name,tagline,restaurant_address,store_address,delivery_location_latitude,delivery_location_longitude,accepting_orders,opening_hours,delivery_pricing,cash_payment_options,rider_assignment,online_payments')
          .eq('tenant_id', tenantId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('No store settings exist for this restaurant yet.');
        if (!active) return;
        const settings = data as unknown as StorefrontRow;
        setRow(settings);
        setRestaurantAddress(settings.restaurant_address ?? '');
        setTagline(settings.tagline ?? '');
        setAcceptingOrders(settings.accepting_orders !== false);
        setHours(normalizeHours(settings.opening_hours));
        setDelivery(normalizeDelivery(settings.delivery_pricing));
        setStoreAddress(settings.store_address ?? '');
        setLatitude(typeof settings.delivery_location_latitude === 'number' ? settings.delivery_location_latitude : null);
        setLongitude(typeof settings.delivery_location_longitude === 'number' ? settings.delivery_location_longitude : null);
        setCash({ cash_on_delivery_enabled: true, cash_on_pickup_enabled: true, cash_on_take_out_enabled: true, ...asObject(settings.cash_payment_options) });
        setRider({ mode: 'manual', auto_assign: false, ...asObject(settings.rider_assignment) });
        setPayments(normalizeOnlinePayments(settings.online_payments));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load store settings.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSettings();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    if (!message && !error) return;
    const timeout = window.setTimeout(() => { setMessage(''); setError(''); }, 5000);
    return () => window.clearTimeout(timeout);
  }, [message, error]);

  function updateDay(day: DayKey, patch: Partial<DayHours>) {
    setHours(current => ({ ...current, [day]: { ...current[day], ...patch } }));
    setMessage(''); setError('');
  }
  function updateDelivery(key: keyof DeliveryForm, value: string) {
    setDelivery(current => ({ ...current, [key]: value }));
    setMessage(''); setError('');
  }
  function updateMethods(key: keyof OnlinePaymentMethods, value: boolean) {
    setPayments(current => ({ ...current, methods: { ...current.methods, [key]: value } }));
    setMessage(''); setError('');
  }

  async function saveSettings() {
    if (!supabase || !row) { setError('Store settings are not ready to save. Reload this page and try again.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const parsedBase = Number(delivery.baseFee);
      const parsedDistance = Number(delivery.distanceIncrementMeters);
      const parsedPerIncrement = Number(delivery.feePerIncrement);
      const parsedMaxDistanceKm = Number(delivery.maxDistanceKm);
      if (activeTab === 'delivery') {
        if (!Number.isFinite(parsedBase) || parsedBase < 0 || !Number.isFinite(parsedDistance) || parsedDistance <= 0 ||
          !Number.isFinite(parsedPerIncrement) || parsedPerIncrement < 0 || !Number.isFinite(parsedMaxDistanceKm) || parsedMaxDistanceKm <= 0) {
          throw new Error('Enter valid delivery pricing values. Fees cannot be negative and distances must be greater than zero.');
        }
        if ((latitude === null) !== (longitude === null)) throw new Error('Select an exact store location on the map before saving delivery settings.');
      }

      const currentHours = Object.fromEntries(DAYS.map(({ key }) => [key, {
        isOpen: Boolean(hours[key].isOpen),
        open: normalizeTime(hours[key].open, DEFAULT_DAY.open),
        close: normalizeTime(hours[key].close, DEFAULT_DAY.close),
      }])) as OperatingHours;
      const previousHours = asObject(row.opening_hours);
      const nextHours = { ...previousHours, timezone: typeof previousHours.timezone === 'string' ? previousHours.timezone : 'Asia/Manila', schedule: currentHours, exceptions: Array.isArray(previousHours.exceptions) ? previousHours.exceptions : [] };
      const previousDelivery = asObject(row.delivery_pricing);
      const nextDelivery = {
        ...previousDelivery,
        base_fee: parsedBase,
        currency: 'PHP',
        distance_increment_meters: Math.round(parsedDistance),
        fee_per_increment: parsedPerIncrement,
        max_distance_meters: Math.round(parsedMaxDistanceKm * 1000),
      };
      const nextPayments: OnlinePayments = { ...payments, methods: payments.methods };
      const changes: Obj = {
        updated_at: new Date().toISOString(),
      };
      if (activeTab === 'profile') Object.assign(changes, { restaurant_address: restaurantAddress.trim() || null, tagline: tagline.trim() });
      if (activeTab === 'hours') Object.assign(changes, { accepting_orders: acceptingOrders, opening_hours: nextHours });
      if (activeTab === 'delivery') Object.assign(changes, {
        store_address: storeAddress.trim() || null,
        delivery_location_latitude: latitude,
        delivery_location_longitude: longitude,
        delivery_pricing: nextDelivery,
      });
      if (activeTab === 'payments') Object.assign(changes, { online_payments: nextPayments });
      if (!['profile', 'hours', 'delivery', 'payments'].includes(activeTab)) return;

      const { data, error } = await supabase.from('tenant_storefronts').update(changes)
        .eq('tenant_id', tenantId).select('tenant_id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Settings were not saved. Confirm that you are signed in as an active owner of this restaurant.');
      setRow(current => current ? { ...current, ...changes } as StorefrontRow : current);
      setMessage('Store settings saved successfully.');
      setConfirmOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save store settings.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = ['profile', 'hours', 'delivery', 'payments'].includes(activeTab);
  const saveLabel = saving ? 'Saving…' : 'Save';
  if (loading) return <main className="owner-content"><section className="owner-orders-empty"><h1>Store Settings</h1><p>Loading store settings…</p></section></main>;
  if (!row) return <main className="owner-content"><section className="owner-orders-empty"><h1>Store Settings</h1><p role="alert">{error || 'Store settings could not be loaded.'}</p></section></main>;

  return <main className="owner-content owner-store-settings">
    <nav className="w2t-settings-tabs" role="tablist" aria-label="Store settings tabs">
      {tabs.map(tab => <button type="button" key={tab.key} role="tab" aria-selected={activeTab === tab.key}
        className={activeTab === tab.key ? 'is-active' : ''} onClick={() => { setActiveTab(tab.key); setMessage(''); setError(''); }}>{tab.label}</button>)}
    </nav>
    {error && <div className="w2t-settings-feedback error" role="alert"><strong>Couldn't complete that action</strong><p>{error}</p></div>}
    {message && <div className="w2t-settings-feedback success" role="status"><strong>Changes saved</strong><p>{message}</p></div>}
    <form className="w2t-settings-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (canSave) setConfirmOpen(true); }}>
      {activeTab === 'profile' && <section className="w2t-settings-card" role="tabpanel">
        <p className="w2t-settings-help w2t-settings-profile-intro">Update the customer-facing profile for {row.display_name ?? restaurantName ?? 'your restaurant'}.</p>
        <label className="w2t-setting-field"><span>Restaurant address</span><input type="text" maxLength={500} value={restaurantAddress} disabled={saving} placeholder="Enter the address customers should see" onChange={event => { setRestaurantAddress(event.target.value); setMessage(''); setError(''); }} /><small>This is the pickup address shown to customers. Set delivery routing location under Delivery pricing.</small></label>
        <label className="w2t-setting-field"><span>Restaurant tagline</span><input type="text" maxLength={120} value={tagline} disabled={saving} placeholder="Enter your restaurant tagline" onChange={event => { setTagline(event.target.value); setMessage(''); setError(''); }} /></label>
      </section>}
      {activeTab === 'hours' && <>
        <section className="w2t-settings-card">
          <div className="w2t-setting-switch-row"><span><strong>{acceptingOrders ? 'Store is open' : 'Store is manually closed'}</strong><small>Turn off to close ordering immediately. Turn it back on to use your operating hours.</small></span><Toggle label="Store accepting orders" checked={acceptingOrders} disabled={saving} onChange={value => { setAcceptingOrders(value); setMessage(''); setError(''); }} /></div>
        </section>
        <section className="w2t-settings-card"><h2>Operating hours</h2><p className="w2t-settings-help">Choose the opening and closing times for each day. Turn a day off when the restaurant is closed.</p>
          <div className="w2t-hours-table"><div className="w2t-hours-head"><span>Day</span><span>Opens</span><span>Closes</span><span>Status</span></div>
            {DAYS.map(({ key, label }) => <div className="w2t-hours-row" key={key}>
              <strong>{label}</strong>
              <TimePicker label={label + ' opening time'} value={hours[key].open} disabled={!hours[key].isOpen || saving} onChange={value => updateDay(key, { open: value })} />
              <TimePicker label={label + ' closing time'} value={hours[key].close} disabled={!hours[key].isOpen || saving} onChange={value => updateDay(key, { close: value })} />
              <Toggle label={label + ' open'} checked={hours[key].isOpen} disabled={saving} small onChange={value => updateDay(key, { isOpen: value })} />
            </div>)}
          </div>
        </section>
      </>}
      {activeTab === 'delivery' && <section className="w2t-settings-card">
        <h2>Delivery pricing</h2>
        <div className="w2t-settings-grid">
          <label className="w2t-setting-field"><span>Base delivery fee (₱)</span><input type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]+)?" value={delivery.baseFee} disabled={saving} onChange={event => updateDelivery('baseFee', event.target.value)} /></label>
          <label className="w2t-setting-field"><span>Distance increment (meters)</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={delivery.distanceIncrementMeters} disabled={saving} onChange={event => updateDelivery('distanceIncrementMeters', event.target.value)} /></label>
          <label className="w2t-setting-field"><span>Fee per increment (₱)</span><input type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]+)?" value={delivery.feePerIncrement} disabled={saving} onChange={event => updateDelivery('feePerIncrement', event.target.value)} /></label>
          <label className="w2t-setting-field"><span>Maximum driving distance (km)</span><input type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]+)?" value={delivery.maxDistanceKm} disabled={saving} onChange={event => updateDelivery('maxDistanceKm', event.target.value)} /></label>
        </div>
        <p className="w2t-settings-help">Example: ₱10 per 500 meters means 1.2 km = 3 distance increments. The base fee is added on top.</p>
        <section className="w2t-delivery-location" aria-labelledby="w2t-delivery-location-heading">
          <div className="w2t-delivery-location-header"><div><span className="w2t-delivery-location-kicker">Delivery setup</span><h2 id="w2t-delivery-location-heading">Store address</h2><p>Set the exact location delivery orders should route from. Distance and fees are calculated from this point.</p></div><span className="w2t-route-origin">Route origin</span></div>
          <MapboxDeliveryLocationPicker variant="restaurant" disabled={saving} initialLatitude={latitude} initialLongitude={longitude}
            onSelect={(selected: MapboxDeliveryAddress) => {
              if (selected.latitude === null || selected.longitude === null) throw new Error('The map did not return an exact store location.');
              setLatitude(selected.latitude); setLongitude(selected.longitude);
              if (selected.formattedAddress.trim()) setStoreAddress(selected.formattedAddress.trim());
              setMessage(''); setError('');
            }} />
          <label className="w2t-setting-field w2t-delivery-address"><span>Delivery address</span><input type="text" maxLength={500} value={storeAddress} disabled={saving} placeholder="Select on the map or enter the store address" onChange={event => { setStoreAddress(event.target.value); setMessage(''); setError(''); }} /></label>
          {latitude !== null && longitude !== null && <p className="w2t-location-coordinates"><span />Saved location: {latitude.toFixed(6)}, {longitude.toFixed(6)}</p>}
        </section>
      </section>}
      {activeTab === 'cash' && <section className="w2t-settings-card">
        <p className="w2t-settings-help">Cash Payment Options are controlled by the System Administrator. Contact the System Administrator to request a change.</p>
        {[
          { key: 'cash_on_delivery_enabled', label: 'Accept Cash on Delivery' },
          { key: 'cash_on_pickup_enabled', label: 'Accept Cash for Pickup' },
          { key: 'cash_on_take_out_enabled', label: 'Accept Cash for Take-out' },
        ].map(item => <div className="w2t-setting-switch-row" key={item.key}><span>{item.label}</span><Toggle label={item.label} checked={cash[item.key] !== false} disabled /></div>)}
      </section>}
      {activeTab === 'rider' && <section className="w2t-settings-card">
        <div className="w2t-setting-switch-row"><span>Auto-assign delivery orders</span><Toggle label="Automatic rider assignment" checked={rider.auto_assign === true} disabled /></div>
        <p className="w2t-settings-help">Rider assignment is controlled by the System Administrator. Contact the System Administrator to request a workflow change.</p>
      </section>}
      {activeTab === 'payments' && <><section className="w2t-settings-card">
        <div className="w2t-setting-switch-row w2t-setting-switch-row-top"><span><strong>Online Payments</strong><small>{payments.enabled ? 'Customers can pay online using the enabled methods below.' : 'Online payment is turned off for this restaurant.'} This setting is controlled by the System Administrator.</small></span><Toggle label="Online payments enabled" checked={payments.enabled} disabled /></div>
        <h2 className="w2t-settings-subheading">Accepted Payment Methods</h2>
        <p className="w2t-settings-help">Choose which payment methods this restaurant accepts. A method must also be supported by its connected payment account.</p>
        <div className={`w2t-payment-methods${payments.enabled ? '' : ' is-disabled'}`}>
          {PAYMENT_METHODS.map(item => <div className="w2t-setting-switch-row" key={item.key}><span>{item.label}</span><Toggle label={item.label} checked={payments.methods[item.key]} disabled={saving || !payments.enabled} onChange={value => updateMethods(item.key, value)} /></div>)}
        </div>
      </section><OwnerPayMongoOnboardingCard tenantId={tenantId} /></>}
      {canSave && <div className="w2t-settings-actions"><button type="submit" disabled={saving}>{saveLabel}</button></div>}
    </form>
    {confirmOpen && <div className="w2t-settings-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="w2t-confirm-title"><div className="w2t-settings-confirm-modal">
      <h2 id="w2t-confirm-title">Save Store Settings?</h2><p>Are you sure you want to save these store settings?</p>
      <div className="w2t-settings-confirm-actions"><button type="button" disabled={saving} onClick={() => setConfirmOpen(false)}>Cancel</button><button type="button" disabled={saving} onClick={() => void saveSettings()}>{saving ? 'Saving…' : 'Confirm Save'}</button></div>
    </div></div>}
  </main>;
}
