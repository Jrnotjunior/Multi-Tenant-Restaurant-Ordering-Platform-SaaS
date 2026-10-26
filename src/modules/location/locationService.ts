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

let configuredPublicToken = '';

/** Set only from the central map service's runtime configuration response. */
export function configureMapboxPublicToken(token: string) {
  const value = token.trim();
  if (!value.startsWith('pk.')) {
    throw new Error('The central map service returned an invalid public Mapbox token.');
  }
  configuredPublicToken = value;
}

export function getMapboxPublicToken() {
  return configuredPublicToken;
}

function requireToken() {
  const token = getMapboxPublicToken();
  if (!token.startsWith('pk.')) {
    throw new Error('The central map service is not configured. Please try again later.');
  }
  return token;
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

  const city = contextName(context, 'place') || contextName(context, 'locality') || contextName(context, 'district');
  const barangay = contextName(context, 'locality') || contextName(context, 'neighborhood') || contextName(context, 'district');
  const address = properties.address?.trim()
    || context?.address?.name?.trim()
    || context?.street?.name?.trim()
    || properties.name?.trim()
    || '';

  return {
    formattedAddress: properties.full_address?.trim() || [properties.address, properties.place_formatted].filter(Boolean).join(', ').trim() || properties.name?.trim() || '',
    city,
    barangay,
    address,
    placeId: properties.mapbox_id?.trim() || feature.id?.trim() || '',
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

async function requestJson(url: string) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Mapbox location request failed', { status: response.status, body });
    throw new Error('We could not search that location right now. Please try again or move the pin manually.');
  }
  return body as MapboxFeatureCollection;
}

export async function searchMapboxAddresses(query: string): Promise<MapboxLocationFeature[]> {
  const token = requireToken();
  const params = new URLSearchParams({
    q: query.trim(), access_token: token, language: 'en', country: 'PH', limit: '5',
    types: 'address,street,place,locality,neighborhood',
  });
  const data = await requestJson(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
  return Array.isArray(data.features) ? data.features : [];
}

export async function reverseMapboxLocation(latitude: number, longitude: number): Promise<MapboxLocationFeature | null> {
  const token = requireToken();
  const params = new URLSearchParams({
    longitude: String(longitude), latitude: String(latitude), access_token: token,
    language: 'en', country: 'PH', limit: '1', types: 'address,street,place,locality',
  });
  const data = await requestJson(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`);
  return data.features?.[0] ?? null;
}

