export type MapboxDeliveryAddress = {
  formattedAddress: string;
  city: string;
  barangay: string;
  address: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
};

export function isPublicMapboxToken(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('pk.');
}

export function normalizeSecureOrigin(value: unknown, allowLocalhost = false): string | null {
  if (typeof value !== 'string' || !value || value === 'null') return null;
  try {
    const url = new URL(value);
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    if (url.origin !== value || url.username || url.password) return null;
    if (url.protocol === 'https:') return url.origin;
    if (allowLocalhost && isLocalhost && url.protocol === 'http:') return url.origin;
    return null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function parseMapboxDeliveryAddress(value: unknown): MapboxDeliveryAddress | null {
  const item = asRecord(value);
  if (!item) return null;
  const textFields = ['formattedAddress', 'city', 'barangay', 'address', 'placeId'] as const;
  if (!textFields.every((key) => typeof item[key] === 'string')) return null;
  const latitude = item.latitude;
  const longitude = item.longitude;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return {
    formattedAddress: item.formattedAddress as string,
    city: item.city as string,
    barangay: item.barangay as string,
    address: item.address as string,
    placeId: item.placeId as string,
    latitude,
    longitude,
  };
}
