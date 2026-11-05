import { useEffect, useState, type CSSProperties } from 'react';
import { getRememberedStorefrontSlug } from './appFavicon';
import { loadDefaultPublishedMenu, loadPublishedMenu } from './publishedMenu';
import type { WebsiteColors } from './publishedMenu';

type CustomerTheme = { style: CSSProperties; fontClass: string; isLoading: boolean };

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

export function useCustomerStorefrontTheme(restaurantSlug?: string | null): CustomerTheme {
  const [theme, setTheme] = useState<CustomerTheme>({ style: {}, fontClass: ' sf-font-modern', isLoading: true });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const slug = restaurantSlug || getRememberedStorefrontSlug();
        const catalog = slug
          ? await loadPublishedMenu(slug)
          : (await loadDefaultPublishedMenu())?.catalog ?? null;
        if (!active) return;
        if (!catalog) { setTheme(current => ({ ...current, isLoading: false })); return; }
        const fontClass = catalog.restaurant.fontFamily === 'classic'
          ? ' sf-font-classic'
          : catalog.restaurant.fontFamily === 'rounded'
            ? ' sf-font-rounded'
            : ' sf-font-modern';
        setTheme({ style: toStorefrontStyle(catalog.restaurant.websiteColors), fontClass, isLoading: false });
      } catch {
        // Keep the public account usable with storefront defaults if theme lookup fails.
        if (active) setTheme(current => ({ ...current, isLoading: false }));
      }
    })();
    return () => { active = false; };
  }, [restaurantSlug]);

  return theme;
}
