import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cartCount, cartLines, cartSubtotal, updateCart, type Cart } from './cart';
import {addCustom,changeCustom,customCount,customLines,customSubtotal,type CustomCart,type Selection} from './customCart';
import {CustomizeDialog} from './CustomizeDialog';
import { demoRestaurant, filterMenu, peso, type Category, type MenuItem } from './demoCatalog';
import { branchSlugFromSearch, getSampleCatalog, loadPublishedMenu, sampleCatalog, type StorefrontCatalog } from './publishedMenu';
import { normalizeAppBase, restaurantMenuPath } from '../../app/routes';
import './storefront.css';

function SearchIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.9"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>;
}

function BagIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.4 8.2h15.2l-1.1 12H5.5l-1.1-12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function ArrowIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function FoodArt({ item, small = false }: { item: MenuItem; small?: boolean }) {
  return <div className={'sf-food-art' + (small ? ' sf-food-art-small' : '')} style={{ background: item.background }} aria-hidden="true">
    <span className="sf-art-disc" />
    <span className="sf-food-emoji">{item.emoji}</span>
    {item.imageUrl&&<img loading="lazy" className="sf-food-photo" src={item.imageUrl} alt={item.name} />}
  </div>;
}

function QuantityControl({ itemId, quantity, change }: {
  itemId: string; quantity: number; change: (id: string, delta: number) => void;
}) {
  return <div className="sf-qty" aria-label="Quantity control">
    <button type="button" aria-label="Remove one" onClick={() => change(itemId, -1)}>−</button>
    <span aria-label={'Quantity ' + quantity}>{quantity}</span>
    <button type="button" aria-label="Add one" onClick={() => change(itemId, 1)} disabled={quantity >= 20}>+</button>
  </div>;
}

type CheckoutDetails = Readonly<{
  customerName: string;
  phone: string;
  deliveryAddress: string;
  deliveryNotes: string;
}>;

function buildCheckoutReadiness(input: {
  sample: boolean;
  slug: string;
  branchSlug: string;
  menu: readonly MenuItem[];
  cart: Cart;
  customized: CustomCart;
  details: CheckoutDetails;
}): { ready: boolean; reason: string; subtotalCentavos: number } {
  const regularLines = cartLines(input.cart, input.menu);
  const custom = customLines(input.customized, input.menu);
  const quantity = regularLines.reduce((sum, line) => sum + line.quantity, 0) +
    custom.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCentavos = cartSubtotal(input.cart, input.menu) + customSubtotal(input.customized, input.menu);

  if (input.sample) return { ready: false, reason: 'This is a sample menu. Orders cannot be placed from preview data.', subtotalCentavos };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.branchSlug)) {
    return { ready: false, reason: 'A valid published restaurant and branch are required.', subtotalCentavos };
  }
  if (quantity < 1 || quantity > 100) return { ready: false, reason: 'Add valid items to your basket before continuing.', subtotalCentavos };
  if (regularLines.length + custom.length === 0) return { ready: false, reason: 'Your basket has no valid menu items.', subtotalCentavos };
  if (!Number.isSafeInteger(subtotalCentavos) || subtotalCentavos <= 0) return { ready: false, reason: 'The basket total is invalid.', subtotalCentavos };
  if (input.details.customerName.trim().length < 2 || input.details.customerName.trim().length > 120) {
    return { ready: false, reason: 'Enter your name (2–120 characters).', subtotalCentavos };
  }
  if (!/^[+0-9() .-]{7,24}$/.test(input.details.phone.trim())) {
    return { ready: false, reason: 'Enter a valid contact number.', subtotalCentavos };
  }
  if (input.details.deliveryAddress.trim().length < 8 || input.details.deliveryAddress.trim().length > 500) {
    return { ready: false, reason: 'Enter a complete delivery address (8–500 characters).', subtotalCentavos };
  }
  if (input.details.deliveryNotes.trim().length > 300) {
    return { ready: false, reason: 'Delivery instructions must be 300 characters or fewer.', subtotalCentavos };
  }
  return { ready: true, reason: 'Details are complete, but server-side order submission is not available yet. No order has been placed.', subtotalCentavos };
}

