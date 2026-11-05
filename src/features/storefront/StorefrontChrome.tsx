import { useEffect, useState, type ReactNode } from 'react';
import { getRememberedStorefrontSlug } from './appFavicon';
import { loadDefaultPublishedMenu, loadPublishedMenu, type StorefrontSocialLinks } from './publishedMenu';

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
  return (
    <a className="sf-account-back-link" href={href} aria-label="Back" title="Back">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19 12H5m7 7-7-7 7-7" />
      </svg>
    </a>
  );
}

const EMPTY_SOCIAL_LINKS: StorefrontSocialLinks = { facebook: '', instagram: '', tiktok: '' };

export function StorefrontFooter({ socialLinks }: { socialLinks?: StorefrontSocialLinks }) {
  const [resolvedSocialLinks, setResolvedSocialLinks] = useState<StorefrontSocialLinks>(socialLinks ?? EMPTY_SOCIAL_LINKS);

  useEffect(() => {
    if (socialLinks) {
      setResolvedSocialLinks(socialLinks);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const slug = getRememberedStorefrontSlug();
        const catalog = slug ? await loadPublishedMenu(slug) : (await loadDefaultPublishedMenu())?.catalog ?? null;
        if (active) setResolvedSocialLinks(catalog?.restaurant.socialLinks ?? EMPTY_SOCIAL_LINKS);
      } catch {
        // Footer links are optional; a lookup failure must never block account pages.
        if (active) setResolvedSocialLinks(EMPTY_SOCIAL_LINKS);
      }
    })();
    return () => { active = false; };
  }, [socialLinks]);

  const links = [
    { key: 'facebook', label: 'Facebook', url: resolvedSocialLinks.facebook, icon: 'social-facebook.svg' },
    { key: 'instagram', label: 'Instagram', url: resolvedSocialLinks.instagram, icon: 'social-instagram.svg' },
    { key: 'tiktok', label: 'TikTok', url: resolvedSocialLinks.tiktok, icon: 'social-tiktok.svg' },
  ] as const;
  return (
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <section className="sf-footer-social-section" aria-label="Follow us on social media">
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
