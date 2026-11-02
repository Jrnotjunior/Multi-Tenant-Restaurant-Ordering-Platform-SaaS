import { describe, expect, it } from 'vitest';
import { buildRiderNavigationUrls } from './riderNavigation';
describe('buildRiderNavigationUrls', () => {
  it('uses exact saved coordinates for Google Maps', () => {
    const urls=buildRiderNavigationUrls(14.5995,120.9842);
    expect(urls?.googleMaps).toBe('https://www.google.com/maps/dir/?api=1&destination=14.5995%2C120.9842');
  });
  it('falls back to the delivery address when coordinates are unavailable', () => {
    const urls=buildRiderNavigationUrls(null,null,'123 Main Street, Valenzuela City');
    expect(urls?.googleMaps).toBe('https://www.google.com/maps/dir/?api=1&destination=123%20Main%20Street%2C%20Valenzuela%20City');
  });
  it('rejects missing coordinates and address, or invalid coordinates without an address', () => {
    expect(buildRiderNavigationUrls(null,null)).toBeNull();
    expect(buildRiderNavigationUrls(91,120)).toBeNull();
    expect(buildRiderNavigationUrls(14,181)).toBeNull();
  });
});
