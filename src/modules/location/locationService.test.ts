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
  it('uses Mapbox Geocoding v6 with supported feature types', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'test-mapbox-token' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        features: [{
          id: 'mapbox-address-1',
          geometry: { type: 'Point', coordinates: [121.04, 14.65] },
          properties: {
            mapbox_id: 'mapbox-address-1',
            feature_type: 'address',
            name: 'J. Martin Street',
            address: 'Unit V5, J. Martin Street',
            address_number: 'V5',
            street: 'J. Martin Street',
            full_address: 'Unit V5, Red Gate, White Apartment, J. Martin Street, Valenzuela, Philippines',
            country_code: 'ph',
            context: {
              place: { name: 'Valenzuela' },
              neighborhood: { name: 'Dalandanan' },
              country: { name: 'Philippines' },
              region: { name: 'Metro Manila' },
            },
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAddresses('Unit V5, Red Gate, White Apartment, J. Martin Street');
    const requestUrl = new URL(String(fetchMock.mock.calls[1][0]));
    const address = geocodingFeatureToAddress(results[0]);

    expect(requestUrl.origin).toBe('https://api.mapbox.com');
    expect(requestUrl.pathname).toBe('/search/geocode/v6/forward');
    expect(requestUrl.searchParams.get('types')).toBe('address,street,locality,neighborhood,place,district');
    expect(requestUrl.searchParams.get('types')).not.toContain('poi');
    expect(requestUrl.searchParams.get('country')).toBe('PH');
    expect(address).toMatchObject({
      placeId: 'mapbox-address-1',
      latitude: 14.65,
      longitude: 121.04,
    });
  });
});
