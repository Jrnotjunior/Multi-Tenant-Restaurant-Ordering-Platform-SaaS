import type { MenuItem } from './demoCatalog';

export type Cart = Readonly<Record<string, number>>;
export const MAX_ITEM_QUANTITY = 20;

export function updateCart(cart: Cart, itemId: string, delta: number, menu: readonly MenuItem[] = []): Cart {
  if (!menu.some((item) => item.id === itemId) || !Number.isInteger(delta)) return cart;
  const current = cart[itemId] ?? 0;
  const safeCurrent = Number.isInteger(current) && current >= 0 ? current : 0;
  const nextQuantity = Math.max(0, Math.min(MAX_ITEM_QUANTITY, safeCurrent + delta));
  const next = { ...cart };
  if (nextQuantity === 0) delete next[itemId];
  else next[itemId] = nextQuantity;
  return next;
}

export function cartLines(cart: Cart, menu: readonly MenuItem[] = demoMenu): Array<{ item: MenuItem; quantity: number }> {
  return menu.flatMap((item) => {
    const quantity = cart[item.id] ?? 0;
    return quantity > 0 && Number.isInteger(quantity) && quantity <= MAX_ITEM_QUANTITY
      ? [{ item, quantity }] : [];
  });
}

export function cartCount(cart: Cart, menu: readonly MenuItem[] = demoMenu): number {
  return cartLines(cart, menu).reduce((sum, line) => sum + line.quantity, 0);
}

export function cartSubtotal(cart: Cart, menu: readonly MenuItem[] = demoMenu): number {
  return cartLines(cart, menu).reduce((sum, line) => sum + line.item.priceCentavos * line.quantity, 0);
}
