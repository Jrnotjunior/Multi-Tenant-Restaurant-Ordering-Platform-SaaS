import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  geocodingFeatureToAddress,
  isGeoapifyAddressSearchConfigured,
  matchesRequestedHouseNumber,
  requestedHouseNumber,
  resultHouseNumber,
  searchAddresses,
} from './locationService';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('house-number verification', () => {
  it('extracts a leading house number including suffixes and ranges', () => {
    expect(requestedHouseNumber('  12B Rizal Street, Manila')).toBe('12B');
    expect(requestedHouseNumber('14-16 Mabini Road')).toBe('14-16');
    expect(requestedHouseNumber('No. 47-A Rizal Street')).toBe('47-A');
    expect(requestedHouseNumber('No.47-C Kalayaan Avenue')).toBe('47-C');
    expect(requestedHouseNumber('# 12/3B Mabini Road')).toBe('12/3B');
    expect(requestedHouseNumber('Rizal Street, Manila')).toBe('');
  });

  it('requires the returned house number to match the requested one', () => {
    expect(matchesRequestedHouseNumber('12B Rizal Street', '12b')).toBe(true);
    expect(matchesRequestedHouseNumber('No. 47-A Rizal Street', '47-A')).toBe(true);
    expect(matchesRequestedHouseNumber('No. 47-C Kalayaan Avenue', resultHouseNumber({ unit: 'No. 47-C', result_type: 'building' }))).toBe(true);
    expect(resultHouseNumber({ unit: 'No. 47-C', result_type: 'street' })).toBe('');
    expect(resultHouseNumber({ housenumber: '47-C', result_type: 'street' })).toBe('');
    expect(resultHouseNumber({ housenumber: '47-C', result_type: 'building', rank: { match_type: 'match_by_street' } })).toBe('');
    expect(resultHouseNumber({ unit: 'Unit 3' })).toBe('');
    expect(matchesRequestedHouseNumber('12 Rizal Street', '12A')).toBe(false);
    expect(matchesRequestedHouseNumber('12 Rizal Street', undefined)).toBe(false);
    expect(matchesRequestedHouseNumber('Rizal Street', '12')).toBe(false);
  });
});

describe('address search provider', () => {
  it('uses Geoapify autocomplete, preserves number-like units, and keeps street-only matches unverified', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-public-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'geoapify-place-1',
        geometry: { type: 'Point', coordinates: [121.04, 14.65] },
        properties: {
          name: 'Kalayaan Avenue',
          unit: 'No. 47-C',
          street: 'Kalayaan Avenue',
          address_line1: 'Kalayaan Avenue',
          address_line2: 'Pinyahan, Quezon City, Philippines',
          formatted: 'Kalayaan Avenue, Pinyahan, Quezon City, Philippines',
          result_type: 'street',
          country: 'Philippines',
          country_code: 'ph',
          place_id: 'geoapify-place-1',
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const query = 'No. 47-C Kalayaan Avenue, Quezon City';
    const results = await searchAddresses(query);
    const address = geocodingFeatureToAddress(results[0]);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestUrl.origin).toBe('https://api.geoapify.com');
    expect(requestUrl.pathname).toBe('/v1/geocode/autocomplete');
    expect(requestUrl.searchParams.get('text')).toBe(query);
    expect(requestUrl.searchParams.get('filter')).toBe('countrycode:ph');
    expect(requestUrl.searchParams.get('apiKey')).toBe('test-public-key');
    expect(isGeoapifyAddressSearchConfigured()).toBe(true);
    expect(matchesRequestedHouseNumber(query, resultHouseNumber(results[0].properties))).toBe(false);
    expect(address).toMatchObject({
      address: '47-C Kalayaan Avenue',
      formattedAddress: '47-C Kalayaan Avenue, Pinyahan, Quezon City, Philippines',
      placeId: 'geoapify-place-1',
      latitude: 14.65,
      longitude: 121.04,
    });
  });

  it('keeps Photon search available when Geoapify is not configured', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{
        type: 'Feature',
        id: 'osm-1',
        geometry: { type: 'Point', coordinates: [121.04, 14.65] },
        properties: { name: 'Kalayaan Avenue', street: 'Kalayaan Avenue', city: 'Quezon City', country: 'Philippines' },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAddresses('Kalayaan Avenue, Quezon City');
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(isGeoapifyAddressSearchConfigured()).toBe(false);
    expect(requestUrl.hostname).toBe('photon.komoot.io');
    expect(results).toHaveLength(1);
  });
});
