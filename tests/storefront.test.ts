import { describe, expect, it } from 'vitest';
import { categories, demoMenu, filterMenu, peso } from '../src/features/storefront/demoCatalog';
import { cartCount, cartLines, cartSubtotal, updateCart, MAX_ITEM_QUANTITY } from '../src/features/storefront/cart';
import { restaurantMenuPath, storefrontSlugFromPath, viewForPath } from '../src/app/routes';

const base = '/Multi-Tenant-Restaurant-Ordering-Platform-SaaS/';

describe('mobile-first customer storefront data', () => {
  it('displays a menu by default, with all real demo items', () => {
    expect(categories).toContain('All');
    expect(filterMenu(demoMenu, 'All', '')).toHaveLength(demoMenu.length);
    expect(demoMenu.length).toBeGreaterThan(5);
  });
  it('filters by both category and item search terms', () => {
    expect(filterMenu(demoMenu, 'Rice Meals', 'chicken').map((item) => item.id)).toEqual(['inasal']);
    expect(filterMenu(demoMenu, 'Drinks', 'MANGO').map((item) => item.id)).toEqual(['mango']);
    expect(filterMenu(demoMenu, 'All', 'does-not-exist')).toEqual([]);
    expect(filterMenu(demoMenu, 'All', '  sisig ')).toHaveLength(1);
  });
  it('calculates integer centavo totals and lets people remove items', () => {
    let cart = updateCart({}, 'inasal', 1);
    cart = updateCart(cart, 'fries', 2);
    expect(cartCount(cart)).toBe(3);
    expect(cartSubtotal(cart)).toBe(18900 + 9900 * 2);
    expect(cartLines(cart)).toHaveLength(2);
    cart = updateCart(cart, 'inasal', -1);
    expect(cartCount(cart)).toBe(2);
    expect(cart.inasal).toBeUndefined();
  });
  it('rejects invalid items and clamps quantities', () => {
    expect(updateCart({}, 'not-a-menu-item', 1)).toEqual({});
    expect(updateCart({}, 'burger', 1.5)).toEqual({});
    expect(updateCart({}, 'burger', 50).burger).toBe(MAX_ITEM_QUANTITY);
    expect(updateCart({}, 'burger', -5)).toEqual({});
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
  it('renders sample menu on root or the generic order path', () => {
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
