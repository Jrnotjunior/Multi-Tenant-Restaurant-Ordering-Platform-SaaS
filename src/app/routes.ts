/** Vite BASE_URL: '/' locally, '/<repo>/' on GitHub Pages. */
export type View = 'home' | 'order' | 'restaurant' | 'admin';

export function normalizeAppBase(baseUrl: string): string {
  const base = baseUrl.trim();
  if (!base.startsWith('/') || base.startsWith('//') || base.includes('?') || base.includes('#')) {
    throw new Error('Application base URL must be a root-relative path.');
  }
  return base.endsWith('/') ? base : base + '/';
}

export function pathFor(view: View, baseUrl: string): string {
  const base = normalizeAppBase(baseUrl);
  return view === 'home' ? base : base + view;
}

export function viewForPath(pathname: string, baseUrl: string): View {
  const base = normalizeAppBase(baseUrl);
  if (pathname === base.slice(0, -1)) return 'home';
  if (!pathname.startsWith(base)) return 'home';
  const relative = pathname.slice(base.length).replace(/\/+$/, '');
  if (relative === 'order' || relative === 'restaurant' || relative === 'admin') return relative;
  return 'home';
}
