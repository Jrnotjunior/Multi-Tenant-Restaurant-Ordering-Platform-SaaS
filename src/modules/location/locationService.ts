export type GeocodingFeature = {
  id?: string;
  properties?: {
    geocoding_id?: string;
    feature_type?: string;
    name?: string;
    name_preferred?: string;
    address?: string;
    full_address?: string;
    place_formatted?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    suburb?: string;
    locality?: string;
    barangay?: string;
    osm_id?: number;
    osm_type?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
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
  const name = nonEmpty(stringValue('name'), street, stringValue('city'));
  const parts = [
    [housenumber, street].filter(Boolean).join(' '),
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
      address: nonEmpty(stringValue('housenumber') && street ? `${housenumber} ${street}` : '', street, stringValue('name')),
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

async function requestJson(url: string) {
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
      ? collection.features.map(normalizePhotonFeature)
      : [],
  } as GeocodingFeatureCollection;
}

export async function searchAddresses(query: string): Promise<GeocodingFeature[]> {
  const value = query.trim().replace(/\\s+/g, ' ');
  if (value.length < 3) return [];

  const params = new URLSearchParams({
    q: value,
    lang: 'en',
    limit: '10',
  });

  // Ask Photon for address-relevant feature classes explicitly. This improves
  // street/house discovery without falsely claiming every result is a barangay.
  for (const layer of ['house', 'street', 'locality', 'district', 'city', 'postcode', 'amenity']) {
    params.append('layer', layer);
  }

  const data = await requestJson(`https://photon.komoot.io/api/?${params.toString()}`);
  const features = Array.isArray(data.features) ? data.features : [];

  // Keep Philippine results when the provider supplies country metadata, while
  // retaining results with no country field so useful incomplete records survive.
  const philippines = features.filter((feature) => {
    const country = feature.properties?.country?.trim().toLowerCase();
    return !country || country === 'philippines' || country === 'the philippines';
  });

  // Prefer house/street matches for address searches, then preserve provider
  // ordering within each class. Do not fabricate house numbers or addresses.
  const priority = (feature: GeocodingFeature) => {
    const p = feature.properties ?? {};
    const value = `${p.type ?? ''} ${p.osm_key ?? ''} ${p.osm_value ?? ''}`.toLowerCase();
    if (p.housenumber || value.includes('house')) return 0;
    if (p.street || value.includes('street') || value.includes('highway')) return 1;
    if (value.includes('amenity')) return 2;
    return 3;
  };

  return philippines.sort((a, b) => priority(a) - priority(b)).slice(0, 10);
}

export async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<GeocodingFeature | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('The selected coordinates are invalid.');
  }
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    lang: 'en',
  });
  const data = await requestJson(`https://photon.komoot.io/reverse?${params.toString()}`);
  return data.features?.[0] ?? null;
}
