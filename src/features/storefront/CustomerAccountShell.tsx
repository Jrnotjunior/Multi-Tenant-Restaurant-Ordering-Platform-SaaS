import type { ReactNode } from 'react';
import { useCustomerStorefrontTheme } from './useCustomerStorefrontTheme';
import { StorefrontFooter, StorefrontHeader } from './StorefrontChrome';
import { CustomerAccountLoading } from './CustomerAccountLoading';
import './storefront.css';

export function CustomerAccountShell({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const { style, fontClass, isLoading, logoUrl, restaurantName, restaurantInitials } = useCustomerStorefrontTheme();
  if (isLoading) return <CustomerAccountLoading />;
  return <div className={"sf-storefront sf-account-page sf-customer-account-shell" + fontClass} style={style}>
    <a className="sf-skip-link" href="#customer-account-content">Skip to account content</a>
    <StorefrontHeader
      logo={<a href={baseUrl} className="sf-logo" aria-label={(restaurantName ?? 'Restaurant') + ' storefront'}>
        {logoUrl ? <img className="sf-logo-image" src={logoUrl} alt={(restaurantName ?? 'Restaurant') + ' logo'} width={46} height={46} /> : <span className="sf-logo-mark">{restaurantInitials ?? 'R'}</span>}
      </a>}
      actions={<a href={baseUrl + '#/cart'} className="sf-bag-button" aria-label="Open cart" title="Cart"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 4.5h2l2.1 10.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 1.9-1.4L21 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg></a>}
    />
    <div id="customer-account-content" className="sf-customer-account-content">{children}</div>
    <StorefrontFooter />
  </div>;
}
