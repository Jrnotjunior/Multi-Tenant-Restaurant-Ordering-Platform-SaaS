import { describe, expect, it } from 'vitest';
import { userDisplayName } from '../src/domain/userDisplayName';

describe('userDisplayName', () => {
  it('prefers a configured preferred name', () => {
    expect(userDisplayName({ email: 'user@example.com', user_metadata: { preferred_name: 'Jorel' } })).toBe('Jorel');
  });
  it('uses full name or first and last name metadata', () => {
    expect(userDisplayName({ user_metadata: { full_name: 'Maria Santos' } })).toBe('Maria Santos');
    expect(userDisplayName({ user_metadata: { first_name: 'Juan', last_name: 'Dela Cruz' } })).toBe('Juan Dela Cruz');
  });
  it('never displays an email or email prefix as a name', () => {
    expect(userDisplayName({ email: 'jorel@example.com', user_metadata: { name: 'jorel@example.com' } }, 'Rider')).toBe('Rider');
    expect(userDisplayName({ email: 'jorel@example.com' }, 'Rider')).toBe('Rider');
  });
});
