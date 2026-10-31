export type MapboxLocationFeature = {
  id?: string;
  properties?: {
    mapbox_id?: string;
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
    osm_id?: number;
    osm_type?: string;
    type?: string;
    context?: {
      country?: { name?: string };
      region?: { name?: string };
      district?: { name?: string };
      place?: { name?: string };
      locality?: { name?: string };
      neighborhood?: { name?: string };
      address?: { name?: string; address_number?: string; street_name?: string };
      street?: { name?: string };
    };
    coordinates?: {
      longitude?: number;
      latitude?: number;
      accuracy?: string;
    };
  };
  geometry?: { coordinates?: [number, number] };
};

type MapboxFeatureCollection = { features?: MapboxLocationFeature[] };

export function getMapboxPublicToken() {
  // Kept temporarily for compatibility with older map-service integrations.
  return '';
}

type MapboxContext = Record<string, { name?: string } | undefined>;

function contextName(context: MapboxContext | undefined, key: string) {
  return context?.[key]?.name?.trim() ?? '';
}

function toCoordinates(feature: MapboxLocationFeature) {
  const properties = feature.properties;
  const longitude = Number(properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0]);
  const latitude = Number(properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function mapboxFeatureToAddress(feature: MapboxLocationFeature) {
  const properties = feature.properties ?? {};
  const context = properties.context;
  const coordinates = toCoordinates(feature);
  if (!coordinates) return null;

  const city = properties.city?.trim()
    || contextName(context, 'place')
    || contextName(context, 'locality')
    || properties.county?.trim()
    || contextName(context, 'district')
    || properties.state?.trim();
  const barangay = properties.suburb?.trim()
    || properties.locality?.trim()
    || contextName(context, 'neighborhood')
    || contextName(context, 'locality')
    || properties.district?.trim()
    || contextName(context, 'district');
  const street = [properties.housenumber, properties.street].filter(Boolean).join(' ').trim();
  const address = properties.address?.trim()
    || context?.address?.name?.trim()
    || street
    || properties.street?.trim()
    || properties.name?.trim()
    || '';
  const formattedAddress = properties.full_address?.trim()
    || [properties.name, street, properties.suburb, city, properties.state, properties.country].filter(Boolean).join(', ')
    || [properties.address, properties.place_formatted].filter(Boolean).join(', ').trim()
    || properties.name?.trim()
    || '';

  return {
    formattedAddress,
    city,
    barangay,
    address,
    placeId: properties.mapbox_id?.trim() || (properties.osm_id ? `${properties.osm_type || 'osm'}:${properties.osm_id}` : feature.id?.trim()) || '',
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Geocoding request failed', { status: response.status, body });
    throw new Error('We could not search that location right now. Please try again or move the pin manually.');
  }
  const collection = body as { features?: Array<{ id?: string | number; geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> };
  return {
    features: Array.isArray(collection.features) ? collection.features.map((feature) => ({
      id: String(feature.id ?? ''),
      geometry: feature.geometry,
      properties: {
        ...(feature.properties ?? {}),
        mapbox_id: feature.properties?.osm_id ? `${String(feature.properties.osm_type ?? 'osm')}:${String(feature.properties.osm_id)}` : String(feature.id ?? ''),
        name: String(feature.properties?.name ?? feature.properties?.street ?? feature.properties?.city ?? ''),
        address: [feature.properties?.housenumber, feature.properties?.street].filter(Boolean).join(' '),
        full_address: [feature.properties?.name, feature.properties?.housenumber, feature.properties?.street, feature.properties?.suburb, feature.properties?.city, feature.properties?.state, feature.properties?.country].filter(Boolean).join(', '),
        place_formatted: [feature.properties?.city, feature.properties?.state, feature.properties?.country].filter(Boolean).join(', '),
        coordinates: {
          longitude: feature.geometry?.coordinates?.[0],
          latitude: feature.geometry?.coordinates?.[1],
        },
      },
    })) : [],
  } as MapboxFeatureCollection;
}

export async function searchMapboxAddresses(query: string): Promise<MapboxLocationFeature[]> {
  const value = query.trim();
  if (value.length < 3) return [];
  const params = new URLSearchParams({
    q: value,
    lang: 'en',
    limit: '5',
    lat: '14.5995',
    lon: '120.9842',
  });
  const data = await requestJson(`https://photon.komoot.io/api/?${params.toString()}`);
  return Array.isArray(data.features) ? data.features : [];
}

export async function reverseMapboxLocation(latitude: number, longitude: number): Promise<MapboxLocationFeature | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    lang: 'en',
  });
  const data = await requestJson(`https://photon.komoot.io/reverse?${params.toString()}`);
  return data.features?.[0] ?? null;
}
