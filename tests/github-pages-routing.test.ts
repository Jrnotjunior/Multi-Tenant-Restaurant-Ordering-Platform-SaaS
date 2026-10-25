import { describe, expect, it } from 'vitest';
import { pathFor, routePathFromLocation, viewForPath } from '../src/app/routes';
const base = '/Multi-Tenant-Restaurant-Ordering-Platform-SaaS/';

describe('GitHub Pages project-site paths', () => {
  it('uses the repository path for all sections', () => {
    expect(pathFor('home', base)).toBe(base);
    expect(pathFor('order', base)).toBe(base + 'order');
    expect(pathFor('restaurant', base)).toBe(base + 'restaurant');
    expect(pathFor('admin', base)).toBe(base + 'admin');
  });
  it('restores refreshed paths', () => {
    expect(viewForPath(base, base)).toBe('home');
    expect(viewForPath(base.slice(0, -1), base)).toBe('home');
    expect(viewForPath(base + 'order', base)).toBe('order');
    expect(viewForPath(base + 'restaurant/', base)).toBe('restaurant');
    expect(viewForPath(base + 'admin', base)).toBe('admin');
  });
  it('restores every nested restaurant workplace from its hash route', () => {
    const workplaceRoutes = [
      '#/restaurant/rider',
      '#/restaurant/dispatcher',
      '#/restaurant/cashier',
      '#/restaurant/cashier/sales',
      '#/restaurant/kitchen',
      '#/restaurant/kitchen/menu',
    ];
    for (const hash of workplaceRoutes) {
      const resolved = routePathFromLocation(base, hash, base);
      expect(viewForPath(resolved, base), hash).toBe('restaurant');
    }
  });
  it('restores nested workplace routes on a root domain too', () => {
    for (const hash of ['#/restaurant/rider', '#/restaurant/dispatcher', '#/restaurant/cashier/sales', '#/restaurant/kitchen/menu']) {
      expect(viewForPath(routePathFromLocation('/', hash, '/'), '/'), hash).toBe('restaurant');
    }
  });
  it('does not accept paths from another project', () => {
    expect(viewForPath('/other-project/restaurant', base)).toBe('home');
    expect(viewForPath(base + 'other/restaurant', base)).toBe('home');
  });
  it('also supports a root domain', () => {
    expect(pathFor('restaurant', '/')).toBe('/restaurant');
    expect(viewForPath('/restaurant', '/')).toBe('restaurant');
  });
});
