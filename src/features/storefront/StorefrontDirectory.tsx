import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase, restaurantMenuPath } from '../../app/routes';
import { publicStorefrontLogo } from '../management/menuService';

type DirectoryEntry = {
  slug: string;
  name: string;
  tagline: string;
  logoPath: string | null;
  branchName: string;
  branchSlug: string;
  acceptingOrders: boolean;
  itemCount: number;
};
type Theme = { pageBackground:string; headerColor:string; footerBackground:string; footerFont:string; fontColor:string; primaryButton:string; primaryButtonFont:string; secondaryButton:string; secondaryButtonFont:string };
const THEME_KEYS: Array<keyof Theme> = ['pageBackground','headerColor','footerBackground','footerFont','fontColor','primaryButton','primaryButtonFont','secondaryButton','secondaryButtonFont'];
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseDirectory(value: unknown): DirectoryEntry[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('The restaurant directory returned an invalid response.');
  const used = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
      || typeof entry.name !== 'string' || entry.name.trim().length < 2 || entry.name.length > 160
      || typeof entry.tagline !== 'string' || entry.tagline.length > 300
      || (entry.logoPath !== null && entry.logoPath !== undefined && typeof entry.logoPath !== 'string')
      || typeof entry.branchName !== 'string' || typeof entry.branchSlug !== 'string'
      || typeof entry.acceptingOrders !== 'boolean' || !Number.isSafeInteger(entry.itemCount)
      || (entry.itemCount as number) < 0 || used.has(entry.slug)) {
      throw new Error('The restaurant directory contains invalid data.');
    }
    used.add(entry.slug);
    return {
      slug: entry.slug, name: entry.name, tagline: entry.tagline,
      logoPath: typeof entry.logoPath === 'string' ? entry.logoPath : null,
      branchName: entry.branchName, branchSlug: entry.branchSlug,
      acceptingOrders: entry.acceptingOrders, itemCount: entry.itemCount as number,
    };
  });
}
function parseTheme(value: unknown): Theme | null {
  if (!isRecord(value)) return null;
  for (const key of THEME_KEYS) {
    if (typeof value[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value[key] as string)) return null;
  }
  return value as Theme;
}

export function StorefrontDirectory({ baseUrl }: { baseUrl: string }) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const base = normalizeAppBase(baseUrl);

  useEffect(() => {
    let current = true;
    async function load() {
      if (!supabase) {
        setError('The restaurant directory is temporarily unavailable. Please refresh the page.');
        setLoading(false);
        return;
      }
      try {
        const [{ data: directoryData, error: directoryError }, { data: themeData, error: themeError }] = await Promise.all([
          supabase.rpc('get_public_storefront_directory'),
          supabase.from('platform_theme_defaults').select('website_colors').eq('id', 1).maybeSingle(),
        ]);
        if (directoryError) throw directoryError;
        const parsed = parseDirectory(directoryData);
        const rawColors = themeError ? null : themeData?.website_colors;
        const parsedTheme = parseTheme(rawColors);
        if (current) {
          setEntries(parsed);
          setTheme(parsedTheme);
          setError('');
        }
      } catch (reason) {
        if (current) setError(reason instanceof Error ? reason.message : 'The restaurant directory is temporarily unavailable.');
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, []);

  const style = theme ? {
    '--directory-page': theme.pageBackground,
    '--directory-header': theme.headerColor,
    '--directory-footer': theme.footerBackground,
    '--directory-footer-font': theme.footerFont,
    '--directory-text': theme.fontColor,
    '--directory-primary': theme.primaryButton,
    '--directory-primary-font': theme.primaryButtonFont,
    '--directory-secondary': theme.secondaryButton,
    '--directory-secondary-font': theme.secondaryButtonFont,
  } as CSSProperties : undefined;

  return <div className="sf-directory" style={style}>
    <header className="sf-directory-header">
      <a className="sf-directory-brand" href={base} aria-label="Web2Table home"><span className="sf-directory-logo">W2T</span><strong>Web2Table</strong></a>
      <nav className="sf-directory-nav" aria-label="Account navigation">
        <div className="sf-account-wrap">
          <button type="button" className="sf-account-button" aria-label="Your account" title="Your account" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-3.6 3.2-5.5 7-5.5s6.5 1.9 7 5.5"/></svg>
          </button>
          {accountMenuOpen && <div className="sf-account-menu" role="menu" aria-label="Your account">
            <div className="sf-account-menu-heading"><strong>Your account</strong><span>Sign in or review our policies.</span></div>
            <a role="menuitem" href={base + 'legal'} onClick={() => setAccountMenuOpen(false)}>Legal &amp; Policies</a>
            <a role="menuitem" href={base + 'account/sign-in'} onClick={() => setAccountMenuOpen(false)}>Sign in</a>
            <a role="menuitem" href={base + 'account/sign-up'} onClick={() => setAccountMenuOpen(false)}>Sign up</a>
          </div>}
        </div>
      </nav>
    </header>

    <main className="sf-directory-main">
      <section className="sf-directory-intro">
        <span className="sf-directory-kicker">WEB2TABLE STOREFRONT</span>
        <h1>Find your restaurant</h1>
        <p>Browse restaurants and open their menus. Each restaurant maintains its own menu, availability, and branding.</p>
      </section>

      {loading && <div className="sf-directory-state" role="status"><span className="sf-directory-spinner" aria-hidden="true"/><p>Loading published restaurants…</p></div>}
      {!loading && error && <div className="sf-directory-state is-error" role="alert"><h2>Restaurants couldn’t be loaded</h2><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Refresh directory</button></div>}
      {!loading && !error && entries.length === 0 && <div className="sf-directory-state"><span className="sf-directory-empty-art" aria-hidden="true">🍽️</span><h2>No restaurants published yet</h2><p>When a restaurant owner publishes their storefront, it will appear here. Owners can sign in from the account menu.</p></div>}
      {!loading && !error && entries.length > 0 && <div className="sf-directory-grid">
        {entries.map(entry => <article className="sf-directory-card" key={entry.slug}>
          <div className="sf-directory-card-brand">
            {entry.logoPath && publicStorefrontLogo(entry.logoPath)
              ? <img src={publicStorefrontLogo(entry.logoPath) ?? ''} alt="" className="sf-directory-card-logo"/>
              : <span className="sf-directory-card-logo is-placeholder">{entry.name.split(/\s+/).slice(0,2).map(word => word.charAt(0)).join('').toUpperCase()}</span>}
            <span className={'sf-directory-open ' + (entry.acceptingOrders ? 'is-open' : '')}>{entry.acceptingOrders ? 'Accepting orders' : 'Menu browsing'}</span>
          </div>
          <h2>{entry.name}</h2>
          <p className="sf-directory-tagline">{entry.tagline || 'View restaurant menu and details.'}</p>
          <div className="sf-directory-card-meta"><span>{entry.branchName}</span><span>{entry.itemCount} {entry.itemCount === 1 ? 'item' : 'items'}</span></div>
          {entry.itemCount === 0 && <p className="sf-directory-coming-soon">This restaurant is preparing its menu. Check back soon.</p>}
          <a className="sf-directory-open-menu" href={restaurantMenuPath(entry.slug, baseUrl) + '?branch=' + encodeURIComponent(entry.branchSlug)}>View menu <span aria-hidden="true">→</span></a>
        </article>)}
      </div>}
    </main>

    <footer className="sf-directory-footer"><strong>Web2Table</strong><span>Restaurant ordering, one menu at a time.</span><a href={base + 'legal'}>Legal &amp; Policies</a></footer>
  </div>;
}
