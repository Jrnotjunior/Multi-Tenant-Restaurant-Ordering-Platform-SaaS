import { demoMenu, type MenuItem } from './demoCatalog';

export type Cart = Readonly<Record<string, number>>;
export const MAX_ITEM_QUANTITY = 20;

export function updateCart(cart: Cart, itemId: string, delta: number): Cart {
  if (!demoMenu.some((item) => item.id === itemId) || !Number.isInteger(delta)) return cart;
  const nextQuantity = Math.max(0, Math.min(MAX_ITEM_QUANTITY, (cart[itemId] ?? 0) + delta));
  const next = { ...cart };
  if (nextQuantity === 0) delete next[itemId];
  else next[itemId] = nextQuantity;
  return next;
}

export function cartLines(cart: Cart): Array<{ item: MenuItem; quantity: number }> {
  return demoMenu.flatMap((item) => {
    const quantity = cart[item.id] ?? 0;
    return quantity > 0 && Number.isInteger(quantity) ? [{ item, quantity }] : [];
  });
}

export function cartCount(cart: Cart): number {
  return cartLines(cart).reduce((sum, line) => sum + line.quantity, 0);
}

export function cartSubtotal(cart: Cart): number {
  return cartLines(cart).reduce((sum, line) => sum + line.item.priceCentavos * line.quantity, 0);
}
