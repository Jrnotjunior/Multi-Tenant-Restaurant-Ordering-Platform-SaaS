export type RiderNavigationUrls = { waze: string; googleMaps: string };
export function buildRiderNavigationUrls(latitude: number | null, longitude: number | null): RiderNavigationUrls | null {
  const valid = typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  if (!valid) return null;
  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return { waze: `https://www.waze.com/ul?ll=${destination}&navigate=yes`, googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${destination}` };
}
