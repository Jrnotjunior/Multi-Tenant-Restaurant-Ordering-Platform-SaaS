export type GeocodingFeature = {
  id?: string;
  properties?: {
    geocoding_id?: string;
    feature_type?: string;
    name?: string;
    name_preferred?: string;
    address?: string;
    full_address?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    place_formatted?: string;
    street?: string;
    housenumber?: string;
    unit?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
    suburb?: string;
    locality?: string;
    barangay?: string;
    osm_id?: number;
    osm_type?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
    result_type?: string;
    place_id?: string;
    rank?: { match_type?: string };
    context?: {
      country?: { name?: string };
      region?: { name?: string };
      district?: { name?: string };
      place?: { name?: string };
      locality?: { name?: string };
      neighborhood?: { name?: string };
      address?: { name?: string; address_number?: string; street_name?: string };
      street?: { name?: string };
      barangay?: { name?: string };
    };
    coordinates?: {
      longitude?: number;
      latitude?: number;
      accuracy?: string;
    };
  };
  geometry?: { coordinates?: [number, number] };
};

type GeocodingFeatureCollection = { features?: GeocodingFeature[] };
type GeocodingContext = Record<string, { name?: string } | undefined>;

export function requestedHouseNumber(query: string) {
  return query.trim().match(/^(?:(?:#|no\.?)\s*)?(\d+[A-Za-z]?(?:[-/](?:\d+[A-Za-z]?|[A-Za-z]))?)(?=$|[\s,#])/i)?.[1] ?? '';
}

export function resultHouseNumber(properties: GeocodingFeature['properties'] | undefined) {
  const resultType = (properties?.feature_type || properties?.result_type || properties?.type || '').toLowerCase();
  const matchType = properties?.rank?.match_type?.toLowerCase();
  if (resultType === 'street' || matchType && !['full_match', 'match_by_building'].includes(matchType)) return '';

  const houseNumber = properties?.housenumber?.trim();
  if (houseNumber) return houseNumber;

  // Geoapify sometimes returns a number-like "unit" for a street-only result.
  // It verifies the requested number only when the provider also identifies a
  // building-level result; otherwise the customer must still adjust the pin.
  if (resultType !== 'building') return '';
  return properties?.unit?.trim().match(/^(?:(?:#|no\.?)\s*)?(\d+[A-Za-z]?(?:[-/](?:\d+[A-Za-z]?|[A-Za-z]))?)(?=$|[\s,#])/i)?.[1] ?? '';
}

export function matchesRequestedHouseNumber(query: string, result: string | undefined) {
  const requested = requestedHouseNumber(query);
  const matched = result?.trim() ?? '';
  if (!requested || !matched) return false;
  return requested.replace(/\s+/g, '').toUpperCase() === matched.replace(/\s+/g, '').toUpperCase();
}

function contextName(context: GeocodingContext | undefined, key: string) {
  return context?.[key]?.name?.trim() ?? '';
}

function toCoordinates(feature: GeocodingFeature) {
  const properties = feature.properties;
  const longitude = Number(properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0]);
  const latitude = Number(properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function nonEmpty(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find((value) => Boolean(value)) ?? '';
}

function hasAddressNumber(value: string, houseNumber: string) {
  if (!value || !houseNumber) return false;
  const escaped = houseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`, 'i').test(value);
}

function normalizePhotonFeature(feature: {
  id?: string | number;
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}): GeocodingFeature {
  const p = feature.properties ?? {};
  const stringValue = (key: string) => typeof p[key] === 'string' ? p[key] as string : '';
  const numberValue = (key: string) => typeof p[key] === 'number' ? p[key] as number : undefined;
  const coordinates = feature.geometry?.coordinates;
  const housenumber = stringValue('housenumber');
  const street = stringValue('street');
  const namedStreet = /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|highway|hwy)\b/i.test(stringValue('name'))
    ? stringValue('name')
    : '';
  const resolvedStreet = street || namedStreet;
  const name = nonEmpty(stringValue('name'), street, stringValue('city'));
  const parts = [
    [housenumber, resolvedStreet].filter(Boolean).join(' '),
    stringValue('suburb'),
    stringValue('city'),
    stringValue('state'),
    stringValue('country'),
  ].filter(Boolean);
  const osmId = numberValue('osm_id');
  const osmType = stringValue('osm_type');

  return {
    id: String(feature.id ?? ''),
    geometry: feature.geometry,
    properties: {
      ...(p as GeocodingFeature['properties']),
      geocoding_id: osmId ? `${osmType || 'osm'}:${osmId}` : String(feature.id ?? ''),
      name,
      address: nonEmpty(housenumber && resolvedStreet ? `${housenumber} ${resolvedStreet}` : '', resolvedStreet, stringValue('name')),
      full_address: parts.join(', ') || name,
      place_formatted: [stringValue('city'), stringValue('state'), stringValue('country')].filter(Boolean).join(', '),
      coordinates: {
        longitude: coordinates?.[0],
        latitude: coordinates?.[1],
      },
    },
  };
}

export function geocodingFeatureToAddress(feature: GeocodingFeature) {
  const properties = feature.properties ?? {};
  const context = properties.context;
  const coordinates = toCoordinates(feature);
  if (!coordinates) return null;

  const city = nonEmpty(
    properties.city,
    contextName(context, 'place'),
    contextName(context, 'locality'),
    properties.county,
    properties.state,
  );

  // Do not infer barangay from suburb/locality/district. Those labels are not
  // equivalent to a Philippine barangay and caused incorrect saved addresses.
  // Only accept a field explicitly identified as barangay by the provider.
  const barangay = nonEmpty(
    properties.barangay,
    contextName(context, 'barangay'),
  );

  const street = [properties.housenumber, properties.street].filter(Boolean).join(' ').trim();
  const address = nonEmpty(
    properties.address,
    context?.address?.name,
    street,
    properties.street,
    properties.name,
  );
  const formattedAddress = nonEmpty(
    properties.full_address,
    [street, properties.suburb, city, properties.state, properties.country].filter(Boolean).join(', '),
    [properties.address, properties.place_formatted].filter(Boolean).join(', '),
    properties.name,
  );

  return {
    formattedAddress,
    city,
    barangay,
    address,
    placeId: properties.geocoding_id?.trim() || (properties.osm_id ? `${properties.osm_type || 'osm'}:${properties.osm_id}` : feature.id?.trim()) || '',
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

function normalizeGeoapifyFeature(feature: {
  id?: string | number;
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}): GeocodingFeature {
  const p = feature.properties ?? {};
  const stringValue = (key: string) => typeof p[key] === 'string' ? p[key] as string : '';
  const coordinates = feature.geometry?.coordinates;
  const unit = stringValue('unit');
  const unitHouseNumber = unit.match(/^(?:(?:#|no\.?)\s*)?(\d+[A-Za-z]?(?:[-/](?:\d+[A-Za-z]?|[A-Za-z]))?)(?=$|[\s,#])/i)?.[1] ?? '';
  const houseNumber = stringValue('housenumber');
  const displayHouseNumber = nonEmpty(houseNumber, unitHouseNumber);
  const street = stringValue('street');
  const providerLine1 = stringValue('address_line1');
  const line2 = stringValue('address_line2');
  const addressLine1 = displayHouseNumber && street && !hasAddressNumber(providerLine1, displayHouseNumber)
    ? `${displayHouseNumber} ${street}`
    : nonEmpty(providerLine1, [displayHouseNumber, street].filter(Boolean).join(' '), street, stringValue('name'));
  const formatted = stringValue('formatted');
  const needsHouseNumberInFormattedAddress = Boolean(displayHouseNumber && street && !hasAddressNumber(formatted, displayHouseNumber));
  const name = nonEmpty(stringValue('name'), providerLine1, street, stringValue('city'));
  const includePlaceName = name && name !== providerLine1 && name !== street && stringValue('result_type') === 'amenity'
    ? name
    : '';
  const fullAddress = needsHouseNumberInFormattedAddress
    ? [includePlaceName, addressLine1, line2].filter(Boolean).join(', ')
    : nonEmpty(formatted, [addressLine1, line2].filter(Boolean).join(', '), addressLine1);

  return {
    id: String(feature.id ?? stringValue('place_id')),
    geometry: feature.geometry,
    properties: {
      ...(p as GeocodingFeature['properties']),
      geocoding_id: nonEmpty(stringValue('place_id'), String(feature.id ?? '')),
      feature_type: stringValue('result_type'),
      type: nonEmpty(stringValue('result_type'), stringValue('type')),
      name,
      address: addressLine1,
      full_address: fullAddress,
      place_formatted: nonEmpty(line2, [stringValue('suburb'), stringValue('city'), stringValue('state'), stringValue('country')].filter(Boolean).join(', ')),
      housenumber: houseNumber,
      coordinates: {
        longitude: coordinates?.[0],
        latitude: coordinates?.[1],
      },
    },
  };
}

async function requestJson(url: string, normalizeFeature = normalizePhotonFeature) {
  const response = await fetch(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Geocoding request failed', { status: response.status });
    throw new Error('We could not search that location right now. Please try again or move the pin manually.');
  }

  const collection = body as {
    features?: Array<{
      id?: string | number;
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, unknown>;
    }>;
  };
  return {
    features: Array.isArray(collection.features)
      ? collection.features.map(normalizeFeature)
      : [],
  } as GeocodingFeatureCollection;
}

function prioritizeAddressResults(query: string, features: GeocodingFeature[]) {
  const value = query.trim().replace(/\s+/g, ' ');
  const addressLikeQuery = /\d/.test(value) || /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd|highway|hwy)\b/i.test(value);
  const philippines = features.filter((feature) => {
    const properties = feature.properties ?? {};
    // Do not present a city-only hit as an address match for a house/street query.
    if (addressLikeQuery && !properties.housenumber && !properties.street && !properties.address_line1) {
      const name = properties.name?.trim().toLowerCase() ?? '';
      const city = properties.city?.trim().toLowerCase() ?? '';
      const type = `${properties.type ?? ''} ${properties.osm_key ?? ''} ${properties.osm_value ?? ''}`.toLowerCase();
      const hasStreetName = /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd|highway|hwy)\b/i.test(name);
      if (!hasStreetName && (name === city || !type.includes('street') && !type.includes('highway'))) return false;
    }
    const country = feature.properties?.country?.trim().toLowerCase();
    const countryCode = feature.properties?.country_code?.trim().toLowerCase();
    return (!country || country === 'philippines' || country === 'the philippines')
      && (!countryCode || countryCode === 'ph');
  });

  // Prefer house/street matches for address searches, then preserve provider
  // ordering within each class. Do not fabricate house numbers or addresses.
  const priority = (feature: GeocodingFeature) => {
    const p = feature.properties ?? {};
    const value = `${p.type ?? ''} ${p.osm_key ?? ''} ${p.osm_value ?? ''}`.toLowerCase();
    if (matchesRequestedHouseNumber(query, resultHouseNumber(p))) return 0;
    if (p.housenumber || value.includes('house') || value.includes('building')) return 1;
    if (p.street || value.includes('street') || value.includes('highway')) return 2;
    if (value.includes('amenity')) return 3;
    return 4;
  };

  return philippines.sort((a, b) => priority(a) - priority(b)).slice(0, 10);
}

let mapboxTokenPromise: Promise<string> | null = null;

export async function mapboxAccessToken(): Promise<string> {
  if (!mapboxTokenPromise) {
    mapboxTokenPromise = (async () => {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
      const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
      if (!baseUrl || !publicKey) throw new Error('Mapbox configuration is unavailable.');
      const response = await fetch(`${baseUrl}/functions/v1/mapbox-public-config`, {
        headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, Accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      const body = await response.json().catch(() => ({})) as { accessToken?: string; error?: string };
      if (!response.ok || !body.accessToken) throw new Error(body.error || 'Mapbox configuration is unavailable.');
      return body.accessToken;
    })().catch((error) => { mapboxTokenPromise = null; throw error; });
  }
  return mapboxTokenPromise;
}

function normalizeMapboxFeature(feature: { id?: string; geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }): GeocodingFeature {
  const p = feature.properties ?? {};
  const context = p.context && typeof p.context === 'object' ? p.context as Record<string, unknown> : {};
  const contextName = (key: string) => {
    const value = context[key];
    return value && typeof value === 'object' && typeof (value as Record<string, unknown>).name === 'string'
      ? String((value as Record<string, unknown>).name) : '';
  };
  const coordinates = feature.geometry?.coordinates;
  const city = contextName('place') || contextName('locality') || contextName('district') || contextName('region');
  const barangay = contextName('neighborhood') || contextName('locality');
  const name = typeof p.name === 'string' ? p.name : '';
  const street = typeof p.street === 'string' ? p.street : '';
  const address = typeof p.address === 'string' ? p.address : [p.address_number, street].filter(Boolean).join(' ');
  return { id: feature.id ?? String(p.mapbox_id ?? ''), geometry: feature.geometry, properties: {
    name, address, street, housenumber: typeof p.address_number === 'string' ? p.address_number : '',
    full_address: typeof p.full_address === 'string' ? p.full_address : [address, barangay, city, contextName('region'), contextName('country')].filter(Boolean).join(', '),
    place_formatted: typeof p.place_formatted === 'string' ? p.place_formatted : '',
    city, barangay, country: contextName('country'), country_code: typeof p.country_code === 'string' ? p.country_code : '',
    geocoding_id: typeof p.mapbox_id === 'string' ? p.mapbox_id : feature.id ?? '',
    feature_type: typeof p.feature_type === 'string' ? p.feature_type : '',
    result_type: typeof p.feature_type === 'string' ? p.feature_type : '',
    coordinates: { longitude: coordinates?.[0], latitude: coordinates?.[1] },
    context: { place: { name: city }, barangay: { name: barangay }, country: { name: contextName('country') }, region: { name: contextName('region') }, neighborhood: { name: contextName('neighborhood') }, locality: { name: contextName('locality') } },
  } };
}

export function isGeoapifyAddressSearchConfigured() {
  return Boolean(import.meta.env.VITE_GEOAPIFY_API_KEY?.trim());
}

export async function searchAddresses(query: string): Promise<GeocodingFeature[]> {
  const value = query.trim().replace(/\s+/g, ' ');
  if (value.length < 3) return [];
  const token = await mapboxAccessToken();
  const params = new URLSearchParams({ q: value, access_token: token, country: 'PH', language: 'en', limit: '10', types: 'address,street,locality,neighborhood,place,district' });
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({})) as { features?: Array<{ id?: string; geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> };
  if (!response.ok) throw new Error('We could not search that location right now. Please try again or move the pin manually.');
  return prioritizeAddressResults(value, (body.features ?? []).map(normalizeMapboxFeature));
}

export async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<GeocodingFeature | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('The selected coordinates are invalid.');
  try {
    const token = await mapboxAccessToken();
    const params = new URLSearchParams({ longitude: String(longitude), latitude: String(latitude), access_token: token, language: 'en', limit: '1' });
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => ({})) as { features?: Array<{ id?: string; geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> };
    if (!response.ok) throw new Error('Mapbox reverse geocoding is temporarily unavailable.');
    return (body.features ?? []).map(normalizeMapboxFeature)[0] ?? null;
  } catch (error) {
    console.warn('Mapbox reverse geocoding unavailable.', error);
    return null;
  }
}
