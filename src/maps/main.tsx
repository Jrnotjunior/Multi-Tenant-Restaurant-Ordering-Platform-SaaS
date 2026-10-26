import { createRoot } from 'react-dom/client';
import { MapServiceApp } from './MapServiceApp';
import './maps.css';
const rootElement = document.getElementById('map-service-root');
if (!rootElement) throw new Error('Central map service root element is missing.');
createRoot(rootElement).render(<MapServiceApp />);
