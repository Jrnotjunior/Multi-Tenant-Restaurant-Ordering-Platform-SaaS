import { describe, expect, it } from 'vitest';
import { filterMenu, peso, type MenuItem } from '../src/features/storefront/demoCatalog';
import { cartCount, cartLines, cartSubtotal, updateCart, MAX_ITEM_QUANTITY } from '../src/features/storefront/cart';
import { restaurantMenuPath, storefrontSlugFromPath, viewForPath } from '../src/app/routes';

const base = '/Multi-Tenant-Restaurant-Ordering-Platform-SaaS/';
const menu: MenuItem[] = [
  {id:'inasal',category:'Rice Meals',name:'Chicken Inasal',description:'Grilled chicken',priceCentavos:18900,emoji:'🍗',background:'#eee'},
  {id:'fries',category:'Sides',name:'Fries',description:'Crispy potato fries',priceCentavos:9900,emoji:'🍟',background:'#eee'},
  {id:'mango',category:'Drinks',name:'Mango Juice',description:'Mango drink',priceCentavos:7900,emoji:'🥭',background:'#eee'},
  {id:'sisig',category:'Rice Meals',name:'Pork Sisig',description:'Sizzling sisig',priceCentavos:19900,emoji:'🍚',background:'#eee'},
];

describe('mobile-first customer storefront data', () => {
  it('filters the supplied published menu without requiring bundled demo data', () => {
    expect(filterMenu(menu, 'All', '')).toHaveLength(menu.length);
  });
  it('filters by both category and item search terms', () => {
    expect(filterMenu(menu, 'Rice Meals', 'chicken').map((item) => item.id)).toEqual(['inasal']);
    expect(filterMenu(demoMenu, 'Drinks', 'MANGO').map((item) => item.id)).toEqual(['mango']);
    expect(filterMenu(demoMenu, 'All', 'does-not-exist')).toEqual([]);
    expect(filterMenu(demoMenu, 'All', '  sisig ')).toHaveLength(1);
  });
  it('calculates integer centavo totals and lets people remove items', () => {
    let cart = updateCart({}, 'inasal', 1, menu);
    cart = updateCart(cart, 'fries', 2, menu);
    expect(cartCount(cart, menu)).toBe(3);
    expect(cartSubtotal(cart, menu)).toBe(18900 + 9900 * 2);
    expect(cartLines(cart, menu)).toHaveLength(2);
    cart = updateCart(cart, 'inasal', -1, menu);
    expect(cartCount(cart)).toBe(2);
    expect(cart.inasal).toBeUndefined();
  });
  it('rejects invalid items and clamps quantities', () => {
    expect(updateCart({}, 'not-a-menu-item', 1, menu)).toEqual({});
    expect(updateCart({}, 'burger', 1.5, menu)).toEqual({});
    expect(updateCart({}, 'inasal', 50, menu).inasal).toBe(MAX_ITEM_QUANTITY);
    expect(updateCart({}, 'inasal', -5, menu)).toEqual({});
  });
  it('formats price in Philippine pesos', () => {
    expect(peso(18900)).toContain('189');
  });
});

describe('restaurant menu landing URLs', () => {
  it('takes restaurant discovery links directly to its menu', () => {
    const url = restaurantMenuPath('baryo-kitchen', base);
    expect(url).toBe(base + 'order/baryo-kitchen');
    expect(viewForPath(url, base)).toBe('order');
    expect(storefrontSlugFromPath(url, base)).toBe('baryo-kitchen');
  });
  it('keeps root and generic order paths distinct from tenant menus', () => {
    expect(viewForPath(base, base)).toBe('home');
    expect(viewForPath(base + 'order', base)).toBe('order');
    expect(storefrontSlugFromPath(base + 'order', base)).toBeNull();
  });
  it('does not silently show another restaurant when a menu slug is unknown', () => {
    expect(storefrontSlugFromPath(base + 'order/not-a-real-restaurant', base)).toBe('not-a-real-restaurant');
    expect(storefrontSlugFromPath(base + 'order/bad%2Fslug', base)).toBe('');
    expect(() => restaurantMenuPath('../admin', base)).toThrow();
  });
});
