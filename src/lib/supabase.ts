import { createClient } from '@supabase/supabase-js';
import { readPublicConfig } from './config';

const config = readPublicConfig(import.meta.env);

/**
 * Keep each browser tab's Supabase session isolated.
 *
 * localStorage + Supabase's default storage key shares one auth session across
 * same-origin tabs, so signing in/out as staff, owner, or customer can replace
 * the other tab's session. A tab-scoped ID gives each tab its own auth storage
 * key, while sessionStorage preserves that tab's session across refreshes.
 *
 * Do not use this as an authorization boundary: server-side policies and RLS
 * must still enforce user and tenant permissions.
 */
function getTabAuthStorage(): { storage: Storage | { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }; storageKey: string } | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const storage = window.sessionStorage;
    let tabId = storage.getItem('web2table.auth.tab-id');
    if (!tabId) {
      tabId = typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      storage.setItem('web2table.auth.tab-id', tabId);
    }
    return { storage, storageKey: `web2table.auth.${tabId}` };
  } catch {
    // If browser storage is blocked, use memory only. Never fall back to
    // localStorage, which would reintroduce cross-tab session sharing.
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const tabId = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return { storage, storageKey: `web2table.auth.${tabId}` };
  }
}

const tabAuth = getTabAuthStorage();

/** Public browser client only. Never use secret keys or bypass RLS here. */
export const supabase = config
  ? createClient(config.url, config.publishableKey, {
      auth: {
        ...(tabAuth ? { storage: tabAuth.storage, storageKey: tabAuth.storageKey } : {}),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
