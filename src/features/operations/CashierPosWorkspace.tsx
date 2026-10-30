import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './cashier-pos.css';

type PosSession = { tenantId: string; tenantName: string; branchId: string; branchName: string; displayName: string; permissions: string[] };
type MenuItem = { id: string; categoryId: string; categoryName: string; name: string; description: string; unitPriceCentavos: number; available: boolean };
type CartLine = { item: MenuItem; quantity: number };
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type SaleResult = { success: boolean; repeated?: boolean; sale_id: string; sale_number: number; subtotal_centavos: number; cash_tendered_centavos: number; change_centavos: number };

const apiBase = (import.meta.env.VITE_POS_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'https://wvibrchebfwirbgkcnbr.supabase.co/functions/v1/pos-api';
const money = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);

export function CashierPosWorkspace() {
  const [session, setSession] = useState<PosSession | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPos() {
      setLoading(true);
      setError('');
      try {
        if (!supabase) throw new Error('Web2table services are not configured.');
        const { data: authData, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        const token = authData.session?.access_token;
        if (!token) throw new Error('Your Web2table session has expired. Sign in again to open POS.');
        const request = async <T,>(path: string): Promise<T> => {
          const response = await fetch(apiBase + path, {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
          });
          const body = await response.json() as ApiEnvelope<T>;
          if (!response.ok || body.data === undefined) {
            throw new Error(body.error?.message || 'Unable to load POS data.');
          }
          return body.data;
        };
        const nextSession = await request<PosSession>('/api/pos/v1/session');
        const nextItems = await request<MenuItem[]>('/api/pos/v1/branches/' + encodeURIComponent(nextSession.branchId) + '/menu');
        if (!active) return;
        setSession(nextSession);
        setItems(nextItems);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to connect to POS.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPos();
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [...new Set(items.map(item => item.categoryName))].sort((a, b) => a.localeCompare(b)), [items]);
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items.filter(item => (category === 'all' || item.categoryName === category)
      && (!term || [item.name, item.description, item.categoryName].some(value => value.toLocaleLowerCase().includes(term))));
  }, [items, search, category]);
  const total = useMemo(() => cart.reduce((sum, line) => sum + line.item.unitPriceCentavos * line.quantity, 0), [cart]);
  const add = (item: MenuItem) => {
    idempotencyKey.current = null;
    setSaleResult(null);
    setNotice('');
    setCart(current => {
      const existing = current.find(line => line.item.id === item.id);
      return existing
        ? current.map(line => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { item, quantity: 1 }];
    });
  };
  const changeQuantity = (id: string, delta: number) => { idempotencyKey.current = null; setSaleResult(null); setCart(current => current
    .map(line => line.item.id === id ? { ...line, quantity: line.quantity + delta } : line)
    .filter(line => line.quantity > 0)); };

  const submitCashSale = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || cart.length === 0 || processing) return;
    const amount = Number(cashTendered);
    if (!Number.isFinite(amount) || amount < 0) { setNotice('Enter the cash received.'); return; }
    const tenderedCentavos = Math.round(amount * 100);
    if (tenderedCentavos < total) { setNotice('Cash received must be at least the sale total.'); return; }
    setProcessing(true);
    setNotice('');
    try {
      if (!supabase) throw new Error('Web2table services are not configured.');
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      const token = authData.session?.access_token;
      if (!token) throw new Error('Your Web2table session expired. Sign in again.');
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await fetch(apiBase + '/api/pos/v1/sales', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
        body: JSON.stringify({
          branchId: session.branchId,
          idempotencyKey: idempotencyKey.current,
          cashTenderedCentavos: tenderedCentavos,
          items: cart.map(line => ({ itemId: line.item.id, quantity: line.quantity })),
        }),
      });
      const body = await response.json() as ApiEnvelope<SaleResult>;
      if (!response.ok || !body.data) throw new Error(body.error?.message || 'The sale could not be saved.');
      setSaleResult(body.data);
      setCart([]);
      setCashDialogOpen(false);
      setCashTendered('');
      idempotencyKey.current = null;
      setNotice('Sale #' + body.data.sale_number + ' saved successfully.');
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'The sale could not be saved. Retry safely.');
    } finally {
      setProcessing(false);
    }
  };

  return <section className="cashier-pos" aria-labelledby="cashier-pos-title">
    <header className="cashier-pos-heading">
      <div><p className="staff-eyebrow">POINT OF SALE</p><h1 id="cashier-pos-title">Register</h1>
        <p>{session ? session.tenantName + ' · ' + session.branchName : 'Use your existing Web2table session to load your branch menu.'}</p></div>
      <span className="cashier-pos-session">{session ? 'Session verified' : loading ? 'Connecting…' : 'Session required'}</span>
    </header>
    {error && <div className="cashier-pos-alert" role="alert"><strong>POS unavailable</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
    {notice && <p className="staff-notice" role="status">{notice}</p>}
    {!error && <div className="cashier-pos-layout">
      <div className="cashier-pos-catalog">
        <div className="cashier-pos-tools"><label className="cashier-pos-search"><span>Search menu</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products…" /></label>
          <label className="cashier-pos-category"><span>Category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        {loading ? <p className="cashier-pos-empty">Loading published menu…</p> : visibleItems.length === 0 ? <div className="cashier-pos-empty"><h2>No menu items available</h2><p>Published and available items for this branch will appear here.</p></div> :
          <div className="cashier-pos-products">{visibleItems.map(item => <article className="cashier-pos-product" key={item.id}>
            <span>{item.categoryName}</span><h2>{item.name}</h2>{item.description && <p>{item.description}</p>}
            <footer><strong>{money(item.unitPriceCentavos)}</strong><button type="button" onClick={() => add(item)}>Add</button></footer>
          </article>)}</div>}
      </div>
      <aside className="cashier-pos-cart" aria-label="Current sale">
        <div className="cashier-pos-cart-heading"><h2>Current sale</h2><span>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
        {cart.length === 0 ? <div className="cashier-pos-cart-empty"><span aria-hidden="true">＋</span><p>Add menu items to start a sale.</p></div> :
          <ul>{cart.map(line => <li key={line.item.id}><div><strong>{line.item.name}</strong><span>{money(line.item.unitPriceCentavos)} each</span><div className="cashier-pos-quantity"><button type="button" aria-label={'Remove one ' + line.item.name} onClick={() => changeQuantity(line.item.id, -1)}>−</button><span>{line.quantity}</span><button type="button" aria-label={'Add one ' + line.item.name} onClick={() => changeQuantity(line.item.id, 1)}>+</button></div></div><strong>{money(line.item.unitPriceCentavos * line.quantity)}</strong></li>)}</ul>}
        <div className="cashier-pos-total"><span>Subtotal</span><strong>{money(total)}</strong></div>
        <button className="cashier-pos-checkout" type="button" disabled={loading || processing || cart.length === 0 || Boolean(error)} onClick={() => { setNotice(''); setCashDialogOpen(true); setCashTendered((total / 100).toFixed(2)); }}>Take cash payment</button>
        <p className="cashier-pos-footnote">Cash sales are validated and recorded by the server. Other payment methods are not enabled yet.</p>
      </aside>
    </div>}
    {cashDialogOpen && <div className="cashier-pos-dialog-backdrop"><section className="cashier-pos-dialog" role="dialog" aria-modal="true" aria-labelledby="cashier-pos-cash-title">
      <header><div><p className="staff-eyebrow">PAYMENT</p><h2 id="cashier-pos-cash-title">Cash checkout</h2></div><button type="button" aria-label="Close cash checkout" disabled={processing} onClick={() => setCashDialogOpen(false)}>×</button></header>
      <form onSubmit={submitCashSale}>
        <div className="cashier-pos-payment-total"><span>Amount due</span><strong>{money(total)}</strong></div>
        <label className="cashier-pos-cash-input">Cash received (PHP)<input type="number" min={(total / 100).toFixed(2)} step="0.01" inputMode="decimal" required value={cashTendered} onChange={event => setCashTendered(event.target.value)} /></label>
        <div className="cashier-pos-payment-total"><span>Change</span><strong>{money(Math.max(0, Math.round((Number(cashTendered) || 0) * 100) - total)}</strong></div>
        {notice && <p className="cashier-pos-dialog-error" role="alert">{notice}</p>}
        <button className="cashier-pos-checkout" type="submit" disabled={processing || cart.length === 0}>{processing ? 'Saving sale…' : 'Confirm cash sale'}</button>
        <p className="cashier-pos-footnote">Confirm only after you have received the cash. Prices are checked again by the server.</p>
      </form>
    </section></div>}
    {saleResult && <div className="cashier-pos-receipt" role="status"><strong>Sale #{saleResult.sale_number} saved</strong><span>Total {money(saleResult.subtotal_centavos)}</span><span>Cash {money(saleResult.cash_tendered_centavos)}</span><span>Change {money(saleResult.change_centavos)}</span><button type="button" onClick={() => setSaleResult(null)}>Dismiss</button></div>}
  </section>;
}
