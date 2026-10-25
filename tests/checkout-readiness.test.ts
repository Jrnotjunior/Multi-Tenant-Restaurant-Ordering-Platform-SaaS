import { describe, expect, it } from 'vitest';
import { buildCheckoutReadiness } from '../src/features/storefront/Storefront';
import type { MenuItem } from '../src/features/storefront/demoCatalog';
import { addCustom, type CustomCart } from '../src/features/storefront/customCart';
import { updateCart, type Cart } from '../src/features/storefront/cart';

const item: MenuItem = {id:'inasal',category:'Rice Meals',name:'Chicken Inasal',description:'Grilled chicken',priceCentavos:18900,emoji:'🍗',background:'#eee',modifierGroups:[{id:'size',name:'Size',minSelect:1,maxSelect:1,options:[{id:'large',name:'Large',priceCentavos:4900}]},{id:'extras',name:'Extras',minSelect:0,maxSelect:1,options:[{id:'egg',name:'Egg',priceCentavos:2500}]}]};
const menu = [item];
const details = {
  customerName: 'Alex Santos',
  phone: '09171234567',
  deliveryAddress: '12 Sample Street, Barangay Central, Quezon City',
  deliveryNotes: 'Near the blue gate',
};

function build(cart: Cart = {}, customized: CustomCart = {}, input = details) {
  return buildCheckoutReadiness({
    slug: 'restaurant-alpha',
    branchSlug: 'main',
    menu,
    cart,
    customized,
    details: input,
  });
}

describe('checkout readiness boundary', () => {
  it('validates basket details but never claims an order was submitted', () => {
    const cart = updateCart({}, item.id, 1, menu);
    const result = build(cart);
    expect(result.ready).toBe(true);
    expect(result.reason).toContain('No order has been placed');
  });

  it('requires a valid non-empty basket and whole-centavo positive totals', () => {
    expect(build().ready).toBe(false);
    const cart = updateCart({}, item.id, 2, menu);
    const result = build(cart);
    expect(result.subtotalCentavos).toBe(item.priceCentavos * 2);
    expect(result.ready).toBe(true);
    expect(result.reason).toContain('not available yet');
  });

  it('does not require a delivery address for take-out, pickup, or dine-in', () => {
    const cart = updateCart({}, item.id, 1, menu);
    for (const orderType of ['Take-out', 'Pickup', 'Dine-in'] as const) {
      const result = build(cart, {}, { ...details, deliveryAddress: '', orderType });
      expect(result.ready).toBe(true);
    }
  });

  it('still requires an address for delivery', () => {
    const cart = updateCart({}, item.id, 1, menu);
    expect(build(cart, {}, { ...details, deliveryAddress: '', orderType: 'Delivery' }).ready).toBe(false);
  });

  it('includes valid customized variants and option prices in the estimate', () => {
    const selected = { size: ['large'], extras: ['egg'] };
    const customCart = addCustom({}, item, selected);
    const result = build({}, customCart);
    expect(result.subtotalCentavos).toBe(item.priceCentavos + 4900 + 2500);
    expect(result.ready).toBe(true);
  });

  it('rejects malformed restaurant/branch slugs and incomplete delivery details', () => {
    const cart = updateCart({}, item.id, 1, menu);
    expect(build(cart, {}, {...details, customerName: 'A'}).ready).toBe(false);
    expect(build(cart, {}, {...details, phone: 'call me'}).ready).toBe(false);
    expect(build(cart, {}, {...details, deliveryAddress: 'short'}).ready).toBe(false);
    expect(build(cart, {}, {...details, deliveryNotes: 'x'.repeat(301)}).ready).toBe(false);
    expect(build(cart, {}, details).reason).toContain('not available yet');
  });
});
