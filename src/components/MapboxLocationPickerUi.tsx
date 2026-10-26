import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxPublicToken, mapboxFeatureToAddress, reverseMapboxLocation, searchMapboxAddresses, type MapboxLocationFeature } from '../modules/location/locationService';
import type { MapboxDeliveryAddress } from '../modules/location/mapServiceProtocol';
export type { MapboxDeliveryAddress } from '../modules/location/mapServiceProtocol';

type LatLng = { lat: number; lng: number };

function coordinatesToAddress(location: LatLng): MapboxDeliveryAddress {
  return {
    formattedAddress: '',
    city: '',
    barangay: '',
    address: '',
    placeId: '',
    latitude: location.lat,
    longitude: location.lng,
  };
}

function toAddress(feature: MapboxLocationFeature): MapboxDeliveryAddress | null {
  const address = mapboxFeatureToAddress(feature);
  return address ? { ...address } : null;
}

export function MapboxLocationPickerUi({
  disabled = false,
  onSelect,
  onLocationChange,
  variant = 'delivery',
  initialLatitude = null,
  initialLongitude = null,
}: {
  disabled?: boolean;
  onSelect: (address: MapboxDeliveryAddress) => void | Promise<void>;
  onLocationChange?: () => void;
  variant?: 'delivery' | 'restaurant';
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const selectedAddressRef = useRef<MapboxDeliveryAddress | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapboxLocationFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<MapboxDeliveryAddress | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    selectedAddressRef.current = selectedAddress;
  }, [selectedAddress]);

  function setSelectedLocation(location: LatLng, address?: MapboxDeliveryAddress | null) {
    const map = mapRef.current;
    const marker = markerRef.current;
    marker?.setLngLat([location.lng, location.lat]);
    map?.setCenter([location.lng, location.lat]);

    const nextAddress = address ?? (() => {
      const current = selectedAddressRef.current;
      return current
        ? { ...current, latitude: location.lat, longitude: location.lng }
        : coordinatesToAddress(location);
    })();

    setSelectedAddress(nextAddress);
    setLocationConfirmed(false);
    onLocationChange?.();
  }

  useEffect(() => {
    if (!mapRef.current || !Number.isFinite(initialLatitude) || !Number.isFinite(initialLongitude)) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    const coordinates: [number, number] = [Number(initialLongitude), Number(initialLatitude)];
    marker?.setLngLat(coordinates);
    map.setCenter(coordinates);
    map.setZoom(16);
  }, [initialLatitude, initialLongitude]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      setLoading(true);
      setError('');

      try {
        const token = getMapboxPublicToken();
        if (!token.startsWith('pk.')) throw new Error('The central map service is not configured. Please try again later.');
        if (!mapContainerRef.current || cancelled) return;

        const defaultCenter: [number, number] = Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude)
          ? [Number(initialLongitude), Number(initialLatitude)]
          : [120.9780, 14.6760];

        const map = new mapboxgl.Map({
          accessToken: token,
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/standard',
          center: defaultCenter,
          zoom: Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude) ? 16 : 13,
          attributionControl: true,
          dragRotate: false,
        });

        const marker = new mapboxgl.Marker({ draggable: true })
          .setLngLat(defaultCenter)
          .addTo(map);

        mapRef.current = map;
        markerRef.current = marker;

        marker.on('dragend', () => {
          const position = marker.getLngLat();
          setSelectedLocation({ lat: position.lat, lng: position.lng });
        });

        map.on('click', (event) => {
          setSelectedLocation({ lat: event.lngLat.lat, lng: event.lngLat.lng });
        });

        map.on('error', (event) => {
          console.error('Mapbox map error', event.error);
        });
      } catch (setupError) {
        console.error('Unable to initialize Mapbox delivery map.', setupError);
        setError(setupError instanceof Error ? setupError.message : 'Mapbox is unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void setup();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  async function searchAddresses() {
    const query = searchQuery.trim();
    if (!query || searching || disabled) return;

    setSearching(true);
    setError('');
    setSearchResults([]);

    try {
      const results = await searchMapboxAddresses(query);
      setSearchResults(results);
      if (!results.length) setError('No matching address was found. Try a more complete address or move the pin manually.');
    } catch (searchError) {
      console.error('Unable to search Mapbox addresses.', searchError);
      setError(searchError instanceof Error ? searchError.message : 'We could not search that address right now.');
    } finally {
      setSearching(false);
    }
  }

  function selectSearchResult(feature: MapboxLocationFeature) {
    const address = toAddress(feature);
    if (!address || address.latitude === null || address.longitude === null) {
      setError('Mapbox did not return an exact map location for that address.');
      return;
    }

    setSelectedLocation(
      { lat: address.latitude, lng: address.longitude },
      address,
    );
    mapRef.current?.setZoom(17);
    setSearchResults([]);
    setSearchQuery(address.formattedAddress || address.address);
    setError('');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not provide location services. Search your address or move the pin manually.');
      return;
    }

    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSelectedLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      (locationError) => {
        console.error('Unable to read the customer location.', locationError);
        setLocating(false);
        setError('We could not access your current location. Please allow location access or move the pin manually.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function confirmLocation() {
    const current = selectedAddressRef.current;
    if (!current || current.latitude === null || current.longitude === null) return;

    setConfirming(true);
    setError('');

    try {
      let nextAddress = current;

      if (!current.formattedAddress || !current.city || !current.barangay) {
        const feature = await reverseMapboxLocation(current.latitude, current.longitude);
        const reversed = feature ? toAddress(feature) : null;
        if (reversed) {
          nextAddress = {
            ...reversed,
            latitude: current.latitude,
            longitude: current.longitude,
          };
          setSelectedAddress(nextAddress);
          setSearchQuery(nextAddress.formattedAddress || nextAddress.address);
        }
      }

      await onSelect(nextAddress);
      setLocationConfirmed(true);
    } catch (confirmationError) {
      console.error('Unable to confirm Mapbox delivery location.', confirmationError);
      setError(confirmationError instanceof Error ? confirmationError.message : 'We could not confirm this location. Please try again.');
      setLocationConfirmed(false);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="delivery-location-picker">
      <p className="checkout-hint">
        {variant === 'restaurant'
          ? 'Search the restaurant address or move the pin to the exact restaurant location.'
          : ''}
      </p>

      <div className="delivery-location-search">
        <div className="delivery-location-search-row">
          <input
            className="delivery-location-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void searchAddresses();
              }
            }}
            placeholder={variant === 'restaurant' ? 'Search the restaurant address' : 'Search your delivery address'}
            disabled={disabled || loading || searching}
            aria-label={variant === 'restaurant' ? 'Search the restaurant address' : 'Search your delivery address'}
          />
          <button
            className="button button-secondary restaurant-compact-action"
            type="button"
            onClick={() => void searchAddresses()}
            disabled={disabled || loading || searching || !searchQuery.trim()}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="delivery-location-search-results" role="listbox" aria-label="Mapbox address results">
            {searchResults.map((result, index) => {
              const properties = result.properties ?? {};
              return (
                <button
                  key={properties.mapbox_id || result.id || `result-${index}`}
                  className="delivery-location-search-result"
                  type="button"
                  onClick={() => selectSearchResult(result)}
                >
                  {properties.full_address || [properties.name, properties.place_formatted].filter(Boolean).join(', ') || 'Mapbox location'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="delivery-location-map" ref={mapContainerRef} aria-label="Delivery location map" />

      <div className="delivery-location-map-actions">
        <button className="button button-secondary restaurant-compact-action" type="button" onClick={useCurrentLocation} disabled={disabled || loading || locating}>
          {locating ? 'Finding your location…' : 'Use my current location'}
        </button>
        <span>{variant === 'restaurant' ? 'Move the pin or tap the map to set the restaurant location.' : 'Drag the pin or tap the map to adjust it.'}</span>
      </div>

      {selectedAddress && (
        <div className="delivery-location-confirmation">
          <strong>
            {locationConfirmed
              ? (variant === 'restaurant' ? 'Restaurant location confirmed' : 'Delivery location confirmed')
              : (variant === 'restaurant' ? 'Confirm restaurant location' : 'Confirm your delivery location')}
          </strong>
          <span>{selectedAddress.formattedAddress || selectedAddress.address || 'Exact map location selected. Confirm the location to read the address.'}</span>
          {(selectedAddress.city || selectedAddress.barangay) && (
            <small>{selectedAddress.city}{selectedAddress.barangay ? `, ${selectedAddress.barangay}` : ''}</small>
          )}
          <button
            className="button button-primary"
            type="button"
            onClick={() => void confirmLocation()}
            disabled={disabled || locationConfirmed || confirming}
          >
            {locationConfirmed
              ? (variant === 'restaurant' ? 'Restaurant Location Confirmed' : 'Location Confirmed')
              : confirming
                ? 'Confirming Location…'
                : (variant === 'restaurant' ? 'Confirm Restaurant Location' : 'Confirm Location')}
          </button>
        </div>
      )}

      {error && <p className="checkout-error" role="alert">{error}</p>}
    </div>
  );
}
