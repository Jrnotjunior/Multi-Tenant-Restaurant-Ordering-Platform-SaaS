import type { ReactNode } from 'react';

type StorefrontSocialLinks = Readonly<{facebook:string;instagram:string;tiktok:string}>;

type StorefrontHeaderProps = {
  logo: ReactNode;
  actions?: ReactNode;
};

export function StorefrontHeader({ logo, actions }: StorefrontHeaderProps) {
  return (
    <header className="sf-header">
      <div className="sf-header-inner">
        {logo}
        {actions != null && (
          <nav className="sf-header-actions" aria-label="Store navigation">
            {actions}
          </nav>
        )}
      </div>
    </header>
  );
}

export function CustomerAccountBackLink({ href }: { href: string }) {
  return <a className="sf-account-back-link" href={href}>&larr; Back</a>;
}

export function StorefrontFooter({ socialLinks = { facebook: '', instagram: '', tiktok: '' } }: { socialLinks?: StorefrontSocialLinks }) {
  const links = [
    { key: 'facebook', label: 'Facebook', url: socialLinks.facebook, icon: 'social-facebook.svg' },
    { key: 'instagram', label: 'Instagram', url: socialLinks.instagram, icon: 'social-instagram.svg' },
    { key: 'tiktok', label: 'TikTok', url: socialLinks.tiktok, icon: 'social-tiktok.svg' },
  ] as const;
  return (
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <section className="sf-footer-social-section" aria-label="Follow Web2Table">
          <h2 className="sf-footer-heading">Follow Us</h2>
          <nav className="sf-footer-socials" aria-label="Social media links">
            {links.filter(link => link.url).map(link => (
              <a key={link.key} className="sf-footer-social-link" href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit our ${link.label} page (opens in a new tab)`}>
                <img className="sf-footer-social-logo" src={`${import.meta.env.BASE_URL}${link.icon}`} alt="" />
              </a>
            ))}
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
