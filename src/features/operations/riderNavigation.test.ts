import { describe, expect, it } from 'vitest';
import { buildRiderNavigationUrls } from './riderNavigation';
describe('buildRiderNavigationUrls', () => {
  it('uses exact saved coordinates in both apps', () => {
    const urls=buildRiderNavigationUrls(14.5995,120.9842);
    expect(urls?.waze).toBe('https://www.waze.com/ul?ll=14.5995%2C120.9842&navigate=yes');
    expect(urls?.googleMaps).toBe('https://www.google.com/maps/dir/?api=1&destination=14.5995%2C120.9842');
  });
  it('rejects missing or invalid coordinates', () => {
    expect(buildRiderNavigationUrls(null,null)).toBeNull();
    expect(buildRiderNavigationUrls(91,120)).toBeNull();
    expect(buildRiderNavigationUrls(14,181)).toBeNull();
  });
});
