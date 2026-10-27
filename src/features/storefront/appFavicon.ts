import { supabase } from '../../lib/supabase';

const FAVICON_STORAGE_KEY = 'web2table:active-favicon';
const ACTIVE_STOREFRONT_SLUG_KEY = 'web2table:active-storefront-slug';

function getManagedFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[data-web2table-favicon="true"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.dataset.web2tableFavicon = 'true';
    document.head.appendChild(link);
  }
  return link;
}

/** Apply a tenant favicon using one persistent link shared by all SPA routes. */
export function applyAppFavicon(url: string, persist = true): void {
  if (!url || typeof url !== 'string') return;
  const link = getManagedFaviconLink();
  link.href = url;
  if (/\.ico(?:$|[?#])/i.test(url)) link.type = 'image/x-icon';
  else link.removeAttribute('type');
  if (persist) {
    try {
      window.sessionStorage.setItem(FAVICON_STORAGE_KEY, url);
    } catch {
      // The favicon still applies for this page even when session storage is unavailable.
    }
  }
}

/** Restore the active restaurant favicon after a full page reload. */
export function restoreAppFavicon(): void {
  try {
    const url = window.sessionStorage.getItem(FAVICON_STORAGE_KEY);
    if (url) applyAppFavicon(url, false);
  } catch {
    // Favicon restoration is best-effort and must not block app startup.
  }
}

/** Clear a previous tenant icon when the newly loaded tenant has no favicon. */
export function clearAppFavicon(): void {
  document.querySelector<HTMLLinkElement>('link[data-web2table-favicon="true"]')?.remove();
  try {
    window.sessionStorage.removeItem(FAVICON_STORAGE_KEY);
  } catch {
    // Clearing the visible link is still useful if session storage is unavailable.
  }
}

export function rememberActiveStorefrontSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
  try { window.sessionStorage.setItem(ACTIVE_STOREFRONT_SLUG_KEY, slug); } catch { /* best effort */ }
}

export function getRememberedStorefrontSlug(): string | null {
  try {
    const slug = window.sessionStorage.getItem(ACTIVE_STOREFRONT_SLUG_KEY);
    return slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
  } catch { return null; }
}

export async function syncAppFaviconForSlug(slug: string): Promise<void> {
  rememberActiveStorefrontSlug(slug);
  if (!supabase) return;
  const { data, error } = await supabase.rpc('get_public_storefront_favicon', { p_slug: slug });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { faviconPath?: unknown; favicon_path?: unknown } | null;
  const path = row?.faviconPath ?? row?.favicon_path;
  if (path == null || path === '') { clearAppFavicon(); return; }
  if (typeof path !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp|ico)$/.test(path)) throw new Error('Invalid published restaurant favicon path');
  const url = supabase.storage.from('storefront-logos').getPublicUrl(path).data.publicUrl;
  applyAppFavicon(url);
}
