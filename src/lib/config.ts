export type PublicConfig = { url: string; publishableKey: string };
export function readPublicConfig(env: Record<string, string | undefined>): PublicConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') return null;
  } catch { return null; }
  return { url, publishableKey };
}
