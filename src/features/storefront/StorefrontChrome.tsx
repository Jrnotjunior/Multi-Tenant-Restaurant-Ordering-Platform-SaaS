import type { ReactNode } from 'react';

type StorefrontHeaderProps = {
  logo: ReactNode;
  actions: ReactNode;
};

export function StorefrontHeader({ logo, actions }: StorefrontHeaderProps) {
  return (
    <header className="sf-header">
      <div className="sf-header-inner">
        {logo}
        <nav className="sf-header-actions" aria-label="Store navigation">
          {actions}
        </nav>
      </div>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <section className="sf-footer-social-section" aria-label="Follow Web2Table">
          <h2 className="sf-footer-heading">Follow Us</h2>
          <nav className="sf-footer-socials" aria-label="Social media links">
            <span className="sf-footer-social-link is-disabled" aria-label="Facebook not configured" aria-disabled="true">
              <img className="sf-footer-social-logo" src={`${import.meta.env.BASE_URL}social-facebook.svg`} alt="" />
            </span>
            <span className="sf-footer-social-link is-disabled" aria-label="Instagram not configured" aria-disabled="true">
              <img className="sf-footer-social-logo" src={`${import.meta.env.BASE_URL}social-instagram.svg`} alt="" />
            </span>
            <span className="sf-footer-social-link is-disabled" aria-label="TikTok not configured" aria-disabled="true">
              <img className="sf-footer-social-logo" src={`${import.meta.env.BASE_URL}social-tiktok.svg`} alt="" />
            </span>
          </nav>
        </section>
        <div className="sf-footer-bottom">
          <small>© {new Date().getFullYear()} All rights reserved.</small>
          <div className="sf-footer-powered-by-wrap">
            <a className="sf-footer-powered-by" href="https://web2table.io/" target="_blank" rel="noreferrer" aria-label="Powered by Web2Table">
              <span>Powered by</span>
              <img src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table1.png" alt="Web2Table" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
