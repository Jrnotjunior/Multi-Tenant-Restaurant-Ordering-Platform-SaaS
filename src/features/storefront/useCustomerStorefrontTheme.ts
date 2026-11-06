import { useEffect, useState, type CSSProperties } from 'react';
import { getRememberedStorefrontSlug } from './appFavicon';
import { loadDefaultPublishedMenu, loadPublishedMenu } from './publishedMenu';
import type { WebsiteColors } from './publishedMenu';

type CustomerTheme = { style: CSSProperties; fontClass: string; isLoading: boolean; logoUrl: string | null; restaurantName: string | null; restaurantInitials: string | null };

const DEFAULT_THEME: CustomerTheme = {
  style: {},
  fontClass: ' sf-font-modern',
  isLoading: false,
  logoUrl: null,
  restaurantName: null,
  restaurantInitials: null,
};

// Account routes mount different page components. Cache the resolved tenant theme
// so changing between those hash routes does not reload the shared storefront chrome.
const themeCache = new Map<string, CustomerTheme>();
const themeRequests = new Map<string, Promise<CustomerTheme>>();

function toStorefrontStyle(colors: WebsiteColors): CSSProperties {
  return {
    '--sf-page-background': colors.pageBackground,
    '--sf-header-color': colors.headerColor,
    '--sf-footer-background': colors.footerBackground,
    '--sf-footer-font': colors.footerFont,
    '--sf-hero-color': colors.heroColor,
    '--sf-hero-font-color': colors.heroFontColor,
    '--sf-product-card': colors.productCard,
    '--sf-font-color': colors.fontColor,
    '--sf-header-icon': colors.headerIcon,
    '--sf-primary-button': colors.primaryButton,
    '--sf-primary-button-font': colors.primaryButtonFont,
    '--sf-secondary-button': colors.secondaryButton,
    '--sf-secondary-button-font': colors.secondaryButtonFont,
    '--sf-red': colors.primaryButton,
    '--sf-red-dark': colors.secondaryButton,
  } as CSSProperties;
}

function themeKey(restaurantSlug?: string | null): string {
  return restaurantSlug || getRememberedStorefrontSlug() || '__default_storefront__';
}

/** Prime the account shell with the catalog already loaded by the active storefront. */
export function primeCustomerStorefrontTheme(restaurantSlug: string, catalog: import('./publishedMenu').StorefrontCatalog): void {
  if (!restaurantSlug) return;
  const fontClass = catalog.restaurant.fontFamily === 'classic'
    ? ' sf-font-classic'
    : catalog.restaurant.fontFamily === 'rounded'
      ? ' sf-font-rounded'
      : ' sf-font-modern';
  themeCache.set(restaurantSlug, {
    style: toStorefrontStyle(catalog.restaurant.websiteColors),
    fontClass,
    isLoading: false,
    logoUrl: catalog.restaurant.logoUrl,
    restaurantName: catalog.restaurant.name,
    restaurantInitials: catalog.restaurant.initials,
  });
}

async function resolveTheme(key: string, restaurantSlug?: string | null): Promise<CustomerTheme> {
  const cached = themeCache.get(key);
  if (cached) return cached;
  const pending = themeRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const slug = restaurantSlug || (key === '__default_storefront__' ? null : key);
      const catalog = slug
        ? await loadPublishedMenu(slug)
        : (await loadDefaultPublishedMenu())?.catalog ?? null;
      if (!catalog) return DEFAULT_THEME;
      const fontClass = catalog.restaurant.fontFamily === 'classic'
        ? ' sf-font-classic'
        : catalog.restaurant.fontFamily === 'rounded'
          ? ' sf-font-rounded'
          : ' sf-font-modern';
      return {
        style: toStorefrontStyle(catalog.restaurant.websiteColors),
        fontClass,
        isLoading: false,
        logoUrl: catalog.restaurant.logoUrl,
        restaurantName: catalog.restaurant.name,
        restaurantInitials: catalog.restaurant.initials,
      };
    } catch {
      // Keep the public account usable with storefront defaults if theme lookup fails.
      return DEFAULT_THEME;
    }
  })();

  themeRequests.set(key, request);
  const resolved = await request;
  themeCache.set(key, resolved);
  themeRequests.delete(key);
  return resolved;
}

export function useCustomerStorefrontTheme(restaurantSlug?: string | null): CustomerTheme {
  const key = themeKey(restaurantSlug);
  const [theme, setTheme] = useState<CustomerTheme>(() => themeCache.get(key) ?? {
    ...DEFAULT_THEME,
    isLoading: !themeCache.has(key),
  });

  useEffect(() => {
    let active = true;
    const cached = themeCache.get(key);
    if (cached) {
      setTheme(cached);
      return () => { active = false; };
    }
    setTheme(current => ({ ...current, isLoading: true }));
    void resolveTheme(key, restaurantSlug).then(resolved => {
      if (active) setTheme(resolved);
    });
    return () => { active = false; };
  }, [key, restaurantSlug]);

  return theme;
}
