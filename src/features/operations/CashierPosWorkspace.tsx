import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './cashier-pos.css';

type PosSession = { tenantId: string; tenantName: string; branchId: string; branchName: string; displayName: string; permissions: string[] };
type MenuItem = { id: string; categoryId: string; categoryName: string; name: string; description: string; unitPriceCentavos: number; available: boolean };
type CartLine = { item: MenuItem; quantity: number };
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

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
    setNotice('');
    setCart(current => {
      const existing = current.find(line => line.item.id === item.id);
      return existing
        ? current.map(line => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { item, quantity: 1 }];
    });
  };
  const changeQuantity = (id: string, delta: number) => setCart(current => current
    .map(line => line.item.id === id ? { ...line, quantity: line.quantity + delta } : line)
    .filter(line => line.quantity > 0));

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
        <button className="cashier-pos-checkout" type="button" disabled>Checkout unavailable</button>
        <p className="cashier-pos-footnote">Cart is a workspace preview only. Checkout stays disabled until the secure POS transaction, payment, and audit APIs are implemented.</p>
      </aside>
    </div>}
  </section>;
}
