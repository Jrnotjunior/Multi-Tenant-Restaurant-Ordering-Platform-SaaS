/** Vite BASE_URL is '/' locally and '/<repo>/' on GitHub Pages. */
export type View = 'home' | 'order' | 'restaurant' | 'admin';

export function normalizeAppBase(baseUrl: string): string {
  const base = baseUrl.trim();
  if (!base.startsWith('/') || base.startsWith('//') || base.includes('?') || base.includes('#')) {
    throw new Error('Application base URL must be root-relative.');
  }
  return base.endsWith('/') ? base : base + '/';
}

export function pathFor(view: View, baseUrl: string): string {
  const base = normalizeAppBase(baseUrl);
  return view === 'home' ? base : base + view;
}

/** Customer restaurant search links should resolve straight to the menu. */
export function restaurantMenuPath(slug: string, baseUrl: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid restaurant slug');
  return pathFor('order', baseUrl) + '/' + slug;
}

export function storefrontCartPath(slug: string, baseUrl: string): string {
  return restaurantMenuPath(slug, baseUrl) + '/cart';
}

export function storefrontCheckoutPath(slug: string, baseUrl: string): string {
  return restaurantMenuPath(slug, baseUrl) + '/checkout';
}

export function isStorefrontCartPath(pathname: string, baseUrl: string): boolean {
  return pathname.replace(/\/+$/, '').endsWith('/cart')
    && storefrontSlugFromPath(pathname, baseUrl) !== null;
}

export function isStorefrontTrackingPath(pathname: string, baseUrl: string): boolean {\n  return pathname.replace(/\\/+$/, '').endsWith('/track') && storefrontSlugFromPath(pathname, baseUrl) !== null;\n}\n\nexport function isStorefrontCheckoutPath(pathname: string, baseUrl: string): boolean {
  return pathname.replace(/\/+$/, '').endsWith('/checkout')
    && storefrontSlugFromPath(pathname, baseUrl) !== null;
}

export function storefrontSlugFromPath(pathname: string, baseUrl: string): string | null {
  const prefix = pathFor('order', baseUrl) + '/';
  if (!pathname.startsWith(prefix)) return null;
  let slug = pathname.slice(prefix.length).replace(/\/+$/, '');
  if (slug.endsWith('/checkout')) slug = slug.slice(0, -9);
  else if (slug.endsWith('/cart')) slug = slug.slice(0, -5);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

export function viewForPath(pathname: string, baseUrl: string): View {
  const base = normalizeAppBase(baseUrl);
  if (pathname === base.slice(0, -1)) return 'home';
  if (!pathname.startsWith(base)) return 'home';
  const relative = pathname.slice(base.length).replace(/\/+$/, '');
  if (relative === 'order' || relative.startsWith('order/')) return 'order';
  // Hash-based protected workspaces include nested routes such as
  // #/restaurant/rider and #/restaurant/cashier/sales. On refresh the full
  // fragment is normalized into this path, so match the workspace prefix.
  if (relative === 'restaurant' || relative.startsWith('restaurant/')) return 'restaurant';
  if (relative === 'admin' || relative.startsWith('admin/')) return 'admin';
  return 'home';
}

/** Convert supported hash routes into the internal path shape used by page selection. */
export function routePathFromLocation(pathname: string, hash: string, baseUrl: string): string {
  const fragment = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (/^(order|account|restaurant|admin|payment)(\/|$)/.test(fragment)) {
    return normalizeAppBase(baseUrl) + fragment;
  }
  return pathname;
}

/** Hash URL builders keep customer routes independent of server-side path rewrites. */
export function restaurantMenuHash(slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid restaurant slug');
  return '#order/' + slug;
}
export function storefrontCartHash(slug: string): string {
  return restaurantMenuHash(slug) + '/cart';
}
export function storefrontCheckoutHash(slug: string): string {
  return restaurantMenuHash(slug) + '/checkout';
}
\nexport function storefrontTrackingHash(slug: string): string { return restaurantMenuHash(slug) + '/track'; }\n