function CartContents({ cart, customized, menu, change, changeCustomized, close, onCheckout }: {
  cart: Cart; customized: CustomCart; menu: readonly MenuItem[]; change: (id: string, delta: number) => void;
  changeCustomized:(key:string,delta:number)=>void; close?: () => void; onCheckout: () => void;
}) {
  const lines = cartLines(cart, menu);
  const count = cartCount(cart, menu)+customCount(customized,menu);
  return <>
    {count === 0 ? <div className="sf-cart-empty">
      <div className="sf-cart-empty-icon"><BagIcon /></div>
      <h3>Your basket is empty</h3>
      <p>There is something delicious waiting on the menu.</p>
      {close && <button type="button" className="sf-continue" onClick={close}>Browse menu</button>}
    </div> : <>
      <div className="sf-cart-items">
        {customLines(customized,menu).map(line=><div className="sf-cart-item" key={line.key}>
          <FoodArt item={line.item} small />
          <div className="sf-cart-item-content">
            <strong>{line.item.name}</strong>
            <p className="sf-custom-cart-line">{line.options.map(option=>option.name).join(' · ')}</p>
            <span>{peso(line.unitPriceCentavos)} each</span>
            <div className="sf-qty">
              <button type="button" aria-label={'Remove one customized '+line.item.name}
                onClick={()=>changeCustomized(line.key,-1)}>−</button>
              <span>{line.quantity}</span>
              <button type="button" aria-label={'Add one customized '+line.item.name}
                disabled={line.quantity>=20} onClick={()=>changeCustomized(line.key,1)}>+</button>
            </div>
          </div>
          <strong className="sf-cart-lineprice">{peso(line.totalCentavos)}</strong>
        </div>)}
        {lines.map(({ item, quantity }) => <div className="sf-cart-item" key={item.id}>
          <FoodArt item={item} small />
          <div className="sf-cart-item-content">
            <strong>{item.name}</strong>
            <span>{peso(item.priceCentavos)}</span>
            <QuantityControl itemId={item.id} quantity={quantity} change={change}/>
          </div>
          <strong className="sf-cart-lineprice">{peso(item.priceCentavos * quantity)}</strong>
        </div>)}
      </div>
      <div className="sf-price-breakdown">
        <div><span>Subtotal</span><strong>{peso(cartSubtotal(cart, menu)+customSubtotal(customized,menu))}</strong></div>
        <div><span>Delivery fee</span><span>At checkout</span></div>
      </div>
      <button type="button" className="sf-checkout-disabled" onClick={onCheckout}>Prepare delivery details <ArrowIcon /></button>
      <p className="sf-cart-note">Checkout preparation only. No order is submitted or charged.</p>
    </>}
  </>;
}

function MenuCard({ item, quantity, add, customize }: { item: MenuItem; quantity: number; add: (id: string, delta: number) => void; customize:(item:MenuItem)=>void }) {
  return <article className="sf-menu-card">
    <div className="sf-card-image">
      <FoodArt item={item}/>
      {item.popular && <span className="sf-popular">★ Popular</span>}
    </div>
    <div className="sf-card-details">
      <span className="sf-card-category">{item.category}</span>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <div className="sf-card-bottom">
        <strong>{peso(item.priceCentavos)}</strong>
        {(item.modifierGroups?.length??0)>0
          ? <button type="button" className="sf-customize-action" onClick={()=>customize(item)}>Customize</button>
          : quantity > 0
          ? <QuantityControl itemId={item.id} quantity={quantity} change={add}/>
          : <button type="button" className="sf-add" onClick={() => add(item.id, 1)} aria-label={'Add ' + item.name + ' to basket'}>+</button>}
      </div>
    </div>
  </article>;
}

