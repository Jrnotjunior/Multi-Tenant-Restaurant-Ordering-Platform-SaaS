import { describe, expect, it } from 'vitest';
import { buildCheckoutReadiness } from '../src/features/storefront/Storefront';
import { enrichSampleMenu, demoMenu } from '../src/features/storefront/demoCatalog';
import { addCustom, type CustomCart } from '../src/features/storefront/customCart';
import { updateCart, type Cart } from '../src/features/storefront/cart';

const menu = enrichSampleMenu(demoMenu);
const item = menu.find(row => row.id === 'inasal')!;
const details = {
  customerName: 'Alex Santos',
  phone: '+63 917 123 4567',
  deliveryAddress: '12 Sample Street, Barangay Central, Quezon City',
  deliveryNotes: 'Near the blue gate',
};

function build(sample: boolean, cart: Cart = {}, customized: CustomCart = {}, input = details) {
  return buildCheckoutReadiness({
    sample,
    slug: 'restaurant-alpha',
    branchSlug: 'main',
    menu,
    cart,
    customized,
    details: input,
  });
}

describe('checkout readiness boundary', () => {
  it('never enables submission for sample storefront data', () => {
    const cart = updateCart({}, item.id, 1, menu);
    const result = build(true, cart);
    expect(result.ready).toBe(false);
    expect(result.reason).toContain('sample menu');
  });

  it('requires a valid non-empty basket and whole-centavo positive totals', () => {
    expect(build(false).ready).toBe(false);
    const cart = updateCart({}, item.id, 2, menu);
    const result = build(false, cart);
    expect(result.subtotalCentavos).toBe(item.priceCentavos * 2);
    expect(result.ready).toBe(true);
    expect(result.reason).toContain('not available yet');
  });

  it('includes valid customized variants and option prices in the estimate', () => {
    const selected = { 'sample-size': ['sample-large'], 'sample-extras': ['sample-egg'] };
    const customCart = addCustom({}, item, selected);
    const result = build(false, {}, customCart);
    expect(result.subtotalCentavos).toBe(item.priceCentavos + 4900 + 2500);
    expect(result.ready).toBe(true);
  });

  it('rejects malformed restaurant/branch slugs and incomplete delivery details', () => {
    const cart = updateCart({}, item.id, 1, menu);
    expect(build(false, cart, {}, {...details, customerName: 'A'}).ready).toBe(false);
    expect(build(false, cart, {}, {...details, phone: 'call me'}).ready).toBe(false);
    expect(build(false, cart, {}, {...details, deliveryAddress: 'short'}).ready).toBe(false);
    expect(build(false, cart, {}, {...details, deliveryNotes: 'x'.repeat(301)}).ready).toBe(false);
    expect(build(false, cart, {}, details).reason).toContain('not available yet');
  });
});
