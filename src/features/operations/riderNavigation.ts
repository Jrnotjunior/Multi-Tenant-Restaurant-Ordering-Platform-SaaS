export type RiderNavigationUrls = { googleMaps: string };
export function buildRiderNavigationUrls(latitude: number | null, longitude: number | null, address?: string | null): RiderNavigationUrls | null {
  const valid = typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const destination = valid ? `${latitude},${longitude}` : address?.trim();
  if (!destination) return null;
  const encodedDestination = encodeURIComponent(destination);
  return { googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}` };
}