export function Storefront({ baseUrl, requestedSlug }: {
  baseUrl: string; requestedSlug: string | null;
}) {
  const isSample = requestedSlug === null || requestedSlug === demoRestaurant.slug;
  const [selectedBranch, setSelectedBranch] = useState<string|null>(() => branchSlugFromSearch(window.location.search));
  const [remoteCatalog, setRemoteCatalog] = useState<StorefrontCatalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading'|'ready'|'unavailable'>(
    isSample ? 'ready' : 'loading'
  );
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Cart>({});
  const [customized,setCustomized]=useState<CustomCart>({});
  const [customizing,setCustomizing]=useState<MenuItem|null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutDetails,setCheckoutDetails]=useState<CheckoutDetails>({
    customerName:'',phone:'',deliveryAddress:'',deliveryNotes:'',
  });
  const [checkoutMessage,setCheckoutMessage]=useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function syncBranchFromHistory() {
      setSelectedBranch(branchSlugFromSearch(window.location.search));
      setCart({});
      setCustomized({});
      setCustomizing(null);
      setCategory('All');
      setCartOpen(false);
    }
    window.addEventListener('popstate',syncBranchFromHistory);
    return () => window.removeEventListener('popstate',syncBranchFromHistory);
  }, []);

  useEffect(() => {
    let active = true;
    if (isSample) { setLoadStatus('ready'); return; }
    setLoadStatus('loading');
    setRemoteCatalog(null);
    void loadPublishedMenu(requestedSlug ?? '',selectedBranch).then((result) => {
      if (!active) return;
      setRemoteCatalog(result);
      setLoadStatus(result ? 'ready' : 'unavailable');
    }).catch(() => { if(active) setLoadStatus('unavailable'); });
    return () => { active = false; };
  }, [requestedSlug, isSample, selectedBranch]);

  const catalog = isSample ? getSampleCatalog(selectedBranch) : remoteCatalog;
  const menu = catalog?.menu ?? [];
  const categories = catalog?.categories ?? ['All'];
  const restaurant = catalog?.restaurant ?? sampleCatalog.restaurant;
  const results = useMemo(() => filterMenu(menu, category, query), [menu, category, query]);
  const count = cartCount(cart, menu)+customCount(customized,menu);
  const subtotal = cartSubtotal(cart, menu)+customSubtotal(customized,menu);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (cartOpen && !dialog.open) dialog.showModal();
    if (!cartOpen && dialog.open) dialog.close();
  }, [cartOpen]);

  const changeCustomized=(key:string,delta:number)=>setCustomized(previous=>changeCustom(previous,key,delta));
  const addCustomized=(item:MenuItem,selected:Selection)=>setCustomized(previous=>addCustom(previous,item,selected));
  const change = (itemId: string, delta: number) =>
    setCart((previous) => updateCart(previous, itemId, delta, menu));
  const menuUrl = restaurantMenuPath(restaurant.slug, baseUrl)
    + (restaurant.branchSlug ? '?branch=' + restaurant.branchSlug : '');

  function switchBranch(slug:string) {
    if(slug === restaurant.branchSlug) return;
    // The backend is authoritative about active branches. A query parameter
    // merely chooses a branch and never authorizes a tenant or a payment.
    if(!catalog?.branches.some(b => b.slug === slug)) return;
    const url=new URL(window.location.href);
    url.searchParams.set('branch',slug);
    window.history.pushState({},'',url.pathname+url.search+url.hash);
    setSelectedBranch(slug);
    setCart({});
    setCustomized({});
    setCustomizing(null);
    setCartOpen(false);
    setCategory('All');
    setQuery('');
  }

  if (!catalog || loadStatus !== 'ready') {
    return <div className="sf-storefront">
      <header className="sf-header"><a className="sf-logo" href={normalizeAppBase(baseUrl)}>
        <span className="sf-logo-mark">W2T</span><span>Web2Table</span></a></header>
      <main className="sf-unavailable" role="status">
        <span className="sf-empty-art">🍽️</span>
        <h1>{loadStatus === 'loading' ? 'Loading restaurant menu…' : 'Restaurant menu unavailable'}</h1>
        <p>{loadStatus === 'loading'
          ? 'Checking for a published restaurant menu.'
          : 'This restaurant has no public menu available. Check the restaurant link or try again later.'}</p>
        <a href={normalizeAppBase(baseUrl)} className="sf-back-link">
          View sample menu <ArrowIcon /></a>
      </main>
    </div>;
  }

  return <div className="sf-storefront" style={{ '--sf-red':restaurant.primaryColor } as CSSProperties}>
    <a className="sf-skip-link" href="#sf-menu">Skip to menu</a>
    <div className="sf-demo-banner"><span className="sf-demo-dot" />{catalog.sample ? 'SAMPLE RESTAURANT MENU' : 'PUBLISHED RESTAURANT MENU'} <span className="sf-demo-banner-hide">· Checkout not yet available</span></div>
    <header className="sf-header">
      <div className="sf-header-inner">
        <a href={menuUrl} className="sf-logo" aria-label={restaurant.name + " menu"}>
          <span className="sf-logo-mark">{restaurant.initials}</span>
          <span className="sf-logo-name"><strong>{restaurant.name}</strong><small>powered by <b>Web2Table</b></small></span>
        </a>
        <nav className="sf-header-actions" aria-label="Store navigation">
          <a className="sf-menu-link" href="#sf-menu">Explore menu</a>
          <span className="sf-header-divider" aria-hidden="true"/>
          <button type="button" className="sf-bag-button" onClick={() => setCartOpen(true)} aria-label={'Open basket with ' + count + ' items'}>
            <BagIcon/><span className="sf-bag-label">Basket</span>{count > 0 && <span className="sf-bag-count">{count}</span>}
          </button>
        </nav>
      </div>
    </header>

    <main className="sf-main">
      <section className="sf-hero" aria-labelledby="sf-hero-title">
        <div className="sf-hero-copy">
          <span className="sf-hero-eyebrow"><span aria-hidden="true">✦</span> MADE FRESH. MADE FOR YOU.</span>
          <h1 id="sf-hero-title">{restaurant.heroHeading}<br/><em>{restaurant.heroEmphasis}</em></h1>
          <p>{restaurant.tagline}</p>
          <a href="#sf-menu" className="sf-hero-action">Explore the menu <ArrowIcon/></a>
        </div>
        <div className="sf-hero-decor" aria-hidden="true">
          <div className="sf-orbit sf-orbit-one"/>
          <div className="sf-orbit sf-orbit-two"/>
          <span className="sf-hero-spark sf-spark-one">✦</span>
          <span className="sf-hero-spark sf-spark-two">✳</span>
          <div className="sf-hero-plate"><span>🍗</span></div>
          <span className="sf-hero-sticker">Made with<br/>extra love <span>♥</span></span>
        </div>
      </section>

      <section className="sf-info-strip" aria-label="Restaurant information">
        <div><span className="sf-info-icon" aria-hidden="true">🛵</span><div><strong>Delivery only</strong><small>Made to enjoy at home</small></div></div>
        <div><span className="sf-info-icon" aria-hidden="true">📍</span><div><strong>{restaurant.branchName}</strong><small>Philippines · Delivery only</small></div></div>
        <div><span className="sf-info-icon" aria-hidden="true">✨</span><div><strong>Freshly made</strong><small>Explore our favorites</small></div></div>
      </section>

      {catalog.branches.length > 1 && <section className="sf-branch-selector" aria-label="Choose restaurant branch">
        <div>
          <span className="sf-section-kicker">SELECT YOUR BRANCH</span>
          <h2>Ordering from {restaurant.branchName}</h2>
          <p>Menus, availability and prices may vary by branch. Switching branches clears your basket.</p>
        </div>
        <label>Restaurant branch
          <select aria-label="Restaurant branch" value={restaurant.branchSlug}
            onChange={(event)=>switchBranch(event.target.value)}>
            {catalog.branches.map(branch=><option key={branch.slug} value={branch.slug}>{branch.name}</option>)}
          </select>
        </label>
      </section>}

      <div className="sf-layout" id="sf-menu">
        <div className="sf-catalog">
          <div className="sf-section-heading">
            <div><span className="sf-section-kicker">THE GOOD STUFF</span><h2>What are you craving?</h2><p>{catalog.sample ? 'Find your next favorite from our sample menu.' : 'Browse the published restaurant menu.'}</p></div>
            <span className="sf-menu-count">{results.length} {results.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="sf-search-wrap">
            <SearchIcon/>
            <input aria-label="Search menu items" placeholder="Search dishes, drinks and more..." type="search" value={query} onChange={(event) => setQuery(event.target.value)}/>
          </div>
          <div className="sf-category-list" aria-label="Menu categories">
            {categories.map((option) => <button type="button" key={option} onClick={() => setCategory(option)}
              aria-pressed={category === option} className={'sf-category' + (category === option ? ' sf-category-active' : '')}>{option}</button>)}
          </div>
          {results.length ? <div className="sf-menu-grid">
            {results.map((item) => <MenuCard item={item} quantity={cart[item.id] ?? 0} add={change} customize={setCustomizing} key={item.id}/>)}
          </div> : <div className="sf-no-results"><span aria-hidden="true">🔎</span><h3>Nothing on the menu matched</h3><p>Try another search or choose a different category.</p><button type="button" onClick={() => {setQuery('');setCategory('All');}}>Clear filters</button></div>}
        </div>

        <aside className="sf-desktop-cart" aria-label="Your basket">
          <div className="sf-desktop-cart-header"><div><BagIcon/><strong>Your basket</strong></div><span>{count} {count === 1 ? 'item' : 'items'}</span></div>
          <CartContents cart={cart} customized={customized} menu={menu} change={change} changeCustomized={changeCustomized}/>
        </aside>
      </div>
    </main>

    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <div><strong>{restaurant.name}</strong><p>{catalog.sample ? 'Sample storefront · No real restaurant or transaction data.' : 'Published restaurant menu · Checkout not yet available.'}</p></div>
        <div className="sf-footer-links"><a href={menuUrl}>Restaurant menu link</a></div>
        <small>Powered by Web2Table</small>
      </div>
    </footer>

    {count > 0 && <div className="sf-mobile-cart-bar">
      <button type="button" onClick={() => setCartOpen(true)} aria-label={'View basket, ' + count + ' items, ' + peso(subtotal)}>
        <span className="sf-mobile-cart-count">{count}</span><span>View basket</span><strong>{peso(subtotal)}</strong><ArrowIcon/>
      </button>
    </div>}
    <dialog ref={dialogRef} className="sf-basket-dialog" onClose={() => setCartOpen(false)} aria-labelledby="sf-dialog-heading">
      <div className="sf-dialog-top"><div><span className="sf-section-kicker">YOUR ORDER</span><h2 id="sf-dialog-heading">Your basket <span>({count})</span></h2></div><button type="button" className="sf-close" onClick={() => setCartOpen(false)} aria-label="Close basket">×</button></div>
      <CartContents cart={cart} customized={customized} menu={menu} change={change} changeCustomized={changeCustomized} close={() => setCartOpen(false)} onCheckout={() => { setCheckoutMessage(''); setCheckoutOpen(true); setCartOpen(false); }}/>
    </dialog>
    <CartContents cart={cart} customized={customized} menu={menu} change={change} changeCustomized={changeCustomized} onCheckout={() => { setCheckoutMessage(''); setCheckoutOpen(true); }}/>
    {checkoutOpen && <div className="sf-checkout-backdrop" role="presentation" onMouseDown={event => {if(event.target===event.currentTarget)setCheckoutOpen(false);}}>
      <section className="sf-checkout-panel" role="dialog" aria-modal="true" aria-labelledby="sf-checkout-heading">
        <div className="sf-dialog-top"><div><span className="sf-section-kicker">DELIVERY ONLY</span><h2 id="sf-checkout-heading">Delivery details</h2></div><button type="button" className="sf-close" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout preparation">×</button></div>
        <p className="sf-checkout-explainer">Prepare the information needed for delivery. This step does not submit an order.</p>
        {checkoutMessage && <p className="sf-checkout-warning" role="alert">{checkoutMessage}</p>}
        <form className="sf-checkout-form" onSubmit={event => {
          event.preventDefault();
          const validation=buildCheckoutReadiness({
            sample:catalog.sample,slug:restaurant.slug,branchSlug:restaurant.branchSlug,
            menu,cart,customized,details:checkoutDetails,
          });
          setCheckoutMessage(validation.ready
            ? 'Your delivery details are complete, but live ordering is not connected yet. No order has been placed and no payment was taken.'
            : validation.reason);
        }}>
          <label>Full name<input autoComplete="name" required minLength={2} maxLength={120} value={checkoutDetails.customerName} onChange={event=>setCheckoutDetails(previous=>({...previous,customerName:event.target.value}))} /></label>
          <label>Contact number<input autoComplete="tel" type="tel" required minLength={7} maxLength={24} value={checkoutDetails.phone} onChange={event=>setCheckoutDetails(previous=>({...previous,phone:event.target.value}))} placeholder="+63 9xx xxx xxxx" /></label>
          <label>Delivery address<textarea autoComplete="street-address" required minLength={8} maxLength={500} rows={3} value={checkoutDetails.deliveryAddress} onChange={event=>setCheckoutDetails(previous=>({...previous,deliveryAddress:event.target.value}))} placeholder="House/building, street, barangay, city" /></label>
          <label>Delivery instructions (optional)<textarea maxLength={300} rows={2} value={checkoutDetails.deliveryNotes} onChange={event=>setCheckoutDetails(previous=>({...previous,deliveryNotes:event.target.value}))} placeholder="Landmark or delivery instructions" /></label>
          <div className="sf-checkout-summary"><span>Basket subtotal (estimate)</span><strong>{peso(subtotal)}</strong></div>
          <p className="sf-cart-note">Final price, availability, delivery fee and order ID must be confirmed by the server at launch.</p>
          <button type="submit" className="sf-checkout-disabled">Validate delivery details</button>
          <button type="button" className="sf-continue" onClick={() => setCheckoutOpen(false)}>Return to menu</button>
        </form>
      </section>
    </div>}
    <CustomizeDialog item={customizing} onAdd={addCustomized} onClose={()=>setCustomizing(null)}/>
    <span className="sf-visually-hidden" aria-live="polite" aria-atomic="true">{count} items in basket, subtotal {peso(subtotal)}</span>
  </div>;
}
