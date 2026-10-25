export type UserNameSource = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** Return a human name only; never use an email address or email prefix as a display name. */
export function userDisplayName(user: UserNameSource | null | undefined, fallback = 'Account'): string {
  const metadata = user?.user_metadata ?? {};
  const candidates = [
    metadata.preferred_name,
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    [metadata.first_name, metadata.last_name].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' '),
    metadata.first_name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const name = candidate.trim().replace(/\s+/g, ' ');
    if (name && !name.includes('@')) return name;
  }
  return fallback;
}
