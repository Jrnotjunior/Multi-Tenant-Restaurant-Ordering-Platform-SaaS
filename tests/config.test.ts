import { describe, expect, it } from 'vitest';
import { readPublicConfig } from '../src/lib/config';
describe('browser environment configuration', () => {
  it('fails closed when values are missing', () => expect(readPublicConfig({})).toBeNull());
  it('rejects non-HTTPS external URLs', () => expect(readPublicConfig({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk' })).toBeNull());
  it('accepts a configured HTTPS project', () => expect(readPublicConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk' })?.publishableKey).toBe('pk'));
});
