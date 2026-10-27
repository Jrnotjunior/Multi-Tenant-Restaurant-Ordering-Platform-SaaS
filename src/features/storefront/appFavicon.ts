const FAVICON_STORAGE_KEY = 'web2table:active-favicon';

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
  if (/\\.ico(?:$|[?#])/i.test(url)) link.type = 'image/x-icon';
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
