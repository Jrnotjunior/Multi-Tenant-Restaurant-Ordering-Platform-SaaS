import { useEffect, useRef, useState } from 'react';
import { parseMapboxDeliveryAddress, type MapboxDeliveryAddress } from '../../modules/location/mapServiceProtocol';

export type { MapboxDeliveryAddress } from '../../modules/location/mapServiceProtocol';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

type PickerVariant = 'delivery' | 'restaurant';
type InitMessage = {
  source: 'web2table-storefront';
  type: 'init';
  variant: PickerVariant;
  disabled: boolean;
  initialLatitude: number | null;
  initialLongitude: number | null;
};

function mapServiceUrl(): { href: string; origin: string; configurationError: string } {
  const fallback = 'https://app.web2table.io/maps.html';
  const fallbackUrl = new URL(fallback);
  const configured = String(import.meta.env.VITE_MAP_SERVICE_URL ?? '').trim();
  if (!configured) return { href: fallbackUrl.href, origin: fallbackUrl.origin, configurationError: '' };

  // Never throw from render because the delivery tab mounts this component lazily.
  // A bad deployment URL must produce a local warning, not unmount the owner workspace.
  try {
    const url = new URL(configured, window.location.origin);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocal) {
      return {
        href: fallbackUrl.href,
        origin: fallbackUrl.origin,
        configurationError: 'The configured map service does not use HTTPS. The secure central map service will be used instead.',
      };
    }
    if (url.username || url.password) {
      return {
        href: fallbackUrl.href,
        origin: fallbackUrl.origin,
        configurationError: 'The configured map service URL is invalid. The secure central map service will be used instead.',
      };
    }
    return { href: url.href, origin: url.origin, configurationError: '' };
  } catch {
    return {
      href: fallbackUrl.href,
      origin: fallbackUrl.origin,
      configurationError: 'The configured map service URL is invalid. The secure central map service will be used instead.',
    };
  }
}

export function MapboxDeliveryLocationPicker({
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
  variant?: PickerVariant;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const callbacksRef = useRef({ onSelect, onLocationChange, disabled, variant, initialLatitude, initialLongitude });
  const readyRef = useRef(false);
  const service = mapServiceUrl();
  const [serviceError, setServiceError] = useState(service.configurationError);
  const [frameHeight, setFrameHeight] = useState(520);

  callbacksRef.current = { onSelect, onLocationChange, disabled, variant, initialLatitude, initialLongitude };

  function sendInit() {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    const current = callbacksRef.current;
    const message: InitMessage = {
      source: 'web2table-storefront',
      type: 'init',
      variant: current.variant,
      disabled: current.disabled,
      initialLatitude: current.initialLatitude,
      initialLongitude: current.initialLongitude,
    };
    target.postMessage(message, service.origin);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== service.origin || event.source !== iframeRef.current?.contentWindow) return;
      const message = asRecord(event.data);
      if (!message || message.source !== 'web2table-map-service' || typeof message.type !== 'string') return;

      if (message.type === 'ready') {
        readyRef.current = true;
        if (!service.configurationError) setServiceError('');
        sendInit();
        return;
      }
      if (!readyRef.current) return;

      if (message.type === 'frame-resize') {
        const height = typeof message.height === 'number' ? message.height : Number(message.height);
        if (Number.isFinite(height) && height >= 320 && height <= 1200) {
          setFrameHeight(Math.ceil(height));
        }
        return;
      }

      if (message.type === 'service-error') {
        setServiceError(typeof message.message === 'string' ? message.message : 'The central map service is unavailable.');
        return;
      }
      if (message.type === 'location-changed') {
        callbacksRef.current.onLocationChange?.();
        return;
      }
      if (message.type === 'location-selected') {
        const requestId = typeof message.requestId === 'string' ? message.requestId : '';
        const address = parseMapboxDeliveryAddress(message.address);
        if (!requestId || !address) {
          iframeRef.current?.contentWindow?.postMessage({
            source: 'web2table-storefront',
            type: 'location-selection-result',
            requestId,
            ok: false,
            error: 'The map returned an invalid address. Please select the location again.',
          }, service.origin);
          return;
        }

        void Promise.resolve(callbacksRef.current.onSelect(address)).then(() => {
          iframeRef.current?.contentWindow?.postMessage({
            source: 'web2table-storefront',
            type: 'location-selection-result',
            requestId,
            ok: true,
          }, service.origin);
        }).catch((error: unknown) => {
          iframeRef.current?.contentWindow?.postMessage({
            source: 'web2table-storefront',
            type: 'location-selection-result',
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to save the selected location.',
          }, service.origin);
        });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      readyRef.current = false;
    };
    // The message listener is stable for the lifetime of the iframe; callbacks are read from callbacksRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (readyRef.current) sendInit();
    // Forward relevant settings without reloading the shared iframe or losing its selected location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, variant, initialLatitude, initialLongitude]);

  return (
    <div className="mapbox-central-service">
      <iframe
        ref={iframeRef}
        className="mapbox-central-frame"
        src={service.href}
        title={variant === 'restaurant' ? 'Restaurant map location' : 'Delivery address map'}
        loading="eager"
        style={{ height: `${frameHeight}px`, minHeight: 0 }}
        allow="geolocation"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={sendInit}
        onError={() => setServiceError('The central map service could not be loaded. Please try again later.')}
      />
      {serviceError && <p className="w2t-map-picker-error" role="alert">{serviceError}</p>}
    </div>
  );
}